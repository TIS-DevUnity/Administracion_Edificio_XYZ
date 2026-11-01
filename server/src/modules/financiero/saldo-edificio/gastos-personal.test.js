// Pruebas del calculo de gastos de personal del saldo del edificio (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/saldo-edificio/gastos-personal.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('../expensas/saldo.util')
const {
  calcularGastosPersonal,
  gastosPersonalParaCliente,
  totalGastos,
  movimientoDeNomina,
  movimientoDeAnticipo
} = require('./gastos-personal.util')

test('sin datos los gastos de personal son 0', () => {
  for (const entrada of [undefined, {}, { nominas: { monto: null, cantidad: 0 }, anticipos: { monto: null, cantidad: 0 } }]) {
    const g = calcularGastosPersonal(entrada)
    assert.equal(g.total.toFixed(2), '0.00')
    assert.equal(g.cantidadNominas, 0)
    assert.equal(g.cantidadAnticipos, 0)
  }
  assert.deepEqual(gastosPersonalParaCliente(calcularGastosPersonal()), {
    nominas: '0.00',
    anticipos: '0.00',
    total: '0.00',
    cantidadNominas: 0,
    cantidadAnticipos: 0
  })
})

test('nomina pagada + anticipo suman en el total de personal', () => {
  const g = calcularGastosPersonal({
    nominas: { monto: new Decimal('2520.50'), cantidad: 1 },
    anticipos: { monto: new Decimal('400'), cantidad: 1 }
  })
  assert.equal(g.nominas.toFixed(2), '2520.50')
  assert.equal(g.anticipos.toFixed(2), '400.00')
  assert.equal(g.total.toFixed(2), '2920.50')
  assert.equal(gastosPersonalParaCliente(g).total, '2920.50')
})

test('sin doble conteo: sueldo 2900, anticipo 400 descontado => egresos totales 2900 (400 + neto 2500)', () => {
  const anticipo = new Decimal('400')
  const neto = new Decimal('2900').minus(anticipo) // la nomina paga el neto, sin el anticipo
  const g = calcularGastosPersonal({ nominas: { monto: neto, cantidad: 1 }, anticipos: { monto: anticipo, cantidad: 1 } })
  assert.equal(g.total.toFixed(2), '2900.00')
})

test('decimales exactos al sumar (0.1 + 0.2)', () => {
  const g = calcularGastosPersonal({ nominas: { monto: '0.1', cantidad: 1 }, anticipos: { monto: '0.2', cantidad: 1 } })
  assert.equal(g.total.toFixed(2), '0.30')
  assert.ok(g.total.equals(new Decimal('0.3')))
})

test('el total de gastos del edificio incluye al personal', () => {
  const personal = calcularGastosPersonal({ nominas: { monto: '1000', cantidad: 1 }, anticipos: { monto: '250.25', cantidad: 2 } })
  assert.equal(totalGastos(new Decimal('300'), personal).toFixed(2), '1550.25')
  assert.equal(totalGastos(new Decimal(0), calcularGastosPersonal()).toFixed(2), '0.00')
  assert.equal(totalGastos(undefined, personal).toFixed(2), '1250.25')
  // saldo = ingresos - gastos (personal incluido)
  assert.equal(new Decimal('5000').minus(totalGastos(new Decimal('300'), personal)).toFixed(2), '3449.75')
})

test('periodo borde: la nomina pagada el ultimo dia del mes cae en ese dia (hora de Bolivia)', () => {
  // 31-oct a mediodia de Bolivia = 16:00 UTC; el instante guardado por instanteDeDia
  const nomina = {
    id: 'n1', periodo: '2026-10', montoPagado: '2520.50', metodoPago: 'TRANSFERENCIA',
    fechaPago: new Date('2026-10-31T12:00:00-04:00'), empleado: { nombres: 'Juan', apellidos: 'Mamani' }
  }
  const m = movimientoDeNomina(nomina)
  assert.equal(m.fecha, '2026-10-31')
  assert.equal(m.origen, 'PAGO_NOMINA')
  assert.equal(m.tipo, 'GASTO')
  assert.equal(m.monto, '2520.50')
  assert.equal(m.montoConSigno, '-2520.50')
  assert.equal(m.concepto, 'Pago de nómina 2026-10 - Mamani Juan')

  const primero = movimientoDeNomina({ ...nomina, fechaPago: new Date('2026-11-01T12:00:00-04:00') })
  assert.equal(primero.fecha, '2026-11-01')
})

test('anticipo: el dia de calendario no se corre por la zona horaria', () => {
  const m = movimientoDeAnticipo({
    id: 'a1', monto: '400', fecha: new Date('2026-10-31T00:00:00Z'), createdAt: new Date('2026-10-31T15:00:00Z'),
    metodoPago: 'EFECTIVO', descripcion: 'Gastos medicos', empleado: { nombres: 'Juan', apellidos: 'Mamani' }
  })
  assert.equal(m.fecha, '2026-10-31')
  assert.equal(m.origen, 'ANTICIPO_SALARIAL')
  assert.equal(m.tipo, 'GASTO')
  assert.equal(m.montoConSigno, '-400.00')
  assert.equal(m.concepto, 'Anticipo salarial - Mamani Juan')
})
