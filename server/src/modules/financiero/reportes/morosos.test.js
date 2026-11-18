// Pruebas del listado de morosos (HU13). Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/morosos.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validarFecha,
  validarRango,
  validarOrden,
  diasDeAtraso,
  expensasMorosas,
  agruparPorInmueble,
  ordenarFilas,
  construirListadoMorosos,
  MENSAJE_VACIO
} = require('./morosos.util')
const { generarMorososPdf, nombreArchivoMorosos } = require('./morosos-pdf.service')

const HOY = '2026-11-14'
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
const rango = { desde: '2026-01-01', hasta: '2026-10-31' }
const construir = (expensas, extra = {}) => construirListadoMorosos({ expensas, ...rango, hoy: HOY, ...extra })

test('dias de atraso: cuenta desde el vencimiento hasta hoy y nunca es negativo', () => {
  assert.equal(diasDeAtraso('2026-11-04', HOY), 10)
  assert.equal(diasDeAtraso('2026-11-14', HOY), 0)
  assert.equal(diasDeAtraso('2026-11-20', HOY), 0)
})

test('validacion de fechas: obligatorias, reales y desde <= hasta', () => {
  assert.deepEqual(validarRango({ desde: '2026-01-01', hasta: '2026-01-01' }), { desde: '2026-01-01', hasta: '2026-01-01' })
  assert.throws(() => validarRango({ hasta: '2026-01-01' }), { status: 400, codigo: 'FECHA_REQUERIDA' })
  assert.throws(() => validarRango({ desde: '2026-01-01', hasta: '' }), { status: 400, codigo: 'FECHA_REQUERIDA' })
  assert.throws(() => validarRango({ desde: '01/01/2026', hasta: '2026-01-31' }), { status: 400, codigo: 'FECHA_INVALIDA' })
  assert.throws(() => validarRango({ desde: '2026-02-30', hasta: '2026-03-01' }), { status: 400, codigo: 'FECHA_INVALIDA' })
  assert.throws(() => validarRango({ desde: '2026-02-01', hasta: '2026-01-31' }), { status: 400, codigo: 'RANGO_INVALIDO' })
})

test('validarFecha: fecha con formato valido pero imposible da 400 FECHA_INVALIDA, no RangeError', () => {
  const invalida = { status: 400, codigo: 'FECHA_INVALIDA' }
  assert.throws(() => validarFecha('2026-13-01', 'desde'), invalida) // mes 13
  assert.throws(() => validarFecha('2026-00-10', 'desde'), invalida) // mes 0
  assert.throws(() => validarFecha('2026-01-32', 'hasta'), invalida) // dia 32
  assert.throws(() => validarFecha('2026-01-00', 'hasta'), invalida) // dia 0
  assert.throws(() => validarFecha('2026-02-31', 'hasta'), invalida) // 31 de febrero
  assert.throws(() => validarFecha('2026-04-31', 'hasta'), invalida) // 31 de un mes de 30 dias
  // Tambien a traves de validarRango, que es lo que llama cada reporte.
  assert.throws(() => validarRango({ desde: '2026-13-01', hasta: '2026-12-31' }), invalida)
  assert.throws(() => validarRango({ desde: '2026-01-01', hasta: '2026-02-31' }), invalida)
})

test('validarFecha: una fecha valida sigue funcionando (y se recorta el texto)', () => {
  assert.equal(validarFecha('2026-11-17', 'desde'), '2026-11-17')
  assert.equal(validarFecha('  2026-01-31  ', 'desde'), '2026-01-31')
  assert.equal(validarFecha('2026-12-31', 'hasta'), '2026-12-31')
})

test('validarFecha: 29 de febrero solo en anio bisiesto', () => {
  assert.equal(validarFecha('2028-02-29', 'desde'), '2028-02-29') // bisiesto
  assert.equal(validarFecha('2000-02-29', 'desde'), '2000-02-29') // divisible por 400
  assert.throws(() => validarFecha('2026-02-29', 'desde'), { status: 400, codigo: 'FECHA_INVALIDA' })
  assert.throws(() => validarFecha('2100-02-29', 'desde'), { status: 400, codigo: 'FECHA_INVALIDA' }) // divisible por 100 y no por 400
})

