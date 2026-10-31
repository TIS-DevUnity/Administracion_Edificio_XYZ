const { randomUUID } = require('node:crypto')
const prisma = require('../../../config/prisma')
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const util = require('./nomina.util')

const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200

const INCLUIR_EMPLEADO = { select: { id: true, nombres: true, apellidos: true, cargo: true, documento: true } }
const INCLUIR_DETALLE = {
  empleado: INCLUIR_EMPLEADO,
  conceptos: { orderBy: { createdAt: 'asc' } },
  anticiposAplicados: { include: { anticipo: { select: { id: true, fecha: true, monto: true } } }, orderBy: { createdAt: 'asc' } }
}

function normalizarPagina(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

// ---------------------------------------------------------------------------
// Generacion mensual
// ---------------------------------------------------------------------------

/**
 * Crea una nomina PENDIENTE por cada empleado ACTIVO que ya habia ingresado a mas tardar el ultimo dia del
 * periodo y que todavia no tiene nomina de ese periodo. Copia el sueldo base actual del empleado. Es
 * idempotente: las que ya existen se omiten (createMany con skipDuplicates, porque un P2002 dentro de una
 * transaccion de Postgres la abortaria si dos generaciones se cruzan).
 * totalAnticipos sale de las aplicaciones de anticipo de la nomina (hoy ninguna: 0).
 */
async function generar({ periodo, usuarioId, ip }) {
  const per = util.validarPeriodoGenerable(periodo)
  const ultimoDia = util.ultimoDiaDelPeriodo(per)

  const { creadas, omitidas } = await prisma.$transaction(async (tx) => {
    const empleados = await tx.empleado.findMany({
      where: { estado: 'ACTIVO', fechaIngreso: { lte: new Date(`${ultimoDia}T00:00:00Z`) } },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }]
    })
    const existentes = await tx.nomina.findMany({
      where: { periodo: per, empleadoId: { in: empleados.map((e) => e.id) } },
      select: { empleadoId: true }
    })
    const yaTienen = new Set(existentes.map((n) => n.empleadoId))
    const faltantes = empleados.filter((e) => !yaTienen.has(e.id))

    // Ids propios para saber cuales se insertaron de verdad aunque otra generacion se haya cruzado.
    const filas = faltantes.map((e) => {
      const totales = util.calcularTotales([], e.sueldoBase, 0)
      return {
        id: randomUUID(),
        empleadoId: e.id,
        periodo: per,
        sueldoBase: totales.sueldoBase,
        ...util.totalesParaGuardar(totales),
        estado: 'PENDIENTE',
        registradoPorId: usuarioId ?? null
      }
    })
    if (filas.length) await tx.nomina.createMany({ data: filas, skipDuplicates: true })
    const insertadas = filas.length
      ? await tx.nomina.findMany({
          where: { id: { in: filas.map((f) => f.id) } },
          include: { empleado: INCLUIR_EMPLEADO },
          orderBy: [{ empleado: { apellidos: 'asc' } }, { empleado: { nombres: 'asc' } }]
        })
      : []
    return { creadas: insertadas, omitidas: empleados.length - insertadas.length }
  })

  for (const nomina of creadas) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'Nomina',
      entidadId: nomina.id,
      detalle: {
        periodo: per,
        empleado: `${nomina.empleado.nombres} ${nomina.empleado.apellidos}`,
        documento: nomina.empleado.documento,
        sueldoBase: util.dinero(nomina.sueldoBase)
      },
      ip
    })
  }

  return {
    periodo: per,
    creadas: creadas.length,
    omitidas,
    nominas: creadas.map(util.nominaParaCliente)
  }
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

