const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { errorHttp } = require('../expensas/saldo.util')
const { dinero } = require('./cuentas.util')
const { periodoAbierto, ultimoCierre, estaCerrado } = require('./periodos.util')
const { registrarEvento, presentarEvento } = require('./eventos.util')
const { presentarMovimiento, armarPaginacion } = require('./movimientos-caja.util')
const { INCLUIR_LISTA, buscarParaLista } = require('./movimientos-caja.service')
const {
  RECHAZOS_REGISTRABLES,
  normalizarObservacion,
  normalizarExtracto,
  compararConExtracto,
  datosDeExtracto,
  detalleDeIntento,
  normalizarFiltrosEventos,
  construirWhereEventos
} = require('./conciliacion.util')
const { saldoConciliadoDe } = require('./saldos.service')

const OPCIONES_TX = { timeout: 15000 }

function yaConciliado() {
  return errorHttp('Este movimiento ya esta conciliado: no se puede conciliar dos veces', 409, {
    codigo: 'ASIENTO_YA_CONCILIADO'
  })
}

/**
 * Comprueba un asiento contra lo que dice el extracto (CA6) sin guardar nada: dice si coincide y, si no,
 * en que campos difiere.
 */
async function comprobar(id, { datos }) {
  const extracto = normalizarExtracto(datos ?? {})
  const asiento = await buscarParaLista(prisma, id)
  const { coincide, diferencias } = compararConExtracto(asiento, extracto)
  const cierre = await ultimoCierre(prisma)
  return {
    movimiento: presentarMovimiento(asiento, cierre),
    coincide,
    diferencias,
    requiereObservacion: !coincide,
    puedeConciliar: asiento.estado !== 'CONCILIADO' && !estaCerrado(asiento.periodo, cierre)
  }
}

/** Un intento rechazado por un 409 tambien queda en el historial. Nunca debe tapar el error original. */
async function registrarRechazo(previo, id, err, usuarioId, extracto) {
  try {
    await registrarEvento(prisma, {
      movimientoCajaId: id,
      cuentaId: previo.cuentaId,
      periodo: previo.periodo,
      operacion: 'CONCILIAR',
      resultado: 'RECHAZADO',
      estadoAnterior: previo.estado,
      usuarioId,
      detalle: {
        motivo: err.codigo,
        mensaje: err.message,
        enviado: { fecha: extracto.fecha, monto: extracto.monto.toFixed(2), tipo: extracto.tipo, referencia: extracto.referencia }
      }
    })
  } catch (errEvento) {
    console.error(`[caja-bancos] No se pudo registrar el intento rechazado: ${errEvento.message}`)
  }
}

/**
 * Concilia un asiento con el extracto (CA5 a CA8, CA10, CA20).
 *  - Si fecha (por dia), monto, tipo y referencia coinciden: pasa a CONCILIADO.
 *  - Si algo difiere: exige una observacion y lo deja CON_DIFERENCIA (sin conciliar, pendiente de revision).
 *  - Un asiento CONCILIADO no se concilia otra vez (409), ni en un periodo cerrado (409).
 * Cada intento queda en ConciliacionEvento.
 */
