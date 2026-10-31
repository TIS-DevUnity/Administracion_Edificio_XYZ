/**
 * Asientos del libro de caja para el personal (HU8): egreso de un anticipo salarial. Variante de
 * asientos.util.js (que no se modifica) que reutiliza sus funciones:
 *  - la cuenta es la indicada (`cuentaId`) o la cuenta por defecto que corresponde al metodo de pago
 *    (efectivo -> caja; el resto -> banco);
 *  - el periodo de la fecha debe estar abierto (409 PERIODO_CERRADO);
 *  - los saldos de las cuentas se calculan a partir de los asientos: `cuentas_bancarias.saldoActual` esta
 *    en desuso y no se escribe, igual que en los gastos de movimientos.
 * Respeta CAJA_BANCOS_ASIENTOS: con el interruptor apagado `prepararAsientoAnticipo` devuelve null y no se
 * crea ningun asiento (el anticipo se registra igual).
 */
const { asientosActivos } = require('./activacion.util')
const { normalizarCuentaId, resolverCuenta } = require('./asientos.util')
const { tipoDeCuentaPara } = require('./cuentas.util')
const { periodoDeDia, instanteDeDia, periodoAbierto } = require('./periodos.util')

/** Concepto del asiento: "Anticipo salarial - Apellidos Nombres". */
function conceptoAnticipo(empleado) {
  return `Anticipo salarial - ${empleado.apellidos} ${empleado.nombres}`
}

/**
 * Formato de `cuentaId` (se valida antes de abrir la transaccion). Con los asientos apagados no se usa y
 * devuelve null.
 */
function normalizarCuentaAnticipo(cuentaId) {
  return asientosActivos() ? normalizarCuentaId(cuentaId) : null
}

/**
 * Dentro de la transaccion y antes de crear el anticipo: comprueba el periodo abierto y decide la cuenta.
 * Con `cuentaId` la cuenta debe existir, estar activa y ser del tipo que corresponde al metodo de pago.
 * Devuelve el destino para `crearAsientoAnticipo`, o null si los asientos estan apagados.
 * `fecha` es el dia del anticipo (YYYY-MM-DD).
 */
async function prepararAsientoAnticipo(tx, { metodoPago, fecha, cuentaId }) {
  if (!asientosActivos()) return null
  const periodo = periodoDeDia(fecha)
  await periodoAbierto(tx, periodo)
  const cuenta = await resolverCuenta(tx, {
    cuentaId,
    tipoPorDefecto: tipoDeCuentaPara(metodoPago),
    exigirTipo: true
  })
  return { cuenta, periodo }
}

/** Crea el egreso (PENDIENTE de conciliar) de un anticipo ya creado, en la misma transaccion. */
function crearAsientoAnticipo(tx, anticipo, empleado, { cuenta, periodo }) {
  return tx.movimientoCaja.create({
    data: {
      cuentaId: cuenta.id,
      tipo: 'EGRESO',
      monto: anticipo.monto,
      concepto: conceptoAnticipo(empleado),
      fecha: instanteDeDia(anticipo.fecha),
      periodo,
      origen: 'ANTICIPO_SALARIAL',
      anticipoSalarialId: anticipo.id,
      registradoPorId: anticipo.registradoPorId ?? null
    }
  })
}

module.exports = {
  conceptoAnticipo,
  normalizarCuentaAnticipo,
  prepararAsientoAnticipo,
  crearAsientoAnticipo
}
