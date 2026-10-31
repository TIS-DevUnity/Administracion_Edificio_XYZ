// Pruebas del reporte mensual de gastos de personal y del historial de periodos (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/nomina/reporte.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { Decimal } = require('../expensas/saldo.util')
const { construirReporte, resumirPeriodos } = require('./reporte.util')
const { normalizarRangoPeriodos, normalizarFiltroEmpleadoId, datosParaBoleta, validarPeriodo } = require('./nomina.util')

const emp = (apellidos, nombres, cargo = 'Conserje') => ({ id: apellidos, apellidos, nombres, cargo, documento: '1' })
const nomina = (empleado, c) => ({
  id: 'n-' + empleado.apellidos,
  periodo: '2026-10',
  empleado,
  sueldoBase: '0', totalBonos: '0', totalHorasExtra: '0', totalDescuentos: '0', totalAnticipos: '0', sueldoNeto: '0',
  estado: 'PENDIENTE', fechaPago: null,
  ...c
})
const anticipo = (empleado, fecha, monto, extra = {}) => ({ id: 'a-' + fecha, empleado, fecha, monto, metodoPago: 'EFECTIVO', estado: 'PENDIENTE', ...extra })

test('periodo vacio: ceros, listas vacias y marca vacio', () => {
  const r = construirReporte({ periodo: '2026-10' })
  assert.equal(r.vacio, true)
  assert.deepEqual(r.filas, [])
  assert.deepEqual(r.totales, { sueldoBase: '0.00', bonos: '0.00', horasExtra: '0.00', descuentos: '0.00', anticipos: '0.00', sueldoNeto: '0.00' })
  assert.deepEqual(r.resumen, { costoDelPeriodo: '0.00', pagado: '0.00', pendiente: '0.00', cantidad: 0, cantidadPagadas: 0, cantidadPendientes: 0 })
  assert.deepEqual(r.anticiposOtorgados, { cantidad: 0, total: '0.00', items: [] })
})

test('totales por columna y resumen: costoDelPeriodo = neto + anticipos descontados', () => {
  const a = emp('Mamani', 'Juan')
  const b = emp('Alvarez', 'Pedro', 'Guardia')
  const r = construirReporte({
    periodo: '2026-10',
    nominas: [
      // base 2500 + bonos 350 + horas 150.50 - desc 80 = 2920.50 devengado; anticipo 400 -> neto 2520.50
      nomina(a, { sueldoBase: '2500', totalBonos: '350', totalHorasExtra: '150.50', totalDescuentos: '80', totalAnticipos: '400', sueldoNeto: '2520.50', estado: 'PAGADA', fechaPago: '2026-10-31' }),
      // sin conceptos: devengado 2800, neto 2800
      nomina(b, { sueldoBase: '2800', sueldoNeto: '2800' })
    ]
  })
  assert.deepEqual(r.totales, { sueldoBase: '5300.00', bonos: '350.00', horasExtra: '150.50', descuentos: '80.00', anticipos: '400.00', sueldoNeto: '5320.50' })
  assert.equal(r.resumen.costoDelPeriodo, '5720.50')
  // costo = neto + anticipos descontados
  assert.equal(new Decimal(r.totales.sueldoNeto).plus(r.totales.anticipos).toFixed(2), r.resumen.costoDelPeriodo)
  // y cada fila cumple lo mismo
  for (const f of r.filas) assert.equal(new Decimal(f.sueldoNeto).plus(f.anticipos).toFixed(2), f.devengado)
})

