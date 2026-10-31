const prisma = require('../../../config/prisma')
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const personal = require('../caja-bancos/asientos-personal.util')
const util = require('./anticipos.util')

const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const OPCIONES_TX = { timeout: 15000 }
const CERO = new Decimal(0)

const INCLUIR_EMPLEADO = { select: { id: true, nombres: true, apellidos: true, cargo: true, documento: true } }

function normalizarPagina(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

/**
 * Registra un anticipo a un empleado ACTIVO y, si CAJA_BANCOS_ASIENTOS esta activo, su egreso en el libro de
 * caja, todo en una transaccion: si el periodo de caja esta cerrado (409 PERIODO_CERRADO) no se guarda nada.
 * Con el interruptor apagado el anticipo se registra igual, sin asiento y sin tocar ninguna cuenta.
 * Un anticipo se descuenta en la PROXIMA nomina que se genere; no modifica nominas ya generadas.
 */
async function crear({ datos, usuarioId, ip }) {
  const valores = util.validarDatosAnticipo(datos)
  const cuentaId = personal.normalizarCuentaAnticipo(datos.cuentaId) // formato, antes de abrir la transaccion

  const resultado = await prisma.$transaction(async (tx) => {
    // Bloquea al empleado: no puede inactivarse entre la comprobacion y el alta.
    await tx.$queryRaw`SELECT "id" FROM "empleados" WHERE "id" = ${valores.empleadoId} FOR UPDATE`
    const empleado = await tx.empleado.findUnique({ where: { id: valores.empleadoId } })
    if (!empleado) throw errorHttp('Empleado no encontrado', 404)
    if (empleado.estado !== 'ACTIVO') {
      throw errorHttp('El empleado esta inactivo: no se le pueden registrar anticipos', 409, {
        codigo: 'EMPLEADO_INACTIVO',
        detalle: { empleadoId: empleado.id }
      })
    }

    const destino = await personal.prepararAsientoAnticipo(tx, {
      metodoPago: valores.metodoPago,
      fecha: valores.fechaTexto,
      cuentaId
    })

    const anticipo = await tx.anticipoSalarial.create({
      data: {
        empleadoId: empleado.id,
        monto: valores.monto,
        montoDescontado: CERO,
        fecha: valores.fecha,
        metodoPago: valores.metodoPago,
        descripcion: valores.descripcion,
        estado: 'PENDIENTE',
        registradoPorId: usuarioId ?? null
      },
      include: { empleado: INCLUIR_EMPLEADO }
    })
    const asiento = destino ? await personal.crearAsientoAnticipo(tx, anticipo, empleado, destino) : null
    return { anticipo, asiento, cuenta: destino?.cuenta ?? null }
  }, OPCIONES_TX)

  const { anticipo, asiento, cuenta } = resultado
  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'AnticipoSalarial',
    entidadId: anticipo.id,
    detalle: {
      empleado: `${anticipo.empleado.nombres} ${anticipo.empleado.apellidos}`,
      documento: anticipo.empleado.documento,
      monto: util.dinero(anticipo.monto),
      fecha: valores.fechaTexto,
      metodoPago: anticipo.metodoPago,
      descripcion: anticipo.descripcion,
      cuenta: cuenta ? { id: cuenta.id, nombre: cuenta.nombre } : null,
      asientoId: asiento?.id ?? null
    },
    ip
  })

  return {
    anticipo: util.anticipoParaCliente({
      ...anticipo,
      asiento: asiento && { ...asiento, cuenta }
    })
  }
}

function filtrosDe({ empleadoId, estado, desde, hasta }) {
  const rango = util.normalizarRango(desde, hasta)
  const empleado = util.normalizarFiltroEmpleado(empleadoId)
  const est = util.normalizarFiltroEstado(estado)
  return {
    ...(empleado ? { empleadoId: empleado } : {}),
    ...(est ? { estado: est } : {}),
    ...(rango.desde || rango.hasta
      ? {
          fecha: {
            ...(rango.desde ? { gte: new Date(`${rango.desde}T00:00:00Z`) } : {}),
            ...(rango.hasta ? { lte: new Date(`${rango.hasta}T00:00:00Z`) } : {})
          }
        }
      : {})
  }
}

async function listar({ empleadoId, estado, desde, hasta, pagina, porPagina } = {}) {
  const where = filtrosDe({ empleadoId, estado, desde, hasta })
  const { numeroPagina, tamanio } = normalizarPagina(pagina, porPagina)

  const [anticipos, total, suma] = await Promise.all([
    prisma.anticipoSalarial.findMany({
      where,
      include: { empleado: INCLUIR_EMPLEADO },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.anticipoSalarial.count({ where }),
    // El resumen es del filtro completo, no solo de la pagina.
    prisma.anticipoSalarial.aggregate({ where, _sum: { monto: true, montoDescontado: true } })
  ])

  const otorgado = new Decimal(suma._sum.monto ?? 0)
  const descontado = new Decimal(suma._sum.montoDescontado ?? 0)
  return {
    anticipos: anticipos.map(util.anticipoParaCliente),
    resumen: {
      cantidad: total,
      totalOtorgado: otorgado.toFixed(2),
      totalDescontado: descontado.toFixed(2),
      totalPendiente: otorgado.minus(descontado).toFixed(2)
    },
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

/** Control de pendientes: por empleado, lo que falta descontar de sus anticipos PENDIENTE o PARCIAL. */
async function pendientes() {
  const grupos = await prisma.anticipoSalarial.groupBy({
    by: ['empleadoId'],
    where: { estado: { in: ['PENDIENTE', 'PARCIAL'] } },
    _count: { _all: true },
    _sum: { monto: true, montoDescontado: true }
  })
  const empleados = await prisma.empleado.findMany({
    where: { id: { in: grupos.map((g) => g.empleadoId) } },
    select: { id: true, nombres: true, apellidos: true, cargo: true, documento: true, estado: true }
  })
  const porId = new Map(empleados.map((e) => [e.id, e]))

  const filas = grupos
    .map((g) => ({
      empleado: porId.get(g.empleadoId),
      cantidad: g._count._all,
      pendiente: new Decimal(g._sum.monto ?? 0).minus(g._sum.montoDescontado ?? 0)
    }))
    .sort(
      (a, b) =>
        a.empleado.apellidos.localeCompare(b.empleado.apellidos, 'es') ||
        a.empleado.nombres.localeCompare(b.empleado.nombres, 'es')
    )

  const totalGeneral = filas.reduce((acc, f) => acc.plus(f.pendiente), CERO)
  return {
    pendientes: filas.map((f) => ({
      empleado: f.empleado,
      cantidad: f.cantidad,
      totalPendiente: f.pendiente.toFixed(2)
    })),
    cantidadEmpleados: filas.length,
    totalGeneral: totalGeneral.toFixed(2)
  }
}

async function obtener(id) {
  const anticipo = await prisma.anticipoSalarial.findUnique({
    where: { id },
    include: {
      empleado: INCLUIR_EMPLEADO,
      aplicaciones: {
        include: { nomina: { select: { id: true, periodo: true, estado: true } } },
        orderBy: { createdAt: 'asc' }
      },
      asiento: { select: { id: true, cuentaId: true, periodo: true, estado: true, cuenta: { select: { nombre: true } } } }
    }
  })
  if (!anticipo) throw errorHttp('Anticipo no encontrado', 404)
  return { anticipo: util.anticipoParaCliente(anticipo) }
}

module.exports = { crear, listar, pendientes, obtener }
