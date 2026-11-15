// Pruebas de los Excel de los reportes financieros (HU13). Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/excel.test.js
// Generan el .xlsx en memoria, lo vuelven a abrir con exceljs y comparan contra el objeto del reporte (el mismo que
// usan la vista previa JSON y el PDF). No tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const ExcelJS = require('exceljs')
const { construirListadoMorosos } = require('./morosos.util')
const { construirFlujoCaja } = require('./flujo-caja.util')
const { construirBalanceGeneral } = require('./balance-general.util')
const { generarMorososExcel, nombreArchivoMorososExcel } = require('./morosos-excel.service')
const { generarFlujoCajaExcel, nombreArchivoFlujoCajaExcel } = require('./flujo-caja-excel.service')
const { generarBalanceGeneralExcel, nombreArchivoBalanceGeneralExcel } = require('./balance-general-excel.service')
const { FORMATO_MONEDA } = require('./excel-comun.util')

const generadoEn = new Date('2026-11-14T21:30:00Z') // 17:30 en La Paz
const generadoPor = { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' }

async function abrir(buffer) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  return libro
}

/** Todas las filas de una hoja como arreglos de valores de celda (columna A en el indice 0). */
function filasDe(hoja) {
  const filas = []
  hoja.eachRow({ includeEmpty: false }, (fila) => filas.push(fila.values.slice(1)))
  return filas
}
const buscar = (hoja, texto) => hoja.getRows(1, hoja.rowCount).find((f) => f.getCell(1).value === texto)
const celdasDe = (hoja) => filasDe(hoja).flat()

function comprobarEncabezado(hoja, titulo) {
  const textos = celdasDe(hoja).filter((v) => typeof v === 'string')
  assert.ok(textos.includes('Edificio XYZ'), 'lleva el nombre del edificio')
  assert.ok(textos.includes(titulo), `lleva el titulo "${titulo}"`)
  assert.ok(textos.some((t) => t.startsWith('Fecha de generación: ') && t.includes('14 de noviembre de 2026')), 'lleva la fecha de generacion')
  assert.ok(textos.includes('Generado por: Ana Perez'), 'lleva el usuario')
}

// --- datos de ejemplo --------------------------------------------------------------------------------------------

let n = 0
const exp = (inmueble, periodo, vence, extra = {}) => ({
  id: `e${++n}`,
  inmuebleId: `i-${inmueble}`,
  inmuebleCodigo: inmueble,
  periodo,
  fechaVencimiento: new Date(`${vence}T00:00:00Z`),
  montoTotal: '300',
  montoMora: '0',
  pagos: [],
  planPagoId: null,
  responsableId: `r-${inmueble}`,
  responsableNombre: `Resp ${inmueble}`,
  ...extra
})
const listadoMorosos = () =>
  construirListadoMorosos({
    expensas: [
      exp('101', '2026-05', '2026-05-10', { montoMora: '15.50', pagos: [{ montoExpensa: '100.25', montoMora: '0' }] }),
      exp('101', '2026-06', '2026-06-10'),
      exp('102', '2026-07', '2026-07-10')
    ],
    desde: '2026-01-01',
    hasta: '2026-10-31',
    hoy: '2026-11-14',
    generadoEn,
    generadoPor
  })

const flujo = () =>
  construirFlujoCaja({
    desde: '2026-10-01',
    hasta: '2026-10-31',
    saldoInicial: '1000',
    saldoEdificioAlCierre: '400.50',
    recibos: [
      { id: 'r1', montoTotal: '300', fechaPago: new Date('2026-10-05T15:00:00Z'), inmueble: { codigo: '101' }, pagos: [{ expensa: { periodo: '2026-10' } }] },
      { id: 'r2', montoTotal: '200.50', fechaPago: new Date('2026-10-02T15:00:00Z'), inmueble: { codigo: '102' }, pagos: [] }
    ],
    extraordinarios: [
      { id: 'm1', tipo: 'INGRESO', monto: '100', fecha: new Date('2026-10-10T00:00:00Z'), createdAt: new Date('2026-10-10T12:00:00Z'), concepto: 'Alquiler', categoria: { nombre: 'Alquiler de salón' } },
      { id: 'm2', tipo: 'EGRESO', monto: '100', fecha: new Date('2026-10-08T00:00:00Z'), createdAt: new Date('2026-10-08T12:00:00Z'), concepto: 'Arreglo', categoria: { nombre: 'Mantenimiento' } }
    ],
    nominas: [{ id: 'n1', montoPagado: '1000', fechaPago: new Date('2026-10-15T16:00:00Z'), periodo: '2026-09', empleado: { nombres: 'Luis', apellidos: 'Rojas' }, metodoPago: 'EFECTIVO' }],
    anticipos: [{ id: 'a1', monto: '100', fecha: new Date('2026-10-03T00:00:00Z'), createdAt: new Date('2026-10-03T10:00:00Z'), empleado: { nombres: 'Luis', apellidos: 'Rojas' }, metodoPago: 'EFECTIVO', descripcion: 'Adelanto' }],
    generadoEn,
    generadoPor
  })

