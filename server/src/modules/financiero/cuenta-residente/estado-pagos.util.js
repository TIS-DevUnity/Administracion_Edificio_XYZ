/**
 * Estado de pagos de un copropietario (HU14: requisito para reservar areas comunes). Reglas puras, sin
 * base de datos: recibe datos planos y `hoy`. Todo el dinero va con Decimal.
 *
 * Reglas
 *  - Vencida: fechaCalendario(fechaVencimiento) < hoy (hoy en America/La_Paz). Vencer hoy NO es vencida.
 *    No se consideran dias de gracia (igual que el listado de morosos).
 *  - Cuenta lo que falta pagar de la expensa (monto + mora, via pendientesDe) y de las cuotas de planes de
 *    pago activos. Las expensas cubiertas por un plan no se cuentan aparte: solo sus cuotas vencidas.
 *  - El saldo a favor de cada departamento se resta de SU deuda vencida; nunca se compensa entre
 *    departamentos. Si no la cubre toda, queda el remanente como deuda vencida.
 *  - Sin departamentos a cargo: al dia.
 */
const { Decimal, pendientesDe } = require('../expensas/saldo.util')
const { fechaEnZona, fechaCalendario } = require('../expensas/mora.util')

const CERO = new Decimal(0)
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

const dinero = (valor) => new Decimal(valor ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

/** `hoy` como YYYY-MM-DD: acepta ese texto, una Date (se lee en hora de Bolivia) o nada (ahora). */
function normalizarHoy(hoy) {
  if (typeof hoy === 'string' && SOLO_FECHA.test(hoy)) return hoy
  return fechaEnZona(hoy instanceof Date ? hoy : new Date())
}

/** Lineas vencidas de un departamento: expensas (sin plan) y cuotas de plan, con lo que falta pagar. */
function lineasVencidas({ expensas = [], cuotas = [] }, hoy) {
  const lineas = []

  for (const expensa of expensas) {
    if (expensa.planPagoId || expensa.estado === 'PAGADA') continue // las del plan se cobran por cuotas
    const vencimiento = fechaCalendario(expensa.fechaVencimiento)
    if (vencimiento >= hoy) continue
    const { total } = pendientesDe(expensa)
    if (total.lte(0)) continue
    lineas.push({ concepto: 'Expensa', periodo: expensa.periodo, monto: total, vencimiento })
  }

  for (const cuota of cuotas) {
    if (cuota.estado === 'PAGADA') continue
    const vencimiento = fechaCalendario(cuota.fechaVencimiento)
    if (vencimiento >= hoy) continue
    const pendiente = Decimal.max(new Decimal(cuota.monto).minus(cuota.montoPagado ?? 0), CERO)
    if (pendiente.lte(0)) continue
    lineas.push({
      concepto: `Cuota ${cuota.numero} plan de pago`,
      periodo: vencimiento.slice(0, 7),
      monto: pendiente,
      vencimiento
    })
  }

  return lineas
}

/**
 * departamentos: [{ expensas: [{ periodo, fechaVencimiento, montoTotal, montoMora, pagos, planPagoId, estado }],
 *                  cuotas: [{ numero, monto, montoPagado, fechaVencimiento, estado }], saldoFavor }]
 * Las cuotas deben ser solo las de planes ACTIVOS.
 */
function evaluarEstadoPagos({ departamentos = [], hoy } = {}) {
  const dia = normalizarHoy(hoy)
  let deudaVencida = CERO
  const detalle = []

  for (const departamento of departamentos) {
    const lineas = lineasVencidas(departamento, dia)
    const deuda = lineas.reduce((acc, l) => acc.plus(l.monto), CERO)
    const remanente = Decimal.max(deuda.minus(departamento.saldoFavor ?? 0), CERO)
    if (remanente.lte(0)) continue // sin deuda vencida, o el saldo a favor la cubre completa
    deudaVencida = deudaVencida.plus(remanente)
    lineas
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.concepto.localeCompare(b.concepto))
      .forEach((l) => detalle.push({ concepto: l.concepto, periodo: l.periodo, monto: dinero(l.monto), vencimiento: l.vencimiento }))
  }

  return { alDia: deudaVencida.lte(0), deudaVencida: dinero(deudaVencida), detalle }
}

module.exports = { evaluarEstadoPagos, lineasVencidas, normalizarHoy }