test('validarFecha: los errores previos no cambian (requerida y formato)', () => {
  assert.throws(() => validarFecha(undefined, 'desde'), { status: 400, codigo: 'FECHA_REQUERIDA' })
  assert.throws(() => validarFecha('   ', 'desde'), { status: 400, codigo: 'FECHA_REQUERIDA' })
  assert.throws(() => validarFecha('17/11/2026', 'desde'), { status: 400, codigo: 'FECHA_INVALIDA' })
  assert.throws(() => validarFecha(20261117, 'desde'), { status: 400, codigo: 'FECHA_INVALIDA' })
})

test('validacion del orden: monto por defecto y solo monto o antiguedad', () => {
  assert.equal(validarOrden(undefined), 'monto')
  assert.equal(validarOrden('Antiguedad'), 'antiguedad')
  assert.throws(() => validarOrden('nombre'), { status: 400, codigo: 'ORDEN_INVALIDO' })
})

test('filtro por rango: incluye los bordes y deja fuera lo anterior y lo posterior', () => {
  const lista = [
    exp('101', '2025-12', '2025-12-31'),
    exp('102', '2026-01', '2026-01-01'),
    exp('103', '2026-10', '2026-10-31'),
    exp('104', '2026-11', '2026-11-01')
  ]
  const r = expensasMorosas(lista, { ...rango, hoy: HOY })
  assert.deepEqual(r.map((x) => x.inmueble), ['102', '103'])
})

test('filtro por vencidas: una expensa que vence hoy o despues no es mora', () => {
  const lista = [exp('101', '2026-11', '2026-11-14'), exp('102', '2026-11', '2026-11-20'), exp('103', '2026-11', '2026-11-13')]
  const r = expensasMorosas(lista, { desde: '2026-11-01', hasta: '2026-11-30', hoy: HOY })
  assert.deepEqual(r.map((x) => x.inmueble), ['103'])
})

test('sin deuda: una expensa saldada o con pagos que la cubren queda fuera', () => {
  const lista = [
    exp('101', '2026-05', '2026-05-10', { pagos: [{ montoExpensa: '300', montoMora: '0' }] }),
    exp('102', '2026-05', '2026-05-10', { pagos: [{ montoExpensa: '100', montoMora: '0' }] })
  ]
  const r = expensasMorosas(lista, { ...rango, hoy: HOY })
  assert.deepEqual(r.map((x) => x.inmueble), ['102'])
  assert.equal(r[0].pendiente.expensa.toFixed(2), '200.00')
})

test('exclusion de planes de pago', () => {
  const lista = [exp('101', '2026-05', '2026-05-10', { planPagoId: 'plan-1' }), exp('102', '2026-05', '2026-05-10')]
  assert.deepEqual(expensasMorosas(lista, { ...rango, hoy: HOY }).map((x) => x.inmueble), ['102'])
})

test('una expensa repetida en la entrada no se cuenta dos veces', () => {
  const e = exp('101', '2026-05', '2026-05-10')
  assert.equal(expensasMorosas([e, e], { ...rango, hoy: HOY }).length, 1)
})

test('agrupacion por inmueble: una fila con periodo, dias de la mas antigua, montos y detalle', () => {
  const lista = [
    exp('101', '2026-07', '2026-07-10', { montoMora: '20' }),
    exp('101', '2026-05', '2026-05-10', { pagos: [{ montoExpensa: '50', montoMora: '0' }], montoMora: '10' }),
    exp('102', '2026-09', '2026-09-10')
  ]
  const filas = agruparPorInmueble(expensasMorosas(lista, { ...rango, hoy: HOY }))
  assert.equal(filas.length, 2)
  const f = filas.find((x) => x.inmueble === '101')
  assert.deepEqual(f.periodoDeuda, { desde: '2026-05', hasta: '2026-07' })
  assert.equal(f.diasMora, diasDeAtraso('2026-05-10', HOY))
  assert.equal(f.cantidadExpensas, 2)
  assert.equal(f.montoPendiente, '550.00') // 250 + 300
  assert.equal(f.interesMora, '30.00')
  assert.equal(f.totalAcumulado, '580.00')
  assert.deepEqual(f.expensas.map((x) => x.periodo), ['2026-05', '2026-07'])
  assert.equal(f.responsable, 'Resp 101')
})

