// Pruebas de la validacion del pago de una nomina (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/nomina/nomina-pago.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('../expensas/saldo.util')
const { validarDatosPago, validarMontoPago, calcularTotales } = require('./nomina.util')

const HOY = '2026-10-31'
const VALIDO = { fechaPago: '2026-10-31', monto: '2520.50', metodoPago: 'TRANSFERENCIA' }

function rechaza(fn, status, codigo) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  })
}

test('pago valido: fecha de hoy permitida, monto como Decimal y metodo', () => {
  const v = validarDatosPago(VALIDO, HOY)
  assert.equal(v.fechaPago, '2026-10-31')
  assert.equal(v.monto.toFixed(2), '2520.50')
  assert.equal(v.metodoPago, 'TRANSFERENCIA')
  for (const metodo of ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']) {
    assert.equal(validarDatosPago({ ...VALIDO, metodoPago: metodo }, HOY).metodoPago, metodo)
  }
})

test('pago: avisa de todos los campos faltantes a la vez', () => {
  assert.throws(
    () => validarDatosPago({ monto: '' }, HOY),
    (err) => {
      assert.equal(err.codigo, 'CAMPOS_OBLIGATORIOS')
      assert.deepEqual(err.detalle.campos, ['fechaPago', 'monto', 'metodoPago'])
      return true
    }
  )
  rechaza(() => validarDatosPago(undefined, HOY), 400, 'CAMPOS_OBLIGATORIOS')
})

test('fechaPago: futura, invalida e inexistente se rechazan con FECHA_PAGO_INVALIDA', () => {
  rechaza(() => validarDatosPago({ ...VALIDO, fechaPago: '2026-11-01' }, HOY), 400, 'FECHA_PAGO_INVALIDA')
  for (const fecha of ['31/10/2026', '2026-10-3', '2026-02-30', '2026-13-01', 'hoy', 20261031, '1899-12-31']) {
    rechaza(() => validarDatosPago({ ...VALIDO, fechaPago: fecha }, HOY), 400, 'FECHA_PAGO_INVALIDA')
  }
  assert.throws(
    () => validarDatosPago({ ...VALIDO, fechaPago: '2027-01-01' }, HOY),
    (err) => /fechaPago/.test(err.message)
  )
})

test('metodoPago: SALDO_A_FAVOR y desconocidos se rechazan', () => {
  rechaza(() => validarDatosPago({ ...VALIDO, metodoPago: 'SALDO_A_FAVOR' }, HOY), 400, 'METODO_PAGO_INVALIDO')
  rechaza(() => validarDatosPago({ ...VALIDO, metodoPago: 'BITCOIN' }, HOY), 400)
  rechaza(() => validarDatosPago({ ...VALIDO, metodoPago: 'efectivo' }, HOY), 400)
})

test('monto: negativo, no numerico o con mas de 2 decimales se rechaza; 0 se admite', () => {
  for (const monto of [-1, 'abc', '10.999', true]) {
    rechaza(() => validarDatosPago({ ...VALIDO, monto }, HOY), 400)
  }
  assert.equal(validarDatosPago({ ...VALIDO, monto: 0 }, HOY).monto.toFixed(2), '0.00')
  assert.equal(validarDatosPago({ ...VALIDO, monto: '0' }, HOY).monto.toFixed(2), '0.00')
})

test('monto distinto del neto: MONTO_NO_COINCIDE con detalle { sueldoNeto, monto }', () => {
  for (const monto of ['2520.49', '2520.51', '1000', '0']) {
    assert.throws(
      () => validarMontoPago(new Decimal(monto), '2520.50'),
      (err) => {
        assert.equal(err.status, 400)
        assert.equal(err.codigo, 'MONTO_NO_COINCIDE')
        assert.deepEqual(err.detalle, { sueldoNeto: '2520.50', monto: new Decimal(monto).toFixed(2) })
        return true
      }
    )
  }
})

test('monto igual al neto se acepta, tambien con decimales (0.1 + 0.2)', () => {
  assert.equal(validarMontoPago(new Decimal('2520.50'), '2520.5').toFixed(2), '2520.50')
  assert.equal(validarMontoPago(new Decimal('2520.5'), new Decimal('2520.50')).toFixed(2), '2520.50')

  // El neto sale de sumar 0.1 + 0.2 con Decimal; el monto "0.3" que escribe el administrador coincide.
  const neto = calcularTotales([{ tipo: 'BONO', monto: new Decimal('0.1') }, { tipo: 'BONO', monto: new Decimal('0.2') }], '0').sueldoNeto
  const v = validarDatosPago({ ...VALIDO, monto: '0.3' }, HOY)
  assert.equal(validarMontoPago(v.monto, neto).toFixed(2), '0.30')
  // Con numeros flotantes de JS esto fallaria: 0.1 + 0.2 !== 0.3
  assert.notEqual(0.1 + 0.2, 0.3)
})

test('neto 0 con monto 0 se permite; neto 0 con monto positivo se rechaza', () => {
  // Los anticipos consumieron todo el sueldo.
  const neto = calcularTotales([], '1000', '1000').sueldoNeto
  assert.equal(neto.toFixed(2), '0.00')
  const v = validarDatosPago({ ...VALIDO, monto: 0 }, HOY)
  assert.equal(validarMontoPago(v.monto, neto).toFixed(2), '0.00')
  rechaza(() => validarMontoPago(new Decimal('1'), neto), 400, 'MONTO_NO_COINCIDE')
})
