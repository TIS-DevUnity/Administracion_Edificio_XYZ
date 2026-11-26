// Pruebas de las reglas de anticipos salariales (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/anticipos/anticipos.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('../expensas/saldo.util')
const {
  distribuirAnticipos,
  validarDatosAnticipo,
  parsearFechaAnticipo,
  validarMetodoAnticipo,
  estadoAnticipo,
  saldoPendiente,
  normalizarRango,
  normalizarFiltroEstado,
  anticipoParaCliente
} = require('./anticipos.util')
const { calcularTotales } = require('../nomina/nomina.util')

const HOY = '2026-10-31'
const VALIDO = {
  empleadoId: ' emp-1 ',
  monto: '500.50',
  fecha: '2026-10-15',
  metodoPago: 'EFECTIVO',
  descripcion: '  Anticipo   por gastos medicos '
}

function rechaza(fn, status, codigo) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  })
}

const anticipo = (id, monto, fecha, extra = {}) => ({
  id,
  monto: new Decimal(monto),
  montoDescontado: new Decimal(extra.descontado ?? 0),
  fecha,
  createdAt: extra.createdAt ?? new Date(`${fecha}T10:00:00Z`)
})
const montos = (r) => r.aplicaciones.map((a) => [a.anticipoId, a.monto.toFixed(2)])

// ---------------------------------------------------------------------------
// Reparto del descuento
// ---------------------------------------------------------------------------

test('reparto: del mas antiguo al mas nuevo, sin importar el orden de entrada', () => {
  const r = distribuirAnticipos(
    [anticipo('c', 100, '2026-09-20'), anticipo('a', 100, '2026-08-05'), anticipo('b', 100, '2026-09-01')],
    '250'
  )
  assert.deepEqual(montos(r), [['a', '100.00'], ['b', '100.00'], ['c', '50.00']])
  assert.equal(r.total.toFixed(2), '250.00')
})

test('reparto: el empate de fecha se resuelve por createdAt', () => {
  const r = distribuirAnticipos(
    [
      anticipo('tarde', 100, '2026-09-01', { createdAt: new Date('2026-09-01T18:00:00Z') }),
      anticipo('temprano', 100, '2026-09-01', { createdAt: new Date('2026-09-01T08:00:00Z') })
    ],
    '100'
  )
  assert.deepEqual(montos(r), [['temprano', '100.00']])
})

test('reparto parcial: el anticipo que no cabe se aplica en parte y queda PARCIAL', () => {
  const r = distribuirAnticipos([anticipo('a', 1000, '2026-09-01')], '300')
  assert.deepEqual(montos(r), [['a', '300.00']])
  assert.equal(r.aplicaciones[0].montoDescontado.toFixed(2), '300.00')
  assert.equal(r.aplicaciones[0].estado, 'PARCIAL')
})

test('reparto exacto: el anticipo igual al disponible queda DESCONTADO', () => {
  const r = distribuirAnticipos([anticipo('a', 800, '2026-09-01')], '800')
  assert.deepEqual(montos(r), [['a', '800.00']])
  assert.equal(r.aplicaciones[0].estado, 'DESCONTADO')
  assert.equal(r.total.toFixed(2), '800.00')
})

test('reparto: disponible 0 (o negativo) no aplica nada', () => {
  for (const disp of [0, '0', -50]) {
    const r = distribuirAnticipos([anticipo('a', 100, '2026-09-01')], disp)
    assert.deepEqual(r.aplicaciones, [])
    assert.equal(r.total.toFixed(2), '0.00')
  }
  assert.deepEqual(distribuirAnticipos([], 1000).aplicaciones, [])
})

test('reparto: varios anticipos, uno parcial arrastrado y el resto intacto', () => {
  const r = distribuirAnticipos(
    [
      anticipo('a', 200, '2026-07-01', { descontado: 150 }), // saldo 50
      anticipo('b', 300, '2026-08-01'),
      anticipo('c', 400, '2026-09-01')
    ],
    '500'
  )
  assert.deepEqual(montos(r), [['a', '50.00'], ['b', '300.00'], ['c', '150.00']])
  assert.deepEqual(
    r.aplicaciones.map((a) => a.estado),
    ['DESCONTADO', 'DESCONTADO', 'PARCIAL']
  )
  assert.equal(r.aplicaciones[2].montoDescontado.toFixed(2), '150.00')
})

test('reparto: ignora anticipos ya descontados por completo', () => {
  const r = distribuirAnticipos([anticipo('a', 100, '2026-07-01', { descontado: 100 }), anticipo('b', 50, '2026-08-01')], '500')
  assert.deepEqual(montos(r), [['b', '50.00']])
})