test('orden por monto y por antiguedad, con desempates estables', () => {
  const lista = [
    exp('101', '2026-03', '2026-03-10'), // 300, el mas antiguo
    exp('102', '2026-08', '2026-08-10', { montoTotal: '900' }), // el mayor monto
    exp('103', '2026-08', '2026-08-10', { montoTotal: '900' }) // empata con 102
  ]
  assert.deepEqual(construir(lista, { orden: 'monto' }).filas.map((f) => f.inmueble), ['102', '103', '101'])
  assert.deepEqual(construir(lista, { orden: 'antiguedad' }).filas.map((f) => f.inmueble), ['101', '102', '103'])
  assert.deepEqual(construir(lista).filas.map((f) => f.inmueble), ['102', '103', '101']) // monto por defecto
  assert.deepEqual(ordenarFilas([]), [])
})

test('totales: suman las filas y coinciden con el detalle', () => {
  const lista = [
    exp('101', '2026-05', '2026-05-10', { montoMora: '15.50' }),
    exp('101', '2026-06', '2026-06-10'),
    exp('102', '2026-06', '2026-06-10', { pagos: [{ montoExpensa: '100.25', montoMora: '0' }] })
  ]
  const r = construir(lista)
  assert.deepEqual(r.totales, { inmuebles: 2, expensas: 3, montoPendiente: '799.75', interesMora: '15.50', totalAcumulado: '815.25' })
  const detalle = r.filas.flatMap((f) => f.expensas).reduce((s, e) => s + Number(e.total), 0)
  assert.equal(detalle.toFixed(2), r.totales.totalAcumulado)
})

test('listado: encabezado completo y vacio con mensaje', () => {
  const generadoEn = new Date('2026-11-14T15:30:00Z')
  const usuario = { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' }
  const r = construirListadoMorosos({ expensas: [], ...rango, generadoEn, hoy: HOY, generadoPor: usuario })
  assert.equal(r.titulo, 'Listado de morosos')
  assert.equal(r.tipoReporte, 'MOROSOS')
  assert.deepEqual(r.rango, rango)
  assert.equal(r.generadoEn, generadoEn.toISOString())
  assert.deepEqual(r.generadoPor, usuario)
  assert.equal(r.vacio, true)
  assert.equal(r.mensaje, MENSAJE_VACIO)
  assert.deepEqual(r.filas, [])
  assert.equal(r.totales.totalAcumulado, '0.00')
})

test('listado: un rango invalido falla antes de calcular', () => {
  assert.throws(() => construirListadoMorosos({ expensas: [], desde: '2026-05-01', hasta: '2026-04-01' }), { status: 400 })
})

test('PDF: se genera con los mismos datos, tambien vacio y con varias paginas', async () => {
  const generadoPor = { id: 'u1', nombre: 'Ana Perez', rol: 'ADMINISTRADOR' }
  const vacio = construir([], { generadoPor })
  const pdfVacio = await generarMorososPdf(vacio)
  assert.equal(pdfVacio.subarray(0, 5).toString(), '%PDF-')

  const muchas = Array.from({ length: 80 }, (_, i) => exp(String(100 + i), '2026-05', '2026-05-10'))
  const grande = construir(muchas, { generadoPor })
  const pdf = await generarMorososPdf(grande)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.length > pdfVacio.length)
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length > 1, 'debe ocupar mas de una pagina')
  assert.equal(nombreArchivoMorosos(grande), 'listado-morosos-2026-01-01-a-2026-10-31.pdf')
})
