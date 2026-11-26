/**
 * Cobro "Extra" opcional de una expensa (pintura del edificio, reparaciones...). Reglas puras, sin base de datos.
 *   montoTotal = montoBase + montoAgua + montoExtra
 * El extra nace en 0 y no lleva concepto; con un monto mayor que cero el concepto es obligatorio.
 */
const { Decimal, errorHttp, parsearMonto } = require('./saldo.util')

const MAX_CONCEPTO = 100
const CONTROL = /[\u0000-\u001f\u007f]/

/** montoTotal de una expensa (sin mora): fija + agua + extra. */
function calcularMontoTotal(montoBase, montoAgua = 0, montoExtra = 0) {
  return new Decimal(montoBase ?? 0).plus(montoAgua ?? 0).plus(montoExtra ?? 0)
}

/**
 * Valida el cobro extra. `montoExtra` >= 0 con maximo 2 decimales. Con monto > 0 el concepto es obligatorio
 * (texto limpio: sin espacios sobrantes ni caracteres de control, maximo 100). Con monto 0 se quita el extra y
 * el concepto se limpia (se ignora lo que llegue). Devuelve { monto: Decimal, concepto: string|null }.
 */
function validarExtra(montoExtra, concepto) {
  const monto = parsearMonto(montoExtra, 'montoExtra', { permitirCero: true })
  if (monto.isZero()) return { monto: new Decimal(0), concepto: null }

  if (concepto === undefined || concepto === null || (typeof concepto === 'string' && concepto.trim() === '')) {
    throw errorHttp('concepto es obligatorio cuando el extra es mayor que cero', 400, { codigo: 'CONCEPTO_REQUERIDO' })
  }
  if (typeof concepto !== 'string') throw errorHttp('concepto debe ser un texto', 400)
  if (CONTROL.test(concepto)) throw errorHttp('concepto no puede tener saltos de linea ni caracteres de control', 400)
  const limpio = concepto.trim().replace(/\s+/g, ' ')
  if (limpio.length > MAX_CONCEPTO) {
    throw errorHttp(`concepto no puede superar ${MAX_CONCEPTO} caracteres`, 400)
  }
  return { monto, concepto: limpio }
}

/** Encabezado de la columna / linea del extra: "Extra Pintura Edificio", o null si la expensa no tiene extra. */
function etiquetaExtra(expensa) {
  if (!expensa || new Decimal(expensa.montoExtra ?? 0).lte(0)) return null
  return expensa.extraConcepto ? `Extra ${expensa.extraConcepto}` : 'Extra'
}

module.exports = { MAX_CONCEPTO, calcularMontoTotal, validarExtra, etiquetaExtra }
