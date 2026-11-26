// Pruebas de las reglas de la nomina mensual (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/nomina/nomina.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('../expensas/saldo.util')
const {
  validarPeriodo,
  validarPeriodoGenerable,
  ultimoDiaDelPeriodo,
  empleadoEntraEnPeriodo,
  validarConcepto,
  validarEdicionConcepto,
  calcularTotales,
  validarNetoNoNegativo,
  totalAnticiposAplicados,
  nominaParaCliente,
  normalizarFiltroPeriodo,
  normalizarFiltroEstado
} = require('./nomina.util')

const HOY = '2026-10-31'

function rechaza(fn, status, codigo) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  })
}

const concepto = (tipo, monto) => ({ tipo, monto: new Decimal(monto) })

test('neto = base + bono + horas extra - descuento - anticipo', () => {
  const t = calcularTotales(
    [concepto('BONO', '300'), concepto('HORA_EXTRA', '150.50'), concepto('DESCUENTO', '80'), concepto('BONO', '50')],
    '2500',
    '400'
  )
  assert.equal(t.totalBonos.toFixed(2), '350.00')
  assert.equal(t.totalHorasExtra.toFixed(2), '150.50')
  assert.equal(t.totalDescuentos.toFixed(2), '80.00')
  assert.equal(t.totalAnticipos.toFixed(2), '400.00')
  assert.equal(t.bruto.toFixed(2), '3000.50')
  assert.equal(t.sueldoNeto.toFixed(2), '2520.50') // 2500 + 350 + 150.50 - 80 - 400
})

test('sin conceptos ni anticipos el neto es el sueldo base', () => {
  const t = calcularTotales([], '2500.00')
  assert.equal(t.sueldoNeto.toFixed(2), '2500.00')
  assert.equal(t.totalAnticipos.toFixed(2), '0.00')
})

test('neto exactamente 0 se permite', () => {
  const t = calcularTotales([concepto('DESCUENTO', '600')], '1000', '400')
  assert.equal(t.sueldoNeto.toFixed(2), '0.00')
  assert.doesNotThrow(() => validarNetoNoNegativo(t))
})

test('neto negativo se rechaza con NETO_NEGATIVO y el detalle del calculo', () => {
  const t = calcularTotales([concepto('DESCUENTO', '700')], '1000', '400')
  assert.equal(t.sueldoNeto.toFixed(2), '-100.00')
  assert.throws(
    () => validarNetoNoNegativo(t),
    (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.codigo, 'NETO_NEGATIVO')
      assert.deepEqual(err.detalle, {
        sueldoBase: '1000.00',
        bonos: '0.00',
        horasExtra: '0.00',
        descuentos: '700.00',
        anticipos: '400.00',
        sueldoNeto: '-100.00'
      })
      return true
    }
  )
})

test('quitar un bono que dejaria el neto negativo se detecta', () => {
  const conBono = [concepto('BONO', '500'), concepto('DESCUENTO', '1400')]
  assert.equal(validarNetoNoNegativo(calcularTotales(conBono, '1000')).sueldoNeto.toFixed(2), '100.00')
  rechaza(() => validarNetoNoNegativo(calcularTotales([concepto('DESCUENTO', '1400')], '1000')), 400, 'NETO_NEGATIVO')
})

test('decimales exactos: 0.1 + 0.2 = 0.30 y sumas largas sin deriva', () => {
  const t = calcularTotales([concepto('BONO', '0.1'), concepto('BONO', '0.2')], '0')
  assert.equal(t.totalBonos.toFixed(2), '0.30')
  assert.equal(t.sueldoNeto.toFixed(2), '0.30')
  const muchos = Array.from({ length: 100 }, () => concepto('DESCUENTO', '0.10'))
  assert.equal(calcularTotales(muchos, '20').sueldoNeto.toFixed(2), '10.00')
  assert.equal(totalAnticiposAplicados([{ monto: '0.1' }, { monto: '0.2' }]).toFixed(2), '0.30')
})