async function conciliar(id, { datos, usuarioId }) {
  const extracto = normalizarExtracto(datos ?? {})
  const previo = await prisma.movimientoCaja.findUnique({
    where: { id },
    select: { cuentaId: true, periodo: true, estado: true }
  })
  if (!previo) throw errorHttp('Movimiento no encontrado', 404)

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "movimientos_caja" WHERE "id" = ${id} FOR UPDATE`
      const asiento = await tx.movimientoCaja.findUnique({ where: { id } })
      if (!asiento) throw errorHttp('Movimiento no encontrado', 404)

      await periodoAbierto(tx, asiento.periodo)
      if (asiento.estado === 'CONCILIADO') throw yaConciliado()

      const { coincide, diferencias } = compararConExtracto(asiento, extracto)
      if (!coincide && !extracto.observacion) {
        throw errorHttp(
          'Hay diferencias con el extracto: indique una observacion para dejar el movimiento pendiente de revision',
          400,
          { codigo: 'OBSERVACION_REQUERIDA', detalle: { diferencias } }
        )
      }

      const estadoNuevo = coincide ? 'CONCILIADO' : 'CON_DIFERENCIA'
      // UPDATE condicional: aunque dos solicitudes lleguen a la vez, solo una concilia.
      const { count } = await tx.movimientoCaja.updateMany({
        where: { id, estado: { not: 'CONCILIADO' } },
        data: {
          estado: estadoNuevo,
          ...datosDeExtracto(extracto, asiento),
          observacion: extracto.observacion ?? asiento.observacion,
          conciliadoPorId: coincide ? usuarioId : null,
          conciliadoEn: coincide ? new Date() : null
        }
      })
      if (count === 0) throw yaConciliado()

      const actualizado = await tx.movimientoCaja.findUnique({ where: { id }, include: INCLUIR_LISTA })
      await registrarEvento(tx, {
        movimientoCajaId: id,
        cuentaId: asiento.cuentaId,
        periodo: asiento.periodo,
        operacion: 'CONCILIAR',
        resultado: coincide ? 'EXITOSO' : 'CON_DIFERENCIA',
        estadoAnterior: asiento.estado,
        estadoNuevo,
        usuarioId,
        detalle: detalleDeIntento(asiento, extracto, diferencias)
      })
      const saldo = await saldoConciliadoDe(tx, asiento.cuentaId, asiento.periodo)
      return { asiento, actualizado, coincide, diferencias, saldo }
    }, OPCIONES_TX)
  } catch (err) {
    if (RECHAZOS_REGISTRABLES.includes(err.codigo)) await registrarRechazo(previo, id, err, usuarioId, extracto)
    throw err
  }

  const cierre = await ultimoCierre(prisma)
  return {
    movimiento: presentarMovimiento(resultado.actualizado, cierre),
    resultado: resultado.coincide ? 'CONCILIADO' : 'CON_DIFERENCIA',
    coincide: resultado.coincide,
    diferencias: resultado.diferencias,
    saldoConciliado: { cuentaId: resultado.asiento.cuentaId, periodo: resultado.asiento.periodo, saldo: dinero(resultado.saldo) }
  }
}

/**
 * Agrega o cambia la observacion de un asiento (CA8). En un periodo cerrado no se puede (CA16) y un
 * asiento con diferencia no puede quedarse sin observacion.
 */
async function actualizarObservacion(id, { observacion, usuarioId, ip }) {
  if (observacion === undefined) {
    throw errorHttp('Faltan campos obligatorios: observacion', 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: ['observacion'] }
    })
  }
  const texto = normalizarObservacion(observacion)

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "movimientos_caja" WHERE "id" = ${id} FOR UPDATE`
    const antes = await tx.movimientoCaja.findUnique({ where: { id } })
    if (!antes) throw errorHttp('Movimiento no encontrado', 404)

    await periodoAbierto(tx, antes.periodo)
    if (!texto && antes.estado === 'CON_DIFERENCIA') {
      throw errorHttp('Un movimiento con diferencia necesita una observacion', 400, { codigo: 'OBSERVACION_REQUERIDA' })
    }
    if ((antes.observacion ?? null) === texto) return { antes, cambio: false, movimiento: await buscarParaLista(tx, id) }

    await tx.movimientoCaja.update({ where: { id }, data: { observacion: texto } })
    return { antes, cambio: true, movimiento: await buscarParaLista(tx, id) }
  }, OPCIONES_TX)

  if (resultado.cambio) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'MovimientoCaja',
      entidadId: id,
      detalle: { observacion: { antes: resultado.antes.observacion ?? null, despues: texto } },
      ip
    })
  }
  return presentarMovimiento(resultado.movimiento, await ultimoCierre(prisma))
}

/** Historial de conciliaciones (CA21): quien, cuando, sobre que movimiento, con que estados y resultado. */
async function listarEventos(query = {}) {
  const filtros = normalizarFiltrosEventos(query)
  const where = construirWhereEventos(filtros)

  const [eventos, total] = await Promise.all([
    prisma.conciliacionEvento.findMany({
      where,
      include: {
        usuario: { select: { id: true, nombre: true, apellido: true } },
        cuenta: { select: { id: true, nombre: true } },
        movimientoCaja: { select: { id: true, concepto: true, tipo: true, monto: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (filtros.numeroPagina - 1) * filtros.tamanio,
      take: filtros.tamanio
    }),
    prisma.conciliacionEvento.count({ where })
  ])
  return { eventos: eventos.map(presentarEvento), paginacion: armarPaginacion(filtros.numeroPagina, filtros.tamanio, total) }
}

module.exports = { comprobar, conciliar, actualizarObservacion, listarEventos }
