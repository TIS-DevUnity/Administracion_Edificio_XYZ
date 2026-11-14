/**
 * Balance general gerencial a la fecha de emision (HU13): reglas puras, sin base de datos. Recibe los saldos ya
 * leidos y arma el balance; la vista previa JSON y el PDF salen del mismo resultado. Todo el dinero va con Decimal.
 *
 *   patrimonio = activos - pasivos            (activos = pasivos + patrimonio)
 */
const { Decimal } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')

const CERO = new Decimal(0)
const TITULO = 'Balance general'
const TIPO_REPORTE = 'BALANCE_GENERAL'
const NOTA =
  'Balance gerencial a la fecha de emisión, basado en lo registrado; no incluye activos fijos, proveedores, reservas ni depreciación'

const dinero = (valor) => new Decimal(valor ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
const suma = (valores) => valores.reduce((acc, v) => acc.plus(v), CERO)

/** Anticipos a empleados que aun no se descontaron: monto - montoDescontado de cada uno (nunca negativo). */
function anticiposPendientes(anticipos = []) {
  const montos = anticipos.map((a) => Decimal.max(new Decimal(a.monto).minus(a.montoDescontado ?? 0), CERO))
  return { monto: suma(montos), cantidad: montos.filter((m) => m.gt(0)).length }
}

const linea = (concepto, monto, cantidad = null) => ({ concepto, cantidad, monto: dinero(monto) })

function grupo(nombre, lineas) {
  return { nombre, lineas, subtotal: dinero(suma(lineas.map((l) => l.monto))) }
}

const totalDe = (grupos) => suma(grupos.map((g) => g.subtotal))

/**
 * Arma el balance. Entradas (todas con monto y, si corresponde, cantidad):
 * `efectivo` (saldo del edificio), `cuentasPorCobrar`, `anticiposPendientes`, `saldosAFavor`, `sueldosPorPagar`.
 */
function construirBalanceGeneral({
  efectivo = 0,
  cuentasPorCobrar = { monto: 0, cantidad: 0 },
  anticiposPendientes: anticipos = { monto: 0, cantidad: 0 },
  saldosAFavor = 0,
  sueldosPorPagar = { monto: 0, cantidad: 0 },
  generadoPor = null,
  generadoEn = new Date()
} = {}) {
  const grupoActivos = [
    grupo('Efectivo y bancos', [linea('Saldo del edificio (ingresos menos gastos registrados)', efectivo)]),
    grupo('Cuentas por cobrar', [
      linea('Expensas pendientes de cobro (con mora aplicada)', cuentasPorCobrar.monto, cuentasPorCobrar.cantidad),
      linea('Anticipos a empleados pendientes de descontar', anticipos.monto, anticipos.cantidad)
    ])
  ]
  const grupoPasivos = [
    grupo('Obligaciones con residentes', [linea('Saldos a favor de residentes', saldosAFavor)]),
    grupo('Obligaciones con el personal', [linea('Sueldos por pagar (nóminas pendientes)', sueldosPorPagar.monto, sueldosPorPagar.cantidad)])
  ]

  const totalActivos = totalDe(grupoActivos)
  const totalPasivos = totalDe(grupoPasivos)
  const totalPatrimonio = totalActivos.minus(totalPasivos)
  const patrimonio = [grupo('Patrimonio', [linea('Patrimonio del edificio (activos menos pasivos)', totalPatrimonio)])]

  // Se verifica con los importes ya redondeados que ve el lector, no con los internos.
  const pasivosMasPatrimonio = new Decimal(dinero(totalPasivos)).plus(dinero(totalPatrimonio))

  return {
    titulo: TITULO,
    tipoReporte: TIPO_REPORTE,
    fechaCorte: fechaEnZona(generadoEn),
    generadoEn: new Date(generadoEn).toISOString(),
    generadoPor,
    nota: NOTA,
    activos: { grupos: grupoActivos, total: dinero(totalActivos) },
    pasivos: { grupos: grupoPasivos, total: dinero(totalPasivos) },
    patrimonio: { grupos: patrimonio, total: dinero(totalPatrimonio) },
    verificacion: {
      formula: 'activos = pasivos + patrimonio',
      activos: dinero(totalActivos),
      pasivosMasPatrimonio: dinero(pasivosMasPatrimonio),
      coincide: new Decimal(dinero(totalActivos)).eq(pasivosMasPatrimonio)
    }
  }
}

module.exports = { TITULO, TIPO_REPORTE, NOTA, anticiposPendientes, construirBalanceGeneral }