test('HORA_EXTRA: exige horas y monto', () => {
  const ok = validarConcepto({ tipo: 'HORA_EXTRA', descripcion: '  Turno  noche ', monto: '180.5', horas: '8.5' })
  assert.equal(ok.descripcion, 'Turno noche')
  assert.equal(ok.monto.toFixed(2), '180.50')
  assert.equal(ok.horas.toFixed(2), '8.50')
  rechaza(() => validarConcepto({ tipo: 'HORA_EXTRA', descripcion: 'x', monto: 100 }), 400, 'HORAS_REQUERIDAS')
  rechaza(() => validarConcepto({ tipo: 'HORA_EXTRA', descripcion: 'x', monto: 100, horas: null }), 400, 'HORAS_REQUERIDAS')
  for (const horas of [0, -2, 'abc', '1.234', 745]) {
    rechaza(() => validarConcepto({ tipo: 'HORA_EXTRA', descripcion: 'x', monto: 100, horas }), 400)
  }
  assert.equal(validarConcepto({ tipo: 'HORA_EXTRA', descripcion: 'x', monto: 100, horas: 744 }).horas.toFixed(2), '744.00')
})

test('horas en BONO o DESCUENTO se rechazan', () => {
  rechaza(() => validarConcepto({ tipo: 'BONO', descripcion: 'x', monto: 100, horas: 5 }), 400, 'HORAS_NO_APLICA')
  rechaza(() => validarConcepto({ tipo: 'DESCUENTO', descripcion: 'x', monto: 100, horas: '1' }), 400, 'HORAS_NO_APLICA')
  const bono = validarConcepto({ tipo: 'bono', descripcion: 'x', monto: 100, horas: '' })
  assert.equal(bono.tipo, 'BONO')
  assert.equal(bono.horas, null)
})

test('monto 0, negativo o invalido se rechaza', () => {
  for (const monto of [0, '0', -10, 'abc', undefined, null, '', true, '10.123']) {
    rechaza(() => validarConcepto({ tipo: 'BONO', descripcion: 'x', monto }), 400)
  }
})

test('descripcion obligatoria (maximo 120) y tipo valido', () => {
  rechaza(() => validarConcepto({ tipo: 'BONO', descripcion: '   ', monto: 1 }), 400)
  rechaza(() => validarConcepto({ tipo: 'BONO', monto: 1 }), 400)
  rechaza(() => validarConcepto({ tipo: 'BONO', descripcion: 'x'.repeat(121), monto: 1 }), 400)
  assert.equal(validarConcepto({ tipo: 'BONO', descripcion: 'x'.repeat(120), monto: 1 }).descripcion.length, 120)
  rechaza(() => validarConcepto({ tipo: 'PREMIO', descripcion: 'x', monto: 1 }), 400)
  rechaza(() => validarConcepto({ descripcion: 'x', monto: 1 }), 400)
})

test('edicion de concepto: conserva lo no enviado y revalida todo', () => {
  const hora = { tipo: 'HORA_EXTRA', descripcion: 'Turno', monto: new Decimal('100'), horas: new Decimal('4') }
  const e = validarEdicionConcepto(hora, { monto: '120' })
  assert.equal(e.monto.toFixed(2), '120.00')
  assert.equal(e.horas.toFixed(2), '4.00')
  assert.equal(e.tipo, 'HORA_EXTRA')
  rechaza(() => validarEdicionConcepto(hora, {}), 400, 'SIN_CAMBIOS')
  rechaza(() => validarEdicionConcepto(hora, { horas: null }), 400, 'HORAS_REQUERIDAS')
  rechaza(() => validarEdicionConcepto(hora, { monto: 0 }), 400)
  const bono = { tipo: 'BONO', descripcion: 'Puntualidad', monto: new Decimal('50'), horas: null }
  rechaza(() => validarEdicionConcepto(bono, { horas: 3 }), 400, 'HORAS_NO_APLICA')
  assert.equal(validarEdicionConcepto(bono, { descripcion: ' Asistencia ' }).descripcion, 'Asistencia')
})