test('PAGADA vs PENDIENTE: pagado y pendiente suman sueldos netos', () => {
  const r = construirReporte({
    periodo: '2026-10',
    nominas: [
      nomina(emp('A', 'a'), { sueldoBase: '1000', sueldoNeto: '1000', estado: 'PAGADA', fechaPago: '2026-10-30' }),
      nomina(emp('B', 'b'), { sueldoBase: '2000', totalAnticipos: '500', sueldoNeto: '1500', estado: 'PAGADA', fechaPago: '2026-10-31' }),
      nomina(emp('C', 'c'), { sueldoBase: '700', sueldoNeto: '700', estado: 'PENDIENTE' })
    ]
  })
  assert.equal(r.resumen.pagado, '2500.00')
  assert.equal(r.resumen.pendiente, '700.00')
  assert.equal(r.resumen.cantidadPagadas, 2)
  assert.equal(r.resumen.cantidadPendientes, 1)
  assert.equal(r.resumen.cantidad, 3)
  assert.equal(r.resumen.costoDelPeriodo, '3700.00') // devengado: 1000 + 2000 + 700 = netos 3200 + anticipos 500
  assert.equal(new Decimal(r.resumen.pagado).plus(r.resumen.pendiente).plus(r.totales.anticipos).toFixed(2), r.resumen.costoDelPeriodo)
  assert.deepEqual(r.filas.map((f) => [f.empleado, f.estadoEtiqueta, f.fechaPago]), [
    ['A a', 'Pagada', '2026-10-30'],
    ['B b', 'Pagada', '2026-10-31'],
    ['C c', 'Pendiente', null]
  ])
})

test('decimales exactos: 0.1 + 0.2', () => {
  const r = construirReporte({
    periodo: '2026-10',
    nominas: [
      nomina(emp('A', 'a'), { sueldoBase: '0.1', sueldoNeto: '0.1', estado: 'PAGADA', fechaPago: '2026-10-31' }),
      nomina(emp('B', 'b'), { sueldoBase: '0.2', sueldoNeto: '0.2' })
    ],
    anticipos: [anticipo(emp('A', 'a'), '2026-10-02', '0.1'), anticipo(emp('B', 'b'), '2026-10-03', '0.2')]
  })
  assert.equal(r.totales.sueldoNeto, '0.30')
  assert.equal(r.resumen.costoDelPeriodo, '0.30')
  assert.equal(new Decimal(r.resumen.pagado).plus(r.resumen.pendiente).toFixed(2), '0.30')
  assert.equal(r.anticiposOtorgados.total, '0.30')
})

test('anticipos fuera del mes no entran; los de dentro (incluidos los dias borde) si', () => {
  const e = emp('Mamani', 'Juan')
  const r = construirReporte({
    periodo: '2026-10',
    anticipos: [
      anticipo(e, '2026-09-30', '999'), // mes anterior
      anticipo(e, '2026-10-01', '100'), // primer dia
      anticipo(e, '2026-10-31', '250.50', { estado: 'DESCONTADO', metodoPago: 'TRANSFERENCIA' }), // ultimo dia
      anticipo(e, '2026-11-01', '999') // mes siguiente
    ]
  })
  assert.equal(r.anticiposOtorgados.cantidad, 2)
  assert.equal(r.anticiposOtorgados.total, '350.50')
  assert.deepEqual(r.anticiposOtorgados.items.map((i) => i.fecha), ['2026-10-01', '2026-10-31'])
  assert.equal(r.anticiposOtorgados.items[1].estadoEtiqueta, 'Descontado')
  // sin nominas el periodo igual muestra los anticipos del mes, y los anticipos no suman al costo del periodo
  assert.equal(r.vacio, true)
  assert.equal(r.resumen.costoDelPeriodo, '0.00')
})

test('solo entran las nominas del periodo pedido y las filas salen por apellidos y nombres', () => {
  const r = construirReporte({
    periodo: '2026-10',
    nominas: [
      nomina(emp('Zeballos', 'Ana'), { sueldoBase: '100', sueldoNeto: '100' }),
      nomina(emp('Alvarez', 'Pedro'), { sueldoBase: '200', sueldoNeto: '200' }),
      nomina(emp('Otro', 'Mes'), { periodo: '2026-09', sueldoBase: '999', sueldoNeto: '999' })
    ]
  })
  assert.deepEqual(r.filas.map((f) => f.empleado), ['Alvarez Pedro', 'Zeballos Ana'])
  assert.equal(r.totales.sueldoNeto, '300.00')
})