const balance = () =>
  construirBalanceGeneral({
    efectivo: '5000.50',
    cuentasPorCobrar: { monto: '2300.25', cantidad: 7 },
    anticiposPendientes: { monto: '400', cantidad: 2 },
    saldosAFavor: '600.10',
    sueldosPorPagar: { monto: '3000', cantidad: 3 },
    generadoEn,
    generadoPor
  })

// --- Morosos -----------------------------------------------------------------------------------------------------

test('morosos: hojas, encabezado, filas con numeros reales y totales', async () => {
  const datos = listadoMorosos()
  const libro = await abrir(await generarMorososExcel(datos))
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['Morosos', 'Detalle'])
  const hoja = libro.getWorksheet('Morosos')
  comprobarEncabezado(hoja, 'Listado de morosos')

  const fila101 = buscar(hoja, '101')
  const f = datos.filas.find((x) => x.inmueble === '101')
  assert.equal(fila101.getCell(2).value, 'Resp 101')
  assert.equal(fila101.getCell(3).value, '2026-05')
  assert.equal(fila101.getCell(4).value, '2026-06')
  assert.equal(fila101.getCell(5).value, f.diasMora)
  for (const [col, valor] of [[6, f.montoPendiente], [7, f.interesMora], [8, f.totalAcumulado]]) {
    const celda = fila101.getCell(col)
    assert.equal(typeof celda.value, 'number', `columna ${col} es numero real`)
    assert.equal(celda.value, Number(valor))
    assert.equal(celda.numFmt, FORMATO_MONEDA)
  }

  const total = hoja.getRows(1, hoja.rowCount).find((r) => String(r.getCell(1).value).startsWith('Total ('))
  assert.equal(total.getCell(1).value, 'Total (2 inmuebles)')
  assert.equal(total.getCell(6).value, Number(datos.totales.montoPendiente))
  assert.equal(total.getCell(7).value, Number(datos.totales.interesMora))
  assert.equal(total.getCell(8).value, Number(datos.totales.totalAcumulado))
})

test('morosos: el detalle trae una fila por expensa con fecha real y suma lo mismo que el total', async () => {
  const datos = listadoMorosos()
  const hoja = (await abrir(await generarMorososExcel(datos))).getWorksheet('Detalle')
  const filas = filasDe(hoja).filter((r) => typeof r[7] === 'number')
  assert.equal(filas.length, datos.totales.expensas)
  assert.ok(filas.every((r) => r[3] instanceof Date), 'vencimiento como fecha real')
  const suma = filas.reduce((s, r) => s + r[7], 0)
  assert.equal(suma.toFixed(2), datos.totales.totalAcumulado)
})

test('morosos: sin registros deja el mensaje y ninguna tabla', async () => {
  const vacio = construirListadoMorosos({ expensas: [], desde: '2026-01-01', hasta: '2026-10-31', hoy: '2026-11-14', generadoEn, generadoPor })
  const hoja = (await abrir(await generarMorososExcel(vacio))).getWorksheet('Morosos')
  assert.ok(celdasDe(hoja).includes(vacio.mensaje))
  assert.ok(!celdasDe(hoja).includes('Total acumulado'))
  comprobarEncabezado(hoja, 'Listado de morosos')
})

