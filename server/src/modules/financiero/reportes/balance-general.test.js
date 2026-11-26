// Pruebas del balance general gerencial (HU13). Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/balance-general.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { anticiposPendientes, construirBalanceGeneral, validarFechaCorte, NOTA, NOTA_FECHA_CORTE } = require('./balance-general.util')
const { generarBalanceGeneralPdf, nombreArchivoBalanceGeneral } = require('./balance-general-pdf.service')
const { generarBalanceGeneralExcel, nombreArchivoBalanceGeneralExcel } = require('./balance-general-excel.service')

const entradas = () => ({
  efectivo: '5000.50',
  cuentasPorCobrar: { monto: '2300.25', cantidad: 7 },
  anticiposPendientes: { monto: '400', cantidad: 2 },
  saldosAFavor: '600.10',
  sueldosPorPagar: { monto: '3000', cantidad: 3 }
})

test('anticipos pendientes: monto menos lo ya descontado, sin negativos', () => {
  const r = anticiposPendientes([
    { monto: '500', montoDescontado: '200' },
    { monto: '100', montoDescontado: '0' },
    { monto: '50', montoDescontado: '50' },
    { monto: '30', montoDescontado: '40' }
  ])
  assert.equal(r.monto.toFixed(2), '400.00')
  assert.equal(r.cantidad, 2)
  assert.deepEqual(anticiposPendientes([]), { monto: anticiposPendientes([]).monto, cantidad: 0 })
})

test('activos: efectivo y cuentas por cobrar con subtotales y total', () => {
  const b = construirBalanceGeneral(entradas())
  const [efectivo, cobrar] = b.activos.grupos
  assert.equal(efectivo.nombre, 'Efectivo y bancos')
  assert.equal(efectivo.subtotal, '5000.50')
  assert.equal(cobrar.nombre, 'Cuentas por cobrar')
  assert.equal(cobrar.lineas.length, 2)
  assert.equal(cobrar.lineas[0].cantidad, 7)
  assert.equal(cobrar.subtotal, '2700.25') // 2300.25 + 400
  assert.equal(b.activos.total, '7700.75')
})

test('pasivos: saldos a favor y sueldos por pagar', () => {
  const b = construirBalanceGeneral(entradas())
  assert.deepEqual(b.pasivos.grupos.map((g) => g.subtotal), ['600.10', '3000.00'])
  assert.equal(b.pasivos.grupos[1].lineas[0].cantidad, 3)
  assert.equal(b.pasivos.total, '3600.10')
})

test('patrimonio: activos menos pasivos y verificacion de la igualdad', () => {
  const b = construirBalanceGeneral(entradas())
  assert.equal(b.patrimonio.total, '4100.65')
  assert.equal(b.patrimonio.grupos[0].subtotal, '4100.65')
  assert.deepEqual(b.verificacion, {
    formula: 'activos = pasivos + patrimonio',
    activos: '7700.75',
    pasivosMasPatrimonio: '7700.75',
    coincide: true
  })
})

test('patrimonio negativo cuando los pasivos superan a los activos', () => {
  const b = construirBalanceGeneral({ efectivo: '-100', saldosAFavor: '50' })
  assert.equal(b.activos.total, '-100.00')
  assert.equal(b.patrimonio.total, '-150.00')
  assert.equal(b.verificacion.coincide, true)
})

test('sin datos: todo en cero y la igualdad se cumple', () => {
  const b = construirBalanceGeneral()
  assert.equal(b.activos.total, '0.00')
  assert.equal(b.pasivos.total, '0.00')
  assert.equal(b.patrimonio.total, '0.00')
  assert.equal(b.verificacion.coincide, true)
})

test('los centavos no se pierden al sumar', () => {
  const b = construirBalanceGeneral({ efectivo: '0.10', cuentasPorCobrar: { monto: '0.20', cantidad: 1 } })
  assert.equal(b.activos.total, '0.30')
})

test('encabezado: titulo, tipo, fecha de corte en hora de Bolivia, usuario y nota de limitaciones', () => {
  const generadoEn = new Date('2026-11-15T02:00:00Z') // 14 de noviembre 22:00 en La Paz
  const generadoPor = { id: 'u1', nombre: 'Ana Perez', rol: 'DIRECTORIO' }
  const b = construirBalanceGeneral({ ...entradas(), generadoEn, generadoPor })
  assert.equal(b.titulo, 'Balance general')
  assert.equal(b.tipoReporte, 'BALANCE_GENERAL')
  assert.equal(b.fechaCorte, '2026-11-14')
  assert.equal(b.generadoEn, generadoEn.toISOString())
  assert.deepEqual(b.generadoPor, generadoPor)
  assert.equal(
    b.nota,
    'Balance gerencial a la fecha de emisión, basado en lo registrado; no incluye activos fijos, proveedores, reservas ni depreciación'
  )
  assert.equal(b.nota, NOTA)
})