test('lista de periodos: mas reciente primero con cantidades y total neto', () => {
  const p = resumirPeriodos([
    { periodo: '2026-09', estado: 'PAGADA', cantidad: 3, total: '7500.50' },
    { periodo: '2026-10', estado: 'PENDIENTE', cantidad: 2, total: '0.1' },
    { periodo: '2026-10', estado: 'PAGADA', cantidad: 1, total: '0.2' },
    { periodo: '2025-12', estado: 'PAGADA', cantidad: 4, total: null }
  ])
  assert.deepEqual(p, [
    { periodo: '2026-10', cantidad: 3, pendientes: 2, pagadas: 1, totalNeto: '0.30' },
    { periodo: '2026-09', cantidad: 3, pendientes: 0, pagadas: 3, totalNeto: '7500.50' },
    { periodo: '2025-12', cantidad: 4, pendientes: 0, pagadas: 4, totalNeto: '0.00' }
  ])
  assert.deepEqual(resumirPeriodos([]), [])
})

test('filtros del historial: rango de periodos y empleado', () => {
  assert.deepEqual(normalizarRangoPeriodos(undefined, ''), { desde: null, hasta: null })
  assert.deepEqual(normalizarRangoPeriodos('2026-01', '2026-10'), { desde: '2026-01', hasta: '2026-10' })
  assert.deepEqual(normalizarRangoPeriodos('2026-10', '2026-10'), { desde: '2026-10', hasta: '2026-10' })
  assert.throws(() => normalizarRangoPeriodos('2026-11', '2026-10'), (e) => e.status === 400 && e.codigo === 'RANGO_INVALIDO')
  assert.throws(() => normalizarRangoPeriodos('2026-13', undefined), (e) => e.status === 400 && e.codigo === 'PERIODO_INVALIDO')
  assert.equal(normalizarFiltroEmpleadoId(' e1 '), 'e1')
  assert.equal(normalizarFiltroEmpleadoId(''), null)
  assert.throws(() => normalizarFiltroEmpleadoId(5), (e) => e.status === 400)
  // el reporte exige periodo valido (cualquier mes pasado vale)
  assert.equal(validarPeriodo('2019-02'), '2019-02')
  assert.throws(() => validarPeriodo(undefined), (e) => e.status === 400)
  assert.throws(() => validarPeriodo('2026-00'), (e) => e.codigo === 'PERIODO_INVALIDO')
})

test('datosParaBoleta: PENDIENTE sin datos de pago, PAGADA con ellos', () => {
  const base = {
    periodo: '2026-10', estado: 'PENDIENTE', sueldoBase: '2500', totalBonos: '350', totalHorasExtra: '150.5', totalDescuentos: '80',
    totalAnticipos: '400', sueldoNeto: '2520.5', fechaPago: null, montoPagado: null, metodoPago: null,
    empleado: { nombres: 'Juan', apellidos: 'Mamani', documento: '1', cargo: 'Conserje', fechaIngreso: new Date('2024-03-01T00:00:00Z') },
    conceptos: [
      { tipo: 'BONO', descripcion: 'Puntualidad', monto: '350', horas: null },
      { tipo: 'HORA_EXTRA', descripcion: 'Turno', monto: '150.5', horas: '8.5' },
      { tipo: 'DESCUENTO', descripcion: 'Falta', monto: '80', horas: null }
    ],
    anticiposAplicados: [{ monto: '400', anticipo: { fecha: new Date('2026-10-05T00:00:00Z'), descripcion: 'Gastos medicos', monto: '400' } }]
  }
  const p = datosParaBoleta(base)
  assert.equal(p.pago, null)
  assert.equal(p.empleado.fechaIngreso, '2024-03-01')
  assert.deepEqual(p.horasExtra, [{ descripcion: 'Turno', horas: '8.50', monto: '150.50' }])
  assert.deepEqual(p.anticipos, [{ fecha: '2026-10-05', descripcion: 'Gastos medicos', monto: '400.00' }])
  assert.deepEqual(p.totales, { bonos: '350.00', horasExtra: '150.50', descuentos: '80.00', anticipos: '400.00', totalGanado: '3000.50', sueldoNeto: '2520.50' })

  const pagada = datosParaBoleta({ ...base, estado: 'PAGADA', fechaPago: new Date('2026-10-31T12:00:00-04:00'), montoPagado: '2520.5', metodoPago: 'TRANSFERENCIA' })
  assert.deepEqual(pagada.pago, { fechaPago: '2026-10-31', metodoPago: 'TRANSFERENCIA', montoPagado: '2520.50' })
})
