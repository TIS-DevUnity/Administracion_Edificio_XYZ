// Pruebas del flujo de caja (HU13). Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/flujo-caja.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { validarTipo, diaAnterior, agruparPorCategoria, construirFlujoCaja, MENSAJE_VACIO } = require('./flujo-caja.util')
const { generarFlujoCajaPdf, nombreArchivoFlujoCaja } = require('./flujo-caja-pdf.service')

const rango = { desde: '2026-10-01', hasta: '2026-10-31' }
const emp = { nombres: 'Luis', apellidos: 'Rojas' }

const recibo = (id, monto, fechaPago, codigo = '101', periodo = '2026-10') => ({
  id,
  montoTotal: monto,
  fechaPago: new Date(fechaPago),
  inmueble: { codigo },
  pagos: [{ expensa: { periodo } }]
})
const extra = (id, tipo, monto, fecha, categoria, concepto = 'Concepto') => ({
  id,
  tipo,
  monto,
  fecha: new Date(`${fecha}T00:00:00Z`),
  createdAt: new Date(`${fecha}T12:00:00Z`),
  concepto,
  categoria: { nombre: categoria }
})
const nomina = (id, monto, fechaPago) => ({ id, montoPagado: monto, fechaPago: new Date(fechaPago), periodo: '2026-09', empleado: emp, metodoPago: 'EFECTIVO' })
const anticipo = (id, monto, fecha) => ({ id, monto, fecha: new Date(`${fecha}T00:00:00Z`), createdAt: new Date(`${fecha}T10:00:00Z`), empleado: emp, metodoPago: 'EFECTIVO', descripcion: 'Adelanto' })

const datos = () => ({
  recibos: [recibo('r1', '300', '2026-10-05T15:00:00Z'), recibo('r2', '200.50', '2026-10-02T15:00:00Z', '102')],
  extraordinarios: [
    extra('m1', 'INGRESO', '100', '2026-10-10', 'Alquiler de salón'),
    extra('m2', 'EGRESO', '80.25', '2026-10-08', 'Mantenimiento'),
    extra('m3', 'EGRESO', '19.75', '2026-10-09', 'Mantenimiento'),
    extra('m4', 'EGRESO', '50', '2026-10-12', 'Limpieza')
  ],
  nominas: [nomina('n1', '1000', '2026-10-15T16:00:00Z')],
  anticipos: [anticipo('a1', '150', '2026-10-03')]
})

test('validacion del tipo: opcional, Ingreso o Gasto sin importar mayusculas', () => {
  assert.equal(validarTipo(undefined), null)
  assert.equal(validarTipo(''), null)
  assert.equal(validarTipo('ingreso'), 'INGRESO')
  assert.equal(validarTipo('Gasto'), 'GASTO')
  assert.equal(validarTipo('egreso'), 'GASTO')
  assert.throws(() => validarTipo('otro'), { status: 400, codigo: 'TIPO_INVALIDO' })
})

test('validacion de fechas: obligatorias y desde <= hasta', () => {
  assert.throws(() => construirFlujoCaja({ hasta: '2026-10-31' }), { status: 400, codigo: 'FECHA_REQUERIDA' })
  assert.throws(() => construirFlujoCaja({ desde: '2026-11-01', hasta: '2026-10-31' }), { status: 400, codigo: 'RANGO_INVALIDO' })
})

test('el saldo inicial llega hasta el dia anterior a desde', () => {
  assert.equal(diaAnterior('2026-10-01'), '2026-09-30')
  assert.equal(diaAnterior('2026-01-01'), '2025-12-31')
})


test('totales: ingresos, egresos, saldo final y verificacion contra el saldo del edificio', () => {
  const r = construirFlujoCaja({ ...rango, ...datos(), saldoInicial: '1000', saldoEdificioAlCierre: '300.50' })
  assert.equal(r.totalIngresos, '600.50') // 500.50 de expensas + 100 de otros
  assert.equal(r.totalEgresos, '1300.00') // 100 + 50 de categorias + 1000 de sueldos + 150 de anticipos
  assert.equal(r.saldoInicial, '1000.00')
  assert.equal(r.saldoFinal, '300.50')
  assert.equal(r.verificacion.coincide, true)
  assert.equal(r.verificacion.saldoFinalCalculado, '300.50')
})

test('verificacion: detecta una diferencia y queda sin verificar si no hay saldo del edificio', () => {
  const base = { ...rango, ...datos(), saldoInicial: '1000' }
  assert.equal(construirFlujoCaja({ ...base, saldoEdificioAlCierre: '999' }).verificacion.coincide, false)
  assert.equal(construirFlujoCaja(base).verificacion.coincide, null)
})

test('ingresos: expensas aparte y otros conceptos por categoria', () => {
  const r = construirFlujoCaja({ ...rango, ...datos() })
  assert.deepEqual(r.ingresos.expensas, { total: '500.50', cantidad: 2 })
  assert.deepEqual(r.ingresos.otros, [{ categoria: 'Alquiler de salón', total: '100.00', cantidad: 1 }])
  assert.equal(r.ingresos.total, '600.50')
})

