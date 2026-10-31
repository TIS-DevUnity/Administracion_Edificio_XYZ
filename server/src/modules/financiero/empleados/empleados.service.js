const prisma = require('../../../config/prisma')
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const util = require('./empleados.util')

const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const CERO = new Decimal(0)
const ULTIMAS_NOMINAS = 6

function normalizarPagina(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

function errorDocumentoDuplicado(documento) {
  return errorHttp(`Ya existe un empleado con el documento ${documento}`, 409, {
    codigo: 'DOCUMENTO_DUPLICADO',
    detalle: { documento }
  })
}

/** Una alta o edicion que se cruzo con otra con el mismo documento: gana la primera. */
function traducirErrorUnico(err, documento) {
  if (err?.code === 'P2002') return errorDocumentoDuplicado(documento)
  return err
}

async function existeDocumento(db, documento, excluirId) {
  const otro = await db.empleado.findFirst({
    where: { documento, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true }
  })
  return Boolean(otro)
}

async function crear({ datos, usuarioId, ip }) {
  const valores = util.validarDatosAlta(datos)
  if (await existeDocumento(prisma, valores.documento)) throw errorDocumentoDuplicado(valores.documento)

  let empleado
  try {
    empleado = await prisma.empleado.create({
      data: { ...valores, estado: 'ACTIVO', registradoPorId: usuarioId ?? null }
    })
  } catch (err) {
    throw traducirErrorUnico(err, valores.documento)
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Empleado',
    entidadId: empleado.id,
    detalle: {
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      documento: empleado.documento,
      cargo: empleado.cargo,
      sueldoBase: util.dinero(empleado.sueldoBase)
    },
    ip
  })
  return util.empleadoParaCliente(empleado)
}

async function listar({ estado, q, pagina, porPagina } = {}) {
  const estadoFiltro = util.normalizarFiltroEstado(estado)
  const busqueda = util.normalizarBusqueda(q)
  const { numeroPagina, tamanio } = normalizarPagina(pagina, porPagina)

  const where = {
    ...(estadoFiltro ? { estado: estadoFiltro } : {}),
    ...(busqueda
      ? {
          OR: ['nombres', 'apellidos', 'documento', 'cargo'].map((campo) => ({
            [campo]: { contains: busqueda, mode: 'insensitive' }
          }))
        }
      : {})
  }

  const [empleados, total] = await Promise.all([
    prisma.empleado.findMany({
      where,
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.empleado.count({ where })
  ])

  return {
    empleados: empleados.map(util.empleadoParaCliente),
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

async function obtener(id) {
  const empleado = await prisma.empleado.findUnique({ where: { id } })
  if (!empleado) throw errorHttp('Empleado no encontrado', 404)

  const [cantidadNominas, ultimas, anticipos] = await Promise.all([
    prisma.nomina.count({ where: { empleadoId: id } }),
    prisma.nomina.findMany({
      where: { empleadoId: id },
      orderBy: { periodo: 'desc' },
      take: ULTIMAS_NOMINAS,
      select: { id: true, periodo: true, sueldoNeto: true, estado: true }
    }),
    prisma.anticipoSalarial.findMany({
      where: { empleadoId: id, estado: { in: ['PENDIENTE', 'PARCIAL'] } },
      select: { monto: true, montoDescontado: true }
    })
  ])
  const anticiposPendientes = anticipos.reduce(
    (acc, a) => acc.plus(new Decimal(a.monto).minus(a.montoDescontado)),
    CERO
  )

  return {
    empleado: util.empleadoParaCliente(empleado),
    resumen: {
      cantidadNominas,
      anticiposPendientes: anticiposPendientes.toFixed(2),
      cantidadAnticiposPendientes: anticipos.length,
      ultimasNominas: ultimas.map((n) => ({
        id: n.id,
        periodo: n.periodo,
        sueldoNeto: util.dinero(n.sueldoNeto),
        estado: n.estado
      }))
    }
  }
}

/**
 * Edita los campos enviados. Un cambio de sueldoBase solo vale para las nominas que se generen despues:
 * cada nomina guarda su propia copia del sueldo, asi que aqui no se toca ninguna.
 */
async function actualizar(id, { datos, usuarioId, ip }) {
  const valores = util.validarDatosEdicion(datos)

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const antes = await tx.empleado.findUnique({ where: { id } })
      if (!antes) throw errorHttp('Empleado no encontrado', 404)
      if (valores.documento && valores.documento !== antes.documento && (await existeDocumento(tx, valores.documento, id))) {
        throw errorDocumentoDuplicado(valores.documento)
      }
      const despues = await tx.empleado.update({ where: { id }, data: valores })
      return { antes, despues }
    })
  } catch (err) {
    throw traducirErrorUnico(err, valores.documento)
  }

  const { antes, despues } = resultado
  const cambios = util.diferenciasEmpleado(antes, despues, Object.keys(valores))
  if (Object.keys(cambios).length > 0) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Empleado',
      entidadId: id,
      detalle: cambios,
      ip
    })
  }
  return util.empleadoParaCliente(despues)
}

/** Activo/Inactivo. Un inactivo conserva su historial; pedir el estado que ya tiene no es un error. */
async function cambiarEstado(id, { estado, usuarioId, ip }) {
  const nuevo = util.normalizarEstado(estado)

  const resultado = await prisma.$transaction(async (tx) => {
    const antes = await tx.empleado.findUnique({ where: { id } })
    if (!antes) throw errorHttp('Empleado no encontrado', 404)
    if (antes.estado === nuevo) return { antes, despues: antes, cambio: false }
    const despues = await tx.empleado.update({ where: { id }, data: { estado: nuevo } })
    return { antes, despues, cambio: true }
  })

  if (resultado.cambio) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Empleado',
      entidadId: id,
      detalle: { estado: { antes: resultado.antes.estado, despues: resultado.despues.estado } },
      ip
    })
  }
  return { empleado: util.empleadoParaCliente(resultado.despues), cambio: resultado.cambio }
}

module.exports = { crear, listar, obtener, actualizar, cambiarEstado }
