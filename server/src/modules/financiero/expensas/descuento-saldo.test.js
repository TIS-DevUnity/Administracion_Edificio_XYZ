// Pruebas de las reglas del dia de descuento del saldo a favor. Se ejecutan con:
//   node --test server/src/modules/financiero/expensas/descuento-saldo.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('./saldo.util')
const {
  DIA_DESCUENTO_SALDO_POR_DEFECTO,
  diaDescuentoEfectivo,
  resolverDiaDescuentoSaldo,
  diaDelMes,
  yaPuedeDescontar,
  planificarDescuentos
} = require('./descuento-saldo.util')

// Fechas en hora de Bolivia (UTC-4).
const bolivia = (texto) => new Date(`${texto}-04:00`)

function rechaza(fn, status, codigo) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  })
}

test('sin configuracion o sin el campo el dia es 9', () => {
  assert.equal(DIA_DESCUENTO_SALDO_POR_DEFECTO, 9)
  assert.equal(diaDescuentoEfectivo(null), 9)
  assert.equal(diaDescuentoEfectivo(undefined), 9)
  assert.equal(diaDescuentoEfectivo({}), 9)
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 1, diaVencimiento: 10 }), 9)
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: null }), 9)
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 'x' }), 9)
})

test('el dia configurado se respeta dentro del rango', () => {
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 5 }), 5)
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 5, diaVencimiento: 5, diaDescuentoSaldo: 5 }), 5)
})

test('una configuracion antigua con el 9 fuera de rango se ajusta al rango (no rompe nada)', () => {
  // generacion 10, vencimiento 10 (como en los tests del job): el 9 queda antes de la generacion
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 10, diaVencimiento: 10, diaDescuentoSaldo: 9 }), 10)
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 12, diaVencimiento: 20 }), 12)
  // vencimiento 7: el 9 queda despues del vencimiento
  assert.equal(diaDescuentoEfectivo({ diaGeneracion: 1, diaVencimiento: 7, diaDescuentoSaldo: 9 }), 7)
})

test('validacion al crear: entero entre generacion y vencimiento', () => {
  const rango = { diaGeneracion: 1, diaVencimiento: 10 }
  assert.equal(resolverDiaDescuentoSaldo(9, rango), 9)
  assert.equal(resolverDiaDescuentoSaldo(1, rango), 1)
  assert.equal(resolverDiaDescuentoSaldo(10, rango), 10)
  rechaza(() => resolverDiaDescuentoSaldo(11, rango), 400, 'DIA_DESCUENTO_FUERA_DE_RANGO')
  rechaza(() => resolverDiaDescuentoSaldo(0, rango), 400)
  rechaza(() => resolverDiaDescuentoSaldo(29, rango), 400)
  rechaza(() => resolverDiaDescuentoSaldo(5.5, rango), 400)
  rechaza(() => resolverDiaDescuentoSaldo('9', rango), 400)
  rechaza(() => resolverDiaDescuentoSaldo(4, { diaGeneracion: 5, diaVencimiento: 10 }), 400, 'DIA_DESCUENTO_FUERA_DE_RANGO')
})

test('al crear sin enviar el dia: conserva el anterior (ajustado al rango) o usa el 9', () => {
  assert.equal(resolverDiaDescuentoSaldo(undefined, { diaGeneracion: 1, diaVencimiento: 10 }), 9)
  assert.equal(resolverDiaDescuentoSaldo(null, { diaGeneracion: 1, diaVencimiento: 10, anterior: 6 }), 6)
  assert.equal(resolverDiaDescuentoSaldo(undefined, { diaGeneracion: 8, diaVencimiento: 12, anterior: 6 }), 8)
  assert.equal(resolverDiaDescuentoSaldo(undefined, { diaGeneracion: 1, diaVencimiento: 5, anterior: 9 }), 5)
  assert.equal(resolverDiaDescuentoSaldo(undefined, { diaGeneracion: 1, diaVencimiento: 10, anterior: 'x' }), 9)
})