test('PDF: se genera con los mismos datos', async () => {
  const b = construirBalanceGeneral({ ...entradas(), generadoPor: { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' } })
  const pdf = await generarBalanceGeneralPdf(b)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(nombreArchivoBalanceGeneral(b), `balance-general-${b.fechaCorte}.pdf`)
  const vacio = await generarBalanceGeneralPdf(construirBalanceGeneral())
  assert.equal(vacio.subarray(0, 5).toString(), '%PDF-')
})

// --- Fecha de corte opcional ("hasta") ----------------------------------------------------------------------------

const HOY = '2026-11-17'
const generadoEnFijo = new Date('2026-11-17T15:00:00.000Z') // 11:00 en Bolivia: el mismo dia

test('sin hasta: el balance es el de siempre (sin campos nuevos ni cambios en la nota)', () => {
  assert.equal(validarFechaCorte(undefined, HOY), null)
  assert.equal(validarFechaCorte(null, HOY), null)
  assert.equal(validarFechaCorte('', HOY), null)
  assert.equal(validarFechaCorte('   ', HOY), null)
  const b = construirBalanceGeneral({ ...entradas(), generadoEn: generadoEnFijo })
  assert.equal(b.fechaCorte, HOY)
  assert.equal(b.nota, NOTA)
  assert.ok(!('fechaEmision' in b))
  // Pasar fechaCorte nula equivale a no pasarla.
  assert.deepEqual(construirBalanceGeneral({ ...entradas(), generadoEn: generadoEnFijo, fechaCorte: null }), b)
})

test('con hasta: fechaCorte es esa fecha, la emision queda aparte y la nota agrega la aclaracion', () => {
  assert.equal(validarFechaCorte('2026-10-31', HOY), '2026-10-31')
  assert.equal(validarFechaCorte(' 2026-10-31 ', HOY), '2026-10-31')
  const b = construirBalanceGeneral({ ...entradas(), generadoEn: generadoEnFijo, fechaCorte: '2026-10-31' })
  assert.equal(b.fechaCorte, '2026-10-31')
  assert.equal(b.fechaEmision, HOY)
  assert.equal(b.nota, `${NOTA}. ${NOTA_FECHA_CORTE}`)
  assert.ok(b.nota.includes('Efectivo calculado a la fecha de corte; cuentas por cobrar, saldos a favor y sueldos por pagar reflejan la situación a la fecha de emisión'))
  // Las cifras y la verificacion no cambian por usar una fecha de corte.
  const sin = construirBalanceGeneral({ ...entradas(), generadoEn: generadoEnFijo })
  assert.deepEqual(b.activos, sin.activos)
  assert.deepEqual(b.pasivos, sin.pasivos)
  assert.deepEqual(b.verificacion, sin.verificacion)
  assert.equal(b.verificacion.coincide, true)
})

test('con hasta igual a hoy es valido (no es futura)', () => {
  assert.equal(validarFechaCorte(HOY, HOY), HOY)
})

test('con hasta futura: 400 FECHA_FUTURA', () => {
  assert.throws(() => validarFechaCorte('2026-11-18', HOY), { status: 400, codigo: 'FECHA_FUTURA' })
  assert.throws(() => validarFechaCorte('2027-01-01', HOY), { status: 400, codigo: 'FECHA_FUTURA' })
})

test('con hasta de formato invalido: 400 FECHA_INVALIDA', () => {
  const invalida = { status: 400, codigo: 'FECHA_INVALIDA' }
  assert.throws(() => validarFechaCorte('17/11/2026', HOY), invalida)
  assert.throws(() => validarFechaCorte('ayer', HOY), invalida)
  assert.throws(() => validarFechaCorte('2026-13-01', HOY), invalida) // mes imposible
  assert.throws(() => validarFechaCorte('2026-02-31', HOY), invalida) // dia imposible
  assert.throws(() => validarFechaCorte(['2026-10-31', '2026-10-30'], HOY), invalida) // ?hasta=a&hasta=b
})

test('PDF y Excel con hasta: el archivo lleva la fecha de corte y se generan', async () => {
  const b = construirBalanceGeneral({ ...entradas(), generadoEn: generadoEnFijo, fechaCorte: '2026-10-31' })
  assert.equal(nombreArchivoBalanceGeneral(b), 'balance-general-2026-10-31.pdf')
  assert.equal(nombreArchivoBalanceGeneralExcel(b), 'balance-general-2026-10-31.xlsx')
  assert.equal((await generarBalanceGeneralPdf(b)).subarray(0, 5).toString(), '%PDF-')
  assert.equal((await generarBalanceGeneralExcel(b)).subarray(0, 2).toString(), 'PK')
})