test('morosos: nombre del archivo', () => {
  assert.equal(nombreArchivoMorososExcel(listadoMorosos()), 'listado-morosos-2026-01-01-a-2026-10-31.xlsx')
})

// --- Flujo de caja -----------------------------------------------------------------------------------------------

test('flujo de caja: hojas, resumen numerico y verificacion', async () => {
  const datos = flujo()
  const libro = await abrir(await generarFlujoCajaExcel(datos))
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['Resumen', 'Ingresos y egresos', 'Movimientos'])
  const resumen = libro.getWorksheet('Resumen')
  comprobarEncabezado(resumen, 'Flujo de caja')

  const valor = (texto) => buscar(resumen, texto).getCell(2).value
  assert.equal(valor('Saldo inicial (al 2026-09-30)'), Number(datos.saldoInicial))
  assert.equal(valor('Total ingresos'), Number(datos.totalIngresos))
  assert.equal(valor('Total egresos'), Number(datos.totalEgresos))
  assert.equal(valor('Saldo final'), Number(datos.saldoFinal))
  assert.equal(buscar(resumen, 'Saldo final').getCell(2).numFmt, FORMATO_MONEDA)
  assert.equal(valor('Saldo del edificio al 2026-10-31'), 400.5)
  // saldo inicial + ingresos - egresos = saldo final, tambien sobre los numeros de la hoja
  assert.equal((valor('Saldo inicial (al 2026-09-30)') + valor('Total ingresos') - valor('Total egresos')).toFixed(2), '400.50')
  assert.equal(buscar(resumen, 'Verificación (saldo inicial + ingresos - egresos = saldo final)').getCell(2).value, 'Coincide con el saldo del edificio')
})

test('flujo de caja: ingresos y egresos por concepto con totales', async () => {
  const datos = flujo()
  const hoja = (await abrir(await generarFlujoCajaExcel(datos))).getWorksheet('Ingresos y egresos')
  const filas = filasDe(hoja)
  const monto = (seccion, concepto) => filas.find((r) => r[0] === seccion && r[1] === concepto)[3]
  assert.equal(monto('Ingresos', 'Pagos de expensas'), 500.5)
  assert.equal(monto('Ingresos', 'Alquiler de salón'), 100)
  assert.equal(monto('Ingresos', 'Total ingresos'), Number(datos.ingresos.total))
  assert.equal(monto('Egresos', 'Mantenimiento'), 100)
  assert.equal(monto('Egresos', 'Sueldos'), 1000)
  assert.equal(monto('Egresos', 'Anticipos salariales'), 100)
  assert.equal(monto('Egresos', 'Total egresos'), Number(datos.egresos.total))
})

test('flujo de caja: movimientos en orden cronologico, con fecha real y egresos en negativo', async () => {
  const datos = flujo()
  const hoja = (await abrir(await generarFlujoCajaExcel(datos))).getWorksheet('Movimientos')
  const filas = filasDe(hoja).filter((r) => r[0] instanceof Date)
  assert.equal(filas.length, datos.movimientos.length)
  const fechas = filas.map((r) => r[0].toISOString().slice(0, 10))
  assert.deepEqual(fechas, [...fechas].sort())
  assert.deepEqual(filas.map((r) => r[4]), datos.movimientos.map((m) => Number(m.montoConSigno)))
  assert.ok(filas.filter((r) => r[3] === 'Gasto').every((r) => r[4] < 0))
  assert.ok(filas.every((r) => typeof r[4] === 'number'))
  const neto = hoja.getRows(1, hoja.rowCount).find((r) => r.getCell(2).value === 'Neto de los movimientos listados')
  assert.equal(neto.getCell(5).value, -599.5)
})

test('flujo de caja: sin movimientos deja el mensaje y el saldo final igual al inicial', async () => {
  const vacio = construirFlujoCaja({ desde: '2026-10-01', hasta: '2026-10-31', saldoInicial: '250.75', saldoEdificioAlCierre: '250.75', generadoEn, generadoPor })
  const libro = await abrir(await generarFlujoCajaExcel(vacio))
  assert.equal(buscar(libro.getWorksheet('Resumen'), 'Saldo final').getCell(2).value, 250.75)
  assert.ok(celdasDe(libro.getWorksheet('Movimientos')).includes(vacio.mensaje))
  assert.ok(celdasDe(libro.getWorksheet('Resumen')).includes(vacio.mensaje))
})