test('periodo: valido, invalido y futuro', () => {
  assert.equal(validarPeriodo(' 2026-10 '), '2026-10')
  for (const p of ['2026-13', '2026-00', '2026-1', '26-10', '2026/10', 'octubre', 202610, '2026-10-01']) {
    rechaza(() => validarPeriodo(p), 400, 'PERIODO_INVALIDO')
  }
  rechaza(() => validarPeriodo(undefined), 400)
  rechaza(() => validarPeriodo('  '), 400)
  assert.equal(validarPeriodoGenerable('2026-10', HOY), '2026-10') // el mes actual si
  assert.equal(validarPeriodoGenerable('2025-01', HOY), '2025-01') // uno pasado si
  rechaza(() => validarPeriodoGenerable('2026-11', HOY), 400, 'PERIODO_FUTURO')
  rechaza(() => validarPeriodoGenerable('2027-01', HOY), 400, 'PERIODO_FUTURO')
  rechaza(() => validarPeriodoGenerable('2026-1', HOY), 400, 'PERIODO_INVALIDO')
})

test('ultimo dia del periodo, con febrero y bisiesto', () => {
  assert.equal(ultimoDiaDelPeriodo('2026-10'), '2026-10-31')
  assert.equal(ultimoDiaDelPeriodo('2026-04'), '2026-04-30')
  assert.equal(ultimoDiaDelPeriodo('2026-02'), '2026-02-28')
  assert.equal(ultimoDiaDelPeriodo('2024-02'), '2024-02-29')
  assert.equal(ultimoDiaDelPeriodo('2026-12'), '2026-12-31')
})

test('empleado con fechaIngreso posterior al periodo queda excluido', () => {
  assert.equal(empleadoEntraEnPeriodo('2026-10-31', '2026-10'), true) // el ultimo dia si
  assert.equal(empleadoEntraEnPeriodo('2026-10-01', '2026-10'), true)
  assert.equal(empleadoEntraEnPeriodo('2026-11-01', '2026-10'), false)
  assert.equal(empleadoEntraEnPeriodo('2027-01-15', '2026-10'), false)
  assert.equal(empleadoEntraEnPeriodo('2025-06-01', '2026-10'), true)
  assert.equal(empleadoEntraEnPeriodo(new Date('2026-10-15T00:00:00Z'), '2026-10'), true) // columna DATE
  assert.equal(empleadoEntraEnPeriodo(new Date('2026-11-02T00:00:00Z'), '2026-10'), false)
})

test('filtros del listado y presentacion de la nomina', () => {
  assert.equal(normalizarFiltroPeriodo(undefined), null)
  assert.equal(normalizarFiltroPeriodo('2026-09'), '2026-09')
  rechaza(() => normalizarFiltroPeriodo('2026-9'), 400)
  assert.equal(normalizarFiltroEstado(''), null)
  assert.equal(normalizarFiltroEstado('pagada'), 'PAGADA')
  rechaza(() => normalizarFiltroEstado('ANULADA'), 400)

  const salida = nominaParaCliente({
    id: 'n1', periodo: '2026-10', estado: 'PENDIENTE', sueldoBase: '2500', totalBonos: '350', totalHorasExtra: '0',
    totalDescuentos: '80', totalAnticipos: '0', sueldoNeto: '2770',
    conceptos: [
      { id: 'c1', tipo: 'BONO', descripcion: 'a', monto: '350', horas: null },
      { id: 'c2', tipo: 'DESCUENTO', descripcion: 'b', monto: '80', horas: null }
    ],
    anticiposAplicados: []
  })
  assert.equal(salida.sueldoNeto, '2770.00')
  assert.equal(salida.conceptosPorTipo.bonos.length, 1)
  assert.equal(salida.conceptosPorTipo.horasExtra.length, 0)
  assert.equal(salida.conceptosPorTipo.descuentos[0].monto, '80.00')
})