test('egresos: por categoria y lineas fijas de personal', () => {
  const r = construirFlujoCaja({ ...rango, ...datos() })
  assert.deepEqual(r.egresos.porCategoria, [
    { categoria: 'Limpieza', total: '50.00', cantidad: 1 },
    { categoria: 'Mantenimiento', total: '100.00', cantidad: 2 }
  ])
  assert.deepEqual(r.egresos.personal, {
    sueldos: { total: '1000.00', cantidad: 1 },
    anticipos: { total: '150.00', cantidad: 1 },
    total: '1150.00'
  })
  assert.equal(r.egresos.total, '1300.00')
})

test('agrupar por categoria suma sin perder centavos', () => {
  const g = agruparPorCategoria([{ categoria: { nombre: 'A' }, monto: '0.10' }, { categoria: { nombre: 'A' }, monto: '0.20' }, { monto: '1' }])
  assert.equal(g.find((x) => x.categoria === 'A').total.toFixed(2), '0.30')
  assert.ok(g.some((x) => x.categoria === 'Sin categoría'))
})

test('movimientos: orden cronologico y signo segun el tipo', () => {
  const r = construirFlujoCaja({ ...rango, ...datos() })
  const fechas = r.movimientos.map((m) => m.fecha)
  assert.deepEqual(fechas, [...fechas].sort())
  assert.equal(r.movimientos.length, 8)
  const suma = r.movimientos.reduce((s, m) => s + Number(m.montoConSigno), 0)
  assert.equal(suma.toFixed(2), '-699.50') // ingresos 600.50 - egresos 1300
  assert.equal(r.movimientos[0].fecha, '2026-10-02')
  assert.ok(r.movimientos.filter((m) => m.tipo === 'GASTO').every((m) => Number(m.montoConSigno) < 0))
})

test('el filtro tipo solo afecta a la lista: los totales y saldos siguen completos', () => {
  const todos = construirFlujoCaja({ ...rango, ...datos(), saldoInicial: '10' })
  const gastos = construirFlujoCaja({ ...rango, ...datos(), saldoInicial: '10', tipo: 'Gasto' })
  assert.ok(gastos.movimientos.length > 0 && gastos.movimientos.every((m) => m.tipo === 'GASTO'))
  assert.equal(gastos.tipo, 'Gasto')
  assert.equal(gastos.totalIngresos, todos.totalIngresos)
  assert.equal(gastos.saldoFinal, todos.saldoFinal)
  const ingresos = construirFlujoCaja({ ...rango, ...datos(), tipo: 'ingreso' })
  assert.ok(ingresos.movimientos.every((m) => m.tipo === 'INGRESO'))
  assert.equal(ingresos.movimientos.length, 3)
})

test('sin movimientos: lista vacia con mensaje y saldo final igual al inicial', () => {
  const r = construirFlujoCaja({ ...rango, saldoInicial: '250.75', saldoEdificioAlCierre: '250.75' })
  assert.equal(r.vacio, true)
  assert.equal(r.mensaje, MENSAJE_VACIO)
  assert.deepEqual(r.movimientos, [])
  assert.equal(r.saldoFinal, '250.75')
  assert.equal(r.totalIngresos, '0.00')
  assert.equal(r.verificacion.coincide, true)
})

test('encabezado: titulo, tipo de reporte, rango, fecha y usuario', () => {
  const generadoEn = new Date('2026-11-14T15:30:00Z')
  const generadoPor = { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' }
  const r = construirFlujoCaja({ ...rango, generadoEn, generadoPor })
  assert.equal(r.titulo, 'Flujo de caja')
  assert.equal(r.tipoReporte, 'FLUJO_CAJA')
  assert.deepEqual(r.rango, rango)
  assert.equal(r.generadoEn, generadoEn.toISOString())
  assert.deepEqual(r.generadoPor, generadoPor)
  assert.equal(r.saldoInicialAl, '2026-09-30')
})

test('PDF: se genera con los mismos datos, vacio y con varias paginas', async () => {
  const generadoPor = { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' }
  const vacio = await generarFlujoCajaPdf(construirFlujoCaja({ ...rango, generadoPor }))
  assert.equal(vacio.subarray(0, 5).toString(), '%PDF-')

  const muchos = Array.from({ length: 120 }, (_, i) => extra(`x${i}`, 'EGRESO', '10', '2026-10-10', `Cat ${i % 7}`, `Gasto ${i}`))
  const flujo = construirFlujoCaja({ ...rango, ...datos(), extraordinarios: muchos, generadoPor, saldoInicial: '5000', saldoEdificioAlCierre: '3600.50' })
  const pdf = await generarFlujoCajaPdf(flujo)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length > 1, 'debe ocupar mas de una pagina')
  assert.equal(nombreArchivoFlujoCaja(flujo), 'flujo-caja-2026-10-01-a-2026-10-31.pdf')
})