test('reparto con decimales: 0.1 + 0.2 exacto', () => {
  const r = distribuirAnticipos([anticipo('a', '0.1', '2026-09-01'), anticipo('b', '0.2', '2026-09-02')], '0.3')
  assert.deepEqual(montos(r), [['a', '0.10'], ['b', '0.20']])
  assert.equal(r.total.toFixed(2), '0.30')
  assert.ok(r.total.equals(new Decimal('0.3')))
  const corto = distribuirAnticipos([anticipo('a', '0.1', '2026-09-01'), anticipo('b', '0.2', '2026-09-02')], '0.25')
  assert.deepEqual(montos(corto), [['a', '0.10'], ['b', '0.15']])
})

test('reparto: nunca excede el disponible ni el saldo de cada anticipo (propiedad)', () => {
  let semilla = 7
  const azar = () => ((semilla = (semilla * 48271) % 2147483647) / 2147483647)
  for (let i = 0; i < 300; i++) {
    const lista = Array.from({ length: 1 + Math.floor(azar() * 6) }, (_, k) => {
      const monto = (1 + Math.floor(azar() * 100000)) / 100
      const descontado = Math.floor(azar() * monto * 100) / 100
      return anticipo(`a${k}`, monto.toFixed(2), `2026-0${1 + Math.floor(azar() * 9)}-10`, { descontado: descontado.toFixed(2) })
    })
    const disponible = new Decimal((Math.floor(azar() * 300000) / 100).toFixed(2))
    const r = distribuirAnticipos(lista, disponible)
    assert.ok(r.total.lte(disponible), 'el total excede lo disponible')
    for (const ap of r.aplicaciones) {
      const origen = lista.find((a) => a.id === ap.anticipoId)
      assert.ok(ap.monto.gt(0))
      assert.ok(ap.monto.lte(saldoPendiente(origen.monto, origen.montoDescontado)), 'excede el saldo del anticipo')
      assert.ok(ap.montoDescontado.lte(origen.monto), 'descuenta mas que el monto del anticipo')
    }
    // Si sobra disponible es porque ya no quedan saldos que cubrir.
    const sinCubrir = lista.reduce((acc, a) => acc.plus(saldoPendiente(a.monto, a.montoDescontado)), new Decimal(0))
    assert.ok(r.total.equals(Decimal.min(disponible, sinCubrir)))
  }
})

test('con el reparto el neto de la nomina nunca queda negativo', () => {
  const sueldo = '1000'
  const r = distribuirAnticipos([anticipo('a', 700, '2026-08-01'), anticipo('b', 700, '2026-09-01')], sueldo)
  const totales = calcularTotales([], sueldo, r.total)
  assert.equal(totales.totalAnticipos.toFixed(2), '1000.00')
  assert.equal(totales.sueldoNeto.toFixed(2), '0.00')
})

// ---------------------------------------------------------------------------
// Validacion del alta
// ---------------------------------------------------------------------------

test('alta valida: normaliza texto, monto y fecha (DATE sin desfase)', () => {
  const v = validarDatosAnticipo(VALIDO, HOY)
  assert.equal(v.empleadoId, 'emp-1')
  assert.equal(v.monto.toFixed(2), '500.50')
  assert.equal(v.descripcion, 'Anticipo por gastos medicos')
  assert.equal(v.fechaTexto, '2026-10-15')
  assert.equal(v.fecha.toISOString(), '2026-10-15T00:00:00.000Z')
  assert.equal(v.metodoPago, 'EFECTIVO')
})

test('alta: avisa de todos los campos faltantes a la vez', () => {
  assert.throws(
    () => validarDatosAnticipo({ monto: 10, descripcion: '  ' }, HOY),
    (err) => {
      assert.equal(err.codigo, 'CAMPOS_OBLIGATORIOS')
      assert.deepEqual(err.detalle.campos, ['empleadoId', 'fecha', 'metodoPago', 'descripcion'])
      return true
    }
  )
  rechaza(() => validarDatosAnticipo(undefined, HOY), 400, 'CAMPOS_OBLIGATORIOS')
})

test('monto 0, negativo, no numerico o con mas de 2 decimales se rechaza', () => {
  for (const monto of [0, '0', -1, 'abc', '10.999', true]) {
    rechaza(() => validarDatosAnticipo({ ...VALIDO, monto }, HOY), 400)
  }
})

