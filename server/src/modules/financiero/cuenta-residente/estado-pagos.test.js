// Pruebas de estado de pagos (HU14). Se ejecutan con:
//   node --test server/src/modules/financiero/cuenta-residente/estado-pagos.test.js
// Solo la parte pura: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { evaluarEstadoPagos } = require('./estado-pagos.util')

const HOY = '2026-11-14'
const fecha = (iso) => new Date(`${iso}T00:00:00Z`)
const expensa = (periodo, vence, extra = {}) => ({
  periodo,
  fechaVencimiento: fecha(vence),
  montoTotal: '300',
  montoMora: '0',
  pagos: [],
  planPagoId: null,
  estado: 'PENDIENTE',
  ...extra
})
const cuota = (numero, vence, extra = {}) => ({
  numero,
  monto: '100',
  montoPagado: '0',
  fechaVencimiento: fecha(vence),
  estado: 'PENDIENTE',
  ...extra
})
const depto = (extra = {}) => ({ expensas: [], cuotas: [], saldoFavor: '0', ...extra })
const evaluar = (departamentos) => evaluarEstadoPagos({ departamentos, hoy: HOY })

test('sin deudas: al dia', () => {
  assert.deepEqual(evaluar([depto()]), { alDia: true, deudaVencida: '0.00', detalle: [] })
})

test('deuda no vencida: al dia', () => {
  const r = evaluar([depto({ expensas: [expensa('2026-11', '2026-11-20')] })])
  assert.equal(r.alDia, true)
  assert.equal(r.deudaVencida, '0.00')
  assert.deepEqual(r.detalle, [])
})

test('vence hoy: no es vencida', () => {
  const r = evaluar([depto({ expensas: [expensa('2026-11', HOY)] })])
  assert.equal(r.alDia, true)
})

test('deuda vencida: no esta al dia, suma monto + mora y descuenta lo pagado', () => {
  const r = evaluar([
    depto({
      expensas: [
        expensa('2026-09', '2026-09-10', { montoMora: '15', pagos: [{ montoExpensa: '100', montoMora: '0' }] }),
        expensa('2026-10', '2026-10-10')
      ]
    })
  ])
  assert.equal(r.alDia, false)
  assert.equal(r.deudaVencida, '515.00') // (300-100)+15 + 300
  assert.deepEqual(r.detalle, [
    { concepto: 'Expensa', periodo: '2026-09', monto: '215.00', vencimiento: '2026-09-10' },
    { concepto: 'Expensa', periodo: '2026-10', monto: '300.00', vencimiento: '2026-10-10' }
  ])
})

test('saldo a favor que cubre todo: al dia', () => {
  const r = evaluar([depto({ expensas: [expensa('2026-10', '2026-10-10')], saldoFavor: '300' })])
  assert.deepEqual(r, { alDia: true, deudaVencida: '0.00', detalle: [] })
})

test('saldo a favor que cubre parte: no al dia y queda el remanente', () => {
  const r = evaluar([depto({ expensas: [expensa('2026-10', '2026-10-10')], saldoFavor: '120.50' })])
  assert.equal(r.alDia, false)
  assert.equal(r.deudaVencida, '179.50')
  assert.equal(r.detalle.length, 1)
})

test('el saldo a favor no se compensa entre departamentos distintos', () => {
  const r = evaluar([
    depto({ expensas: [expensa('2026-10', '2026-10-10')], saldoFavor: '0' }),
    depto({ saldoFavor: '1000' })
  ])
  assert.equal(r.alDia, false)
  assert.equal(r.deudaVencida, '300.00')
})

test('cuota de plan vencida: cuenta por lo que falta y aparece como "Cuota N plan de pago"', () => {
  const r = evaluar([depto({ cuotas: [cuota(2, '2026-11-01', { montoPagado: '40', estado: 'PARCIAL' })] })])
  assert.equal(r.alDia, false)
  assert.equal(r.deudaVencida, '60.00')
  assert.deepEqual(r.detalle, [{ concepto: 'Cuota 2 plan de pago', periodo: '2026-11', monto: '60.00', vencimiento: '2026-11-01' }])
})

test('cuota de plan futura: al dia', () => {
  const r = evaluar([depto({ cuotas: [cuota(3, '2026-12-01')] })])
  assert.deepEqual(r, { alDia: true, deudaVencida: '0.00', detalle: [] })
})

test('las expensas de un plan no se cuentan aparte (solo sus cuotas)', () => {
  const r = evaluar([
    depto({
      expensas: [expensa('2026-08', '2026-08-10', { planPagoId: 'plan-1' })],
      cuotas: [cuota(1, '2026-11-01')]
    })
  ])
  assert.equal(r.deudaVencida, '100.00')
  assert.equal(r.detalle.length, 1)
})

test('sin departamentos a cargo: al dia', () => {
  assert.deepEqual(evaluar([]), { alDia: true, deudaVencida: '0.00', detalle: [] })
})
