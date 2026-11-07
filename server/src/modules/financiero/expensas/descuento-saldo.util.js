/**
 * Dia del mes en que se descuenta el saldo a favor (ConfiguracionMora.diaDescuentoSaldo). Reglas puras, sin
 * base de datos:
 *  - Antes de ese dia (hora de Bolivia) ni `generar` ni `cargarAgua` usan el saldo: el administrador alcanza
 *    a cargar el agua. A partir de ese dia el descuento lo hace `ejecutarDescuentoSaldos`.
 *  - El dia debe estar entre diaGeneracion y diaVencimiento. Una configuracion antigua cuyo dia por defecto
 *    queda fuera de ese rango se ajusta al rango al usarla, para no romper nada.
 */
const { Decimal, errorHttp } = require('./saldo.util')
const { fechaEnZona } = require('./mora.util')

const DIA_DESCUENTO_SALDO_POR_DEFECTO = 9
const CERO = new Decimal(0)

const esDia = (valor) => Number.isInteger(valor) && valor >= 1 && valor <= 28

/** Ajusta `dia` al rango [diaGeneracion, diaVencimiento] (el que falte no limita). */
function ajustarAlRango(dia, { diaGeneracion, diaVencimiento } = {}) {
  let ajustado = dia
  if (esDia(diaGeneracion)) ajustado = Math.max(ajustado, diaGeneracion)
  if (esDia(diaVencimiento)) ajustado = Math.min(ajustado, diaVencimiento)
  return ajustado
}

/**
 * Dia en que rige el descuento con esa configuracion: el configurado o, si falta la configuracion o el campo,
 * el 9. Siempre dentro de [diaGeneracion, diaVencimiento].
 */
function diaDescuentoEfectivo(config) {
  const configurado = config && esDia(config.diaDescuentoSaldo) ? config.diaDescuentoSaldo : DIA_DESCUENTO_SALDO_POR_DEFECTO
  return ajustarAlRango(configurado, config ?? {})
}

/**
 * Valida el dia al crear una configuracion: entero entre diaGeneracion y diaVencimiento (400). Si no se envia,
 * `anterior` (el de la configuracion previa) o el 9 por defecto, ajustado al rango nuevo.
 */
function resolverDiaDescuentoSaldo(valor, { diaGeneracion, diaVencimiento, anterior } = {}) {
  if (valor === undefined || valor === null) {
    return ajustarAlRango(esDia(anterior) ? anterior : DIA_DESCUENTO_SALDO_POR_DEFECTO, { diaGeneracion, diaVencimiento })
  }
  if (!esDia(valor)) {
    throw errorHttp('diaDescuentoSaldo debe ser un entero entre 1 y 28', 400)
  }
  if (valor < diaGeneracion || valor > diaVencimiento) {
    throw errorHttp(
      `diaDescuentoSaldo debe estar entre el dia de generacion (${diaGeneracion}) y el de vencimiento (${diaVencimiento})`,
      400,
      { codigo: 'DIA_DESCUENTO_FUERA_DE_RANGO', detalle: { diaGeneracion, diaVencimiento } }
    )
  }
  return valor
}

/** Dia del mes de `hoy` en hora de Bolivia. */
function diaDelMes(hoy = new Date()) {
  return Number(fechaEnZona(hoy).slice(8, 10))
}

/** Hoy (hora de Bolivia) ya es el dia de descuento o uno posterior. */
function yaPuedeDescontar(hoy, config) {
  return diaDelMes(hoy) >= diaDescuentoEfectivo(config)
}

/**
 * Reparto del saldo entre las deudas de un inmueble (la mas antigua primero, sin planes de pago; cada deuda trae
 * `expensa`, `pendiente: { total }` y `atrasada`, como las arma reglas-pago.cargarDeudas). Solo descuenta
 * deudas con pendiente > 0 y mientras quede saldo > 0. Igual que el pago manual, un mes atrasado no se cubre en
 * parte: si el saldo no alcanza para completarlo, se detiene alli para respetar el orden. La expensa actual
 * admite descuento parcial. Devuelve [{ expensaId, monto }].
 */
function planificarDescuentos(deudas, saldo) {
  let restante = new Decimal(saldo ?? 0)
  const plan = []
  for (const deuda of deudas) {
    if (restante.lte(0)) break
    const pendiente = new Decimal(deuda.pendiente.total)
    if (pendiente.lte(0)) continue
    if (deuda.atrasada && restante.lt(pendiente)) break
    const monto = Decimal.min(restante, pendiente)
    plan.push({ expensaId: deuda.expensa.id, monto })
    restante = restante.minus(monto)
  }
  return plan
}

module.exports = {
  DIA_DESCUENTO_SALDO_POR_DEFECTO,
  CERO,
  diaDescuentoEfectivo,
  resolverDiaDescuentoSaldo,
  diaDelMes,
  yaPuedeDescontar,
  planificarDescuentos
}
