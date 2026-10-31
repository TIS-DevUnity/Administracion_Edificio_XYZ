/**
 * Gastos de personal dentro del saldo del edificio (HU8). Funciones puras: no tocan la base de datos.
 *
 *   gastos de personal = nominas pagadas (montoPagado, por la fecha de pago) + anticipos salariales (monto,
 *                        por su fecha)
 *
 * No hay doble conteo: la nomina paga el sueldo NETO, es decir, ya sin los anticipos que se le descontaron, y
 * el anticipo se cuenta cuando sale (su fecha), no cuando se descuenta. Tampoco se cuenta dos veces lo que
 * entra al libro de caja: el saldo del edificio no lee `movimientos_caja`, y ni la nomina ni el anticipo
 * crean un movimiento financiero extraordinario.
 */
const { Decimal } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')

const CERO = new Decimal(0)

const dinero = (valor) => new Decimal(valor ?? 0).toFixed(2)
const nombreDe = (empleado) => (empleado ? `${empleado.apellidos} ${empleado.nombres}` : '')

/**
 * Totales de personal a partir de lo agregado en la base:
 * `{ nominas: { monto, cantidad }, anticipos: { monto, cantidad } }` (monto puede venir null si no hay filas).
 */
function calcularGastosPersonal({ nominas, anticipos } = {}) {
  const montoNominas = new Decimal(nominas?.monto ?? 0)
  const montoAnticipos = new Decimal(anticipos?.monto ?? 0)
  return {
    nominas: montoNominas,
    anticipos: montoAnticipos,
    total: montoNominas.plus(montoAnticipos),
    cantidadNominas: nominas?.cantidad ?? 0,
    cantidadAnticipos: anticipos?.cantidad ?? 0
  }
}

/** Forma que se devuelve al cliente (montos como texto con 2 decimales). */
function gastosPersonalParaCliente(g) {
  return {
    nominas: dinero(g.nominas),
    anticipos: dinero(g.anticipos),
    total: dinero(g.total),
    cantidadNominas: g.cantidadNominas,
    cantidadAnticipos: g.cantidadAnticipos
  }
}

/** Gastos totales del edificio: extraordinarios + personal. */
function totalGastos(gastosExtraordinarios, gastosPersonal) {
  return new Decimal(gastosExtraordinarios ?? CERO).plus(gastosPersonal.total)
}

/** Fila del historial por una nomina pagada (misma forma que las demas filas del historial). */
function movimientoDeNomina(n) {
  const monto = new Decimal(n.montoPagado)
  return {
    id: n.id,
    origen: 'PAGO_NOMINA',
    tipo: 'GASTO',
    tipoEtiqueta: 'Gasto',
    fecha: fechaEnZona(new Date(n.fechaPago)),
    concepto: `Pago de nómina ${n.periodo} - ${nombreDe(n.empleado)}`,
    monto: monto.toFixed(2),
    montoConSigno: monto.negated().toFixed(2),
    detalle: { periodo: n.periodo, empleado: nombreDe(n.empleado), metodoPago: n.metodoPago ?? null },
    _marca: new Date(n.fechaPago).getTime()
  }
}

/** Fila del historial por un anticipo salarial (la fecha es un dia de calendario). */
function movimientoDeAnticipo(a) {
  const monto = new Decimal(a.monto)
  return {
    id: a.id,
    origen: 'ANTICIPO_SALARIAL',
    tipo: 'GASTO',
    tipoEtiqueta: 'Gasto',
    fecha: new Date(a.fecha).toISOString().slice(0, 10),
    concepto: `Anticipo salarial - ${nombreDe(a.empleado)}`,
    monto: monto.toFixed(2),
    montoConSigno: monto.negated().toFixed(2),
    detalle: { empleado: nombreDe(a.empleado), metodoPago: a.metodoPago ?? null, descripcion: a.descripcion ?? null },
    _marca: new Date(a.createdAt).getTime()
  }
}

module.exports = {
  calcularGastosPersonal,
  gastosPersonalParaCliente,
  totalGastos,
  movimientoDeNomina,
  movimientoDeAnticipo
}