test('yaPuedeDescontar: antes del dia no, el dia y despues si (hora de Bolivia)', () => {
  const config = { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }
  assert.equal(yaPuedeDescontar(bolivia('2026-11-08T12:00:00'), config), false)
  assert.equal(yaPuedeDescontar(bolivia('2026-11-09T00:00:00'), config), true)
  assert.equal(yaPuedeDescontar(bolivia('2026-11-09T12:00:00'), config), true)
  assert.equal(yaPuedeDescontar(bolivia('2026-11-28T12:00:00'), config), true)
  // sin configuracion rige el 9
  assert.equal(yaPuedeDescontar(bolivia('2026-11-08T12:00:00'), null), false)
  assert.equal(yaPuedeDescontar(bolivia('2026-11-09T12:00:00'), null), true)
})

test('el dia se mide en hora de Bolivia, no en UTC', () => {
  const config = { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }
  // 02:00 UTC del 9 = 22:00 del 8 en Bolivia: todavia no
  const casiNueve = new Date('2026-11-09T02:00:00Z')
  assert.equal(diaDelMes(casiNueve), 8)
  assert.equal(yaPuedeDescontar(casiNueve, config), false)
  // 04:00 UTC del 9 = 00:00 del 9 en Bolivia: ya
  const nueve = new Date('2026-11-09T04:00:00Z')
  assert.equal(diaDelMes(nueve), 9)
  assert.equal(yaPuedeDescontar(nueve, config), true)
})

test('el dia configurado cambia el momento: dia 5', () => {
  const config = { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 5 }
  assert.equal(yaPuedeDescontar(bolivia('2026-11-04T23:59:00'), config), false)
  assert.equal(yaPuedeDescontar(bolivia('2026-11-05T00:01:00'), config), true)
})

const deuda = (id, pendiente, atrasada = false) => ({
  expensa: { id },
  pendiente: { total: new Decimal(pendiente) },
  atrasada
})
const resumen = (plan) => plan.map((p) => [p.expensaId, p.monto.toFixed(2)])

test('planificarDescuentos: de la mas antigua a la mas nueva hasta donde alcance el saldo', () => {
  const plan = planificarDescuentos([deuda('e1', 100, true), deuda('e2', 200, true), deuda('e3', 300)], '350')
  assert.deepEqual(resumen(plan), [['e1', '100.00'], ['e2', '200.00'], ['e3', '50.00']])
})

test('planificarDescuentos: la expensa actual admite descuento parcial', () => {
  assert.deepEqual(resumen(planificarDescuentos([deuda('actual', 500)], '120.5')), [['actual', '120.50']])
})

test('planificarDescuentos: un mes atrasado no se cubre en parte y se respeta el orden', () => {
  // el saldo no alcanza el mes atrasado: no se toca nada, ni siquiera la expensa actual
  assert.deepEqual(planificarDescuentos([deuda('vieja', 300, true), deuda('actual', 100)], '250'), [])
  // alcanza justo: cubre la atrasada completa y sigue con la actual
  assert.deepEqual(resumen(planificarDescuentos([deuda('vieja', 300, true), deuda('actual', 100)], '350')), [['vieja', '300.00'], ['actual', '50.00']])
})

test('planificarDescuentos: sin saldo, con saldo 0 o negativo, o sin deudas no hace nada', () => {
  assert.deepEqual(planificarDescuentos([deuda('e1', 100)], 0), [])
  assert.deepEqual(planificarDescuentos([deuda('e1', 100)], '-5'), [])
  assert.deepEqual(planificarDescuentos([deuda('e1', 100)], undefined), [])
  assert.deepEqual(planificarDescuentos([], '100'), [])
})

test('planificarDescuentos: ignora deudas con pendiente 0 y nunca excede el saldo ni lo pendiente', () => {
  const plan = planificarDescuentos([deuda('pagada', 0), deuda('e2', '0.1'), deuda('e3', '0.2')], '0.25')
  assert.deepEqual(resumen(plan), [['e2', '0.10'], ['e3', '0.15']])
  const total = plan.reduce((acc, p) => acc.plus(p.monto), new Decimal(0))
  assert.ok(total.lte('0.25'))
})