test('fecha: invalida, inexistente y futura se rechazan', () => {
  for (const fecha of ['15/10/2026', '2026-10-5', '2026-02-30', '2026-13-01', 'hoy', 20261015, '1899-12-31']) {
    rechaza(() => validarDatosAnticipo({ ...VALIDO, fecha }, HOY), 400, 'FECHA_ANTICIPO_INVALIDA')
  }
  rechaza(() => validarDatosAnticipo({ ...VALIDO, fecha: '2026-11-01' }, HOY), 400, 'FECHA_ANTICIPO_INVALIDA')
  assert.equal(parsearFechaAnticipo(HOY, HOY).texto, HOY) // hoy si vale
})

test('metodoPago: SALDO_A_FAVOR y desconocidos se rechazan', () => {
  rechaza(() => validarDatosAnticipo({ ...VALIDO, metodoPago: 'SALDO_A_FAVOR' }, HOY), 400, 'METODO_PAGO_INVALIDO')
  rechaza(() => validarMetodoAnticipo('BITCOIN'), 400)
  rechaza(() => validarMetodoAnticipo('efectivo'), 400)
  for (const m of ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']) assert.equal(validarMetodoAnticipo(m), m)
})

test('descripcion vacia o demasiado larga se rechaza (maximo 200)', () => {
  for (const descripcion of ['', '   ', undefined, null]) {
    rechaza(() => validarDatosAnticipo({ ...VALIDO, descripcion }, HOY), 400)
  }
  rechaza(() => validarDatosAnticipo({ ...VALIDO, descripcion: 'x'.repeat(201) }, HOY), 400)
  assert.equal(validarDatosAnticipo({ ...VALIDO, descripcion: 'x'.repeat(200) }, HOY).descripcion.length, 200)
})

// ---------------------------------------------------------------------------
// Estado, saldo y filtros
// ---------------------------------------------------------------------------

test('estado: PENDIENTE, PARCIAL y DESCONTADO', () => {
  assert.equal(estadoAnticipo('500', '0'), 'PENDIENTE')
  assert.equal(estadoAnticipo('500', 0), 'PENDIENTE')
  assert.equal(estadoAnticipo('500', '0.01'), 'PARCIAL')
  assert.equal(estadoAnticipo('500', '499.99'), 'PARCIAL')
  assert.equal(estadoAnticipo('500', '500'), 'DESCONTADO')
  assert.equal(estadoAnticipo('0.3', new Decimal('0.1').plus('0.2')), 'DESCONTADO')
})

test('saldoPendiente = monto - montoDescontado, nunca negativo', () => {
  assert.equal(saldoPendiente('500', '120.25').toFixed(2), '379.75')
  assert.equal(saldoPendiente('500', '500').toFixed(2), '0.00')
  assert.equal(saldoPendiente('500', null).toFixed(2), '500.00')
  assert.equal(saldoPendiente('100', '150').toFixed(2), '0.00')
})

test('filtros del listado y presentacion', () => {
  assert.deepEqual(normalizarRango(undefined, ''), { desde: null, hasta: null })
  assert.deepEqual(normalizarRango('2026-10-01', '2026-10-31'), { desde: '2026-10-01', hasta: '2026-10-31' })
  rechaza(() => normalizarRango('2026-11-01', '2026-10-01'), 400, 'RANGO_INVALIDO')
  rechaza(() => normalizarRango('2026-02-30', undefined), 400)
  rechaza(() => normalizarRango('ayer', undefined), 400)
  assert.equal(normalizarFiltroEstado('parcial'), 'PARCIAL')
  assert.equal(normalizarFiltroEstado(''), null)
  rechaza(() => normalizarFiltroEstado('PAGADO'), 400)

  const salida = anticipoParaCliente({
    id: 'a1', empleadoId: 'e1', monto: '500', montoDescontado: '120.25', fecha: new Date('2026-10-15T00:00:00Z'),
    metodoPago: 'EFECTIVO', descripcion: 'x', estado: 'PARCIAL', createdAt: new Date(),
    aplicaciones: [{ id: 'p1', nominaId: 'n1', monto: '120.25', nomina: { periodo: '2026-10', estado: 'PENDIENTE' } }],
    asiento: null
  })
  assert.equal(salida.saldoPendiente, '379.75')
  assert.equal(salida.fecha, '2026-10-15')
  assert.equal(salida.aplicaciones[0].montoAplicado, '120.25')
  assert.equal(salida.aplicaciones[0].periodo, '2026-10')
  assert.equal(salida.asiento, null)
})