async function listar({ periodo, estado, q, pagina, porPagina } = {}) {
  const per = util.normalizarFiltroPeriodo(periodo)
  const est = util.normalizarFiltroEstado(estado)
  const busqueda = util.normalizarBusqueda(q)
  const { numeroPagina, tamanio } = normalizarPagina(pagina, porPagina)

  const where = {
    ...(per ? { periodo: per } : {}),
    ...(est ? { estado: est } : {}),
    ...(busqueda
      ? {
          empleado: {
            OR: ['nombres', 'apellidos', 'documento'].map((campo) => ({
              [campo]: { contains: busqueda, mode: 'insensitive' }
            }))
          }
        }
      : {})
  }

  const [nominas, total, porEstado] = await Promise.all([
    prisma.nomina.findMany({
      where,
      include: { empleado: INCLUIR_EMPLEADO },
      orderBy: [{ periodo: 'desc' }, { empleado: { apellidos: 'asc' } }, { empleado: { nombres: 'asc' } }, { id: 'asc' }],
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.nomina.count({ where }),
    // El resumen es del filtro completo, no solo de la pagina.
    prisma.nomina.groupBy({ by: ['estado'], where, _count: { _all: true }, _sum: { sueldoNeto: true } })
  ])

  const grupo = (e) => {
    const g = porEstado.find((x) => x.estado === e)
    return { cantidad: g?._count._all ?? 0, total: util.dinero(g?._sum.sueldoNeto) }
  }

  return {
    nominas: nominas.map(util.nominaParaCliente),
    resumen: { cantidad: total, pendientes: grupo('PENDIENTE'), pagadas: grupo('PAGADA') },
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

async function obtener(id) {
  const nomina = await prisma.nomina.findUnique({ where: { id }, include: INCLUIR_DETALLE })
  if (!nomina) throw errorHttp('Nomina no encontrada', 404)
  return { nomina: util.nominaParaCliente(nomina) }
}

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------

/**
 * Ejecuta un cambio de conceptos sobre una nomina PENDIENTE, dentro de una transaccion y con la fila
 * de la nomina bloqueada (dos cambios simultaneos esperan su turno). `cambiar(tx, nomina)` recibe la
 * nomina con sus conceptos y devuelve { conceptos, escribir, afectado }:
 *   - `conceptos`: la lista de conceptos que quedara (para calcular el neto antes de escribir);
 *   - `escribir(tx)`: aplica el cambio a la tabla de conceptos;
 *   - `afectado`: el concepto para la auditoria.
 * Los totales se recalculan siempre aqui, nunca desde el cliente. Si el neto quedaria negativo se rechaza
 * (400 NETO_NEGATIVO) y no se guarda nada.
 */
async function modificarConceptos(nominaId, { cambiar, accion, usuarioId, ip }) {
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "nominas" WHERE "id" = ${nominaId} FOR UPDATE`
    const nomina = await tx.nomina.findUnique({ where: { id: nominaId }, include: { conceptos: true } })
    if (!nomina) throw errorHttp('Nomina no encontrada', 404)
    if (nomina.estado !== 'PENDIENTE') {
      throw errorHttp('La nomina ya esta pagada: sus conceptos no se pueden modificar', 409, {
        codigo: 'NOMINA_PAGADA',
        detalle: { periodo: nomina.periodo }
      })
    }

    const cambio = await cambiar(tx, nomina)
    const aplicaciones = await tx.aplicacionAnticipo.findMany({ where: { nominaId }, select: { monto: true } })
    const totales = util.validarNetoNoNegativo(
      util.calcularTotales(cambio.conceptos, nomina.sueldoBase, util.totalAnticiposAplicados(aplicaciones))
    )

    await cambio.escribir(tx)
    await tx.nomina.update({ where: { id: nominaId }, data: util.totalesParaGuardar(totales) })
    const actualizada = await tx.nomina.findUnique({ where: { id: nominaId }, include: INCLUIR_DETALLE })
    return { nomina: actualizada, netoAntes: util.dinero(nomina.sueldoNeto), afectado: cambio.afectado }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Nomina',
    entidadId: nominaId,
    detalle: {
      periodo: resultado.nomina.periodo,
      concepto: { accion, ...resultado.afectado },
      sueldoNeto: { antes: resultado.netoAntes, despues: util.dinero(resultado.nomina.sueldoNeto) }
    },
    ip
  })
  return { nomina: util.nominaParaCliente(resultado.nomina) }
}

const resumenConcepto = (c) => ({
  conceptoId: c.id ?? null,
  tipo: c.tipo,
  descripcion: c.descripcion,
  monto: util.dinero(c.monto),
  horas: c.horas === null || c.horas === undefined ? null : new Decimal(c.horas).toFixed(2)
})

function agregarConcepto(nominaId, { datos, usuarioId, ip }) {
  const concepto = util.validarConcepto(datos)
  const id = randomUUID()
  return modificarConceptos(nominaId, {
    accion: 'AGREGAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => ({
      conceptos: [...nomina.conceptos, concepto],
      escribir: (db) => db.conceptoNomina.create({ data: { id, nominaId, ...concepto } }),
      afectado: resumenConcepto({ id, ...concepto })
    })
  })
}

function buscarConcepto(nomina, conceptoId) {
  const concepto = nomina.conceptos.find((c) => c.id === conceptoId)
  if (!concepto) throw errorHttp('Concepto no encontrado en esta nomina', 404)
  return concepto
}

function editarConcepto(nominaId, conceptoId, { datos, usuarioId, ip }) {
  return modificarConceptos(nominaId, {
    accion: 'EDITAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => {
      const actual = buscarConcepto(nomina, conceptoId)
      const nuevo = util.validarEdicionConcepto(actual, datos)
      return {
        conceptos: nomina.conceptos.map((c) => (c.id === conceptoId ? { ...c, ...nuevo } : c)),
        escribir: (db) =>
          db.conceptoNomina.update({
            where: { id: conceptoId },
            data: { descripcion: nuevo.descripcion, monto: nuevo.monto, horas: nuevo.horas }
          }),
        afectado: { ...resumenConcepto({ id: conceptoId, ...nuevo }), antes: resumenConcepto(actual) }
      }
    }
  })
}

function quitarConcepto(nominaId, conceptoId, { usuarioId, ip }) {
  return modificarConceptos(nominaId, {
    accion: 'QUITAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => {
      const actual = buscarConcepto(nomina, conceptoId)
      return {
        conceptos: nomina.conceptos.filter((c) => c.id !== conceptoId),
        escribir: (db) => db.conceptoNomina.delete({ where: { id: conceptoId } }),
        afectado: resumenConcepto(actual)
      }
    }
  })
}

module.exports = { generar, listar, obtener, agregarConcepto, editarConcepto, quitarConcepto }
