const { dinero } = require('./cuentas.util')

const OPERACIONES = ['CONCILIAR', 'REVISAR_DIFERENCIA', 'SALDO_REAL', 'CIERRE']
const RESULTADOS = ['EXITOSO', 'CON_DIFERENCIA', 'RECHAZADO']

/**
 * Historial de conciliaciones (CA20 y CA21): agrega una fila a ConciliacionEvento. Solo se agregan filas,
 * nunca se editan. `db` es prisma o una transaccion; dentro de una transaccion el evento se confirma o se
 * deshace junto con la operacion.
 */
function registrarEvento(
  db,
  { movimientoCajaId = null, cuentaId, periodo, operacion, resultado, estadoAnterior = null, estadoNuevo = null, usuarioId = null, detalle = null }
) {
  return db.conciliacionEvento.create({
    data: { movimientoCajaId, cuentaId, periodo, operacion, resultado, estadoAnterior, estadoNuevo, usuarioId, detalle }
  })
}

/** Forma publica de un evento (con quien, cuando, sobre que movimiento y con que resultado). */
function presentarEvento(evento) {
  return {
    id: evento.id,
    fecha: evento.createdAt,
    operacion: evento.operacion,
    resultado: evento.resultado,
    estadoAnterior: evento.estadoAnterior ?? null,
    estadoNuevo: evento.estadoNuevo ?? null,
    periodo: evento.periodo,
    cuenta: evento.cuenta ? { id: evento.cuenta.id, nombre: evento.cuenta.nombre } : { id: evento.cuentaId },
    movimientoCajaId: evento.movimientoCajaId ?? null,
    movimiento: evento.movimientoCaja
      ? {
          id: evento.movimientoCaja.id,
          concepto: evento.movimientoCaja.concepto,
          tipo: evento.movimientoCaja.tipo,
          monto: dinero(evento.movimientoCaja.monto)
        }
      : null,
    usuario: evento.usuario
      ? { id: evento.usuario.id, nombre: evento.usuario.nombre, apellido: evento.usuario.apellido }
      : evento.usuarioId
        ? { id: evento.usuarioId }
        : null,
    detalle: evento.detalle ?? null
  }
}

module.exports = { OPERACIONES, RESULTADOS, registrarEvento, presentarEvento }