test('flujo de caja: el filtro tipo solo cambia la hoja de movimientos', async () => {
  const todos = flujo()
  const solo = construirFlujoCaja({ ...{ desde: '2026-10-01', hasta: '2026-10-31' }, tipo: 'Gasto', generadoEn, generadoPor, saldoInicial: '1000' })
  assert.equal(solo.tipo, 'Gasto')
  const hoja = (await abrir(await generarFlujoCajaExcel(todos))).getWorksheet('Resumen')
  assert.ok(!celdasDe(hoja).some((t) => typeof t === 'string' && t.startsWith('Movimientos listados')))
  const conFiltro = (await abrir(await generarFlujoCajaExcel(solo))).getWorksheet('Resumen')
  assert.ok(celdasDe(conFiltro).includes('Movimientos listados: solo gastos'))
})

test('flujo de caja: nombre del archivo', () => {
  assert.equal(nombreArchivoFlujoCajaExcel(flujo()), 'flujo-caja-2026-10-01-a-2026-10-31.xlsx')
})

// --- Balance general ---------------------------------------------------------------------------------------------

test('balance general: hojas, nota de limitaciones, subtotales, totales y verificacion', async () => {
  const datos = balance()
  const libro = await abrir(await generarBalanceGeneralExcel(datos))
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['Balance', 'Datos'])
  const hoja = libro.getWorksheet('Balance')
  comprobarEncabezado(hoja, 'Balance general')
  assert.ok(celdasDe(hoja).includes(datos.nota), 'la nota de limitaciones esta en la hoja')
  assert.equal(
    datos.nota,
    'Balance gerencial a la fecha de emisión, basado en lo registrado; no incluye activos fijos, proveedores, reservas ni depreciación'
  )

  const monto = (texto) => buscar(hoja, texto).getCell(3).value
  assert.equal(monto('Subtotal efectivo y bancos'), 5000.5)
  assert.equal(monto('Subtotal cuentas por cobrar'), 2700.25)
  assert.equal(monto('Total activos'), Number(datos.activos.total))
  assert.equal(monto('Total pasivos'), Number(datos.pasivos.total))
  assert.equal(monto('Total patrimonio'), Number(datos.patrimonio.total))
  assert.equal(buscar(hoja, 'Total activos').getCell(3).numFmt, FORMATO_MONEDA)
  assert.equal(monto('Total activos'), monto('Total pasivos') + monto('Total patrimonio'))
  assert.equal(monto('Pasivos + patrimonio'), monto('Total activos'))
  assert.ok(celdasDe(hoja).includes('activos = pasivos + patrimonio: se cumple'))
})

test('balance general: la hoja Datos repite las lineas con numeros reales', async () => {
  const datos = balance()
  const hoja = (await abrir(await generarBalanceGeneralExcel(datos))).getWorksheet('Datos')
  const filas = filasDe(hoja).filter((r) => ['Activos', 'Pasivos', 'Patrimonio'].includes(r[0]))
  const lineas = [datos.activos, datos.pasivos, datos.patrimonio].flatMap((b) => b.grupos.flatMap((g) => g.lineas))
  assert.equal(filas.length, lineas.length)
  assert.deepEqual(filas.map((r) => r[4]), lineas.map((l) => Number(l.monto)))
  assert.ok(filas.every((r) => typeof r[4] === 'number'))
  const cobrar = filas.find((r) => r[2].startsWith('Expensas pendientes'))
  assert.equal(cobrar[3], 7)
})

test('balance general: sin datos todo queda en cero y la nota sigue visible', async () => {
  const vacio = construirBalanceGeneral({ generadoEn, generadoPor })
  const hoja = (await abrir(await generarBalanceGeneralExcel(vacio))).getWorksheet('Balance')
  assert.equal(buscar(hoja, 'Total activos').getCell(3).value, 0)
  assert.ok(celdasDe(hoja).includes(vacio.nota))
})

test('balance general: nombre del archivo', () => {
  assert.equal(nombreArchivoBalanceGeneralExcel(balance()), 'balance-general-2026-11-14.xlsx')
})
