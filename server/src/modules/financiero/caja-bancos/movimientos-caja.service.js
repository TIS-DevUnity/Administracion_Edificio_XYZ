const prisma = require('../../../config/prisma')
const { errorHttp } = require('../expensas/saldo.util')
const { ultimoCierre } = require('./periodos.util')
const {
  normalizarFiltros,
  construirWhere,
  presentarMovimiento,
  presentarDetalle,
  resumirGrupos,
  armarPaginacion
} = require('./movimientos-caja.util')

const PERSONA = { select: { id: true, nombre: true, apellido: true } }
const INCLUIR_LISTA = {
  cuenta: { select: { id: true, nombre: true, tipo: true } },
  recibo: { select: { metodoPago: true } }
}
const MAX_HISTORIAL = 100

/**
 * Listado del libro de caja y bancos con filtros (periodo o desde/hasta, cuenta, tipo, estado, medio, origen,
 * no conciliados), paginado. El resumen es de TODO lo que cumple el filtro, no solo de la pagina.
 */
async function listar(query = {}) {
  const filtros = normalizarFiltros(query)
  const where = construirWhere(filtros)

  const [movimientos, total, grupos, cierre] = await Promise.all([
    prisma.movimientoCaja.findMany({
      where,
      include: INCLUIR_LISTA,
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      skip: (filtros.numeroPagina - 1) * filtros.tamanio,
      take: filtros.tamanio
    }),
    prisma.movimientoCaja.count({ where }),
    prisma.movimientoCaja.groupBy({ by: ['tipo', 'estado'], where, _sum: { monto: true }, _count: { _all: true } }),
    ultimoCierre(prisma)
  ])

  const { numeroPagina, tamanio, ...aplicados } = filtros
  return {
    filtros: aplicados,
    movimientos: movimientos.map((m) => presentarMovimiento(m, cierre)),
    resumen: resumirGrupos(grupos),
    paginacion: armarPaginacion(numeroPagina, tamanio, total)
  }
}

/** Asiento con lo necesario para presentarlo en una lista (cuenta y metodo de pago del recibo). */
async function buscarParaLista(db, id) {
  const movimiento = await db.movimientoCaja.findUnique({ where: { id }, include: INCLUIR_LISTA })
  if (!movimiento) throw errorHttp('Movimiento no encontrado', 404)
  return movimiento
}

/** Detalle de un asiento: datos, origen (recibo, movimiento o traspaso), extracto, responsables e historial. */
async function obtener(id) {
  const movimiento = await prisma.movimientoCaja.findUnique({
    where: { id },
    include: {
      cuenta: { select: { id: true, nombre: true, tipo: true } },
      recibo: { include: { inmueble: { select: { id: true, codigo: true } } } },
      movimientoFinanciero: { include: { categoria: { select: { id: true, nombre: true } } } },
      registradoPor: PERSONA,
      conciliadoPor: PERSONA,
      eventosConciliacion: {
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORIAL,
        include: { usuario: PERSONA, cuenta: { select: { id: true, nombre: true } } }
      }
    }
  })
  if (!movimiento) throw errorHttp('Movimiento no encontrado', 404)

  const [cierre, contraparte] = await Promise.all([
    ultimoCierre(prisma),
    movimiento.origen === 'TRASPASO' && movimiento.traspasoId
      ? prisma.movimientoCaja.findFirst({
          where: { traspasoId: movimiento.traspasoId, id: { not: movimiento.id } },
          include: { cuenta: { select: { id: true, nombre: true } } }
        })
      : null
  ])
  return presentarDetalle(movimiento, { ultimoCierre: cierre, contraparte })
}

module.exports = { INCLUIR_LISTA, buscarParaLista, listar, obtener }
