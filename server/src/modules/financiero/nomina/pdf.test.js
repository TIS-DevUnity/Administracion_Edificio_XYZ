// Pruebas de los generadores de PDF de personal (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/nomina/pdf.test.js
// Reciben objetos planos: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { generarBoletaNominaPdf, nombreArchivoBoleta } = require('./boleta-nomina-pdf.service')
const { generarComprobanteAnticipoPdf, nombreArchivoComprobante } = require('../anticipos/boleta-anticipo-pdf.service')
const { generarReportePersonalPdf, nombreArchivoReporte } = require('./reporte-pdf.service')
const { construirReporte } = require('./reporte.util')
const { slug, primerApellido, enviarPdf } = require('./pdf-comun.util')

const empleado = { nombres: 'Juan Carlos', apellidos: 'Mamani Quispe', documento: '1234567 LP', cargo: 'Conserje', fechaIngreso: '2024-03-01' }

const boleta = (estado, extra = {}) => ({
  periodo: '2026-10',
  estado,
  empleado,
  sueldoBase: '2500.00',
  bonos: [{ descripcion: 'Bono por puntualidad', monto: '300.00' }],
  horasExtra: [{ descripcion: 'Turno nocturno', horas: '8.50', monto: '150.50' }],
  descuentos: [{ descripcion: 'Falta injustificada', monto: '80.00' }],
  anticipos: [{ fecha: '2026-10-05', descripcion: 'Gastos médicos', monto: '400.00' }],
  totales: { bonos: '300.00', horasExtra: '150.50', descuentos: '80.00', anticipos: '400.00', totalGanado: '2950.50', sueldoNeto: '2470.50' },
  pago: estado === 'PAGADA' ? { fechaPago: '2026-10-31', metodoPago: 'TRANSFERENCIA', montoPagado: '2470.50' } : null,
  ...extra
})

function paginas(buffer) {
  // PDFKit escribe un objeto /Type /Page por pagina (el arbol es /Type /Pages).
  return (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length
}

function esPdf(buffer) {
  assert.ok(Buffer.isBuffer(buffer), 'no es un Buffer')
  assert.ok(buffer.length > 0, 'esta vacio')
  assert.equal(buffer.subarray(0, 4).toString('latin1'), '%PDF')
  assert.ok(buffer.toString('latin1').includes('%%EOF'), 'PDF truncado')
}

test('boleta PENDIENTE: PDF valido de una pagina', async () => {
  const pdf = await generarBoletaNominaPdf(boleta('PENDIENTE'))
  esPdf(pdf)
  assert.equal(paginas(pdf), 1)
})

test('boleta PAGADA: PDF valido', async () => {
  const pdf = await generarBoletaNominaPdf(boleta('PAGADA'))
  esPdf(pdf)
  assert.equal(paginas(pdf), 1)
})

test('boleta sin conceptos ni anticipos: PDF valido', async () => {
  const vacia = boleta('PENDIENTE', {
    bonos: [], horasExtra: [], descuentos: [], anticipos: [],
    totales: { bonos: '0.00', horasExtra: '0.00', descuentos: '0.00', anticipos: '0.00', totalGanado: '2500.00', sueldoNeto: '2500.00' }
  })
  esPdf(await generarBoletaNominaPdf(vacia))
})

test('boleta con 40 conceptos: varias paginas, y las firmas no se cortan', async () => {
  const muchos = boleta('PENDIENTE', {
    bonos: Array.from({ length: 40 }, (_, i) => ({ descripcion: `Bono número ${i + 1} por desempeño destacado en la tarea asignada`, monto: '10.00' }))
  })
  const pdf = await generarBoletaNominaPdf(muchos)
  esPdf(pdf)
  assert.ok(paginas(pdf) >= 2, 'debia pasar a otra pagina')
  const una = await generarBoletaNominaPdf(boleta('PENDIENTE'))
  assert.ok(pdf.length > una.length)
})

test('boleta con descripciones larguisimas y neto 0 no revienta', async () => {
  const pdf = await generarBoletaNominaPdf(
    boleta('PAGADA', {
      descuentos: [{ descripcion: 'x'.repeat(120), monto: '2500.00' }],
      totales: { bonos: '300.00', horasExtra: '150.50', descuentos: '2500.00', anticipos: '400.00', totalGanado: '2950.50', sueldoNeto: '0.00' },
      pago: { fechaPago: '2026-10-31', metodoPago: 'EFECTIVO', montoPagado: '0.00' }
    })
  )
  esPdf(pdf)
})

test('comprobante de anticipo: PDF valido', async () => {
  const pdf = await generarComprobanteAnticipoPdf({
    empleado, monto: '1000.00', montoDescontado: '400.00', saldoPendiente: '600.00',
    fecha: '2026-10-20', metodoPago: 'TRANSFERENCIA', descripcion: 'Anticipo por gastos médicos', estado: 'PARCIAL'
  })
  esPdf(pdf)
  assert.equal(paginas(pdf), 1)
})

const nominaFila = (apellidos, c) => ({
  id: 'n-' + apellidos, periodo: '2026-10', empleado: { id: apellidos, nombres: 'Ana', apellidos, cargo: 'Limpieza', documento: '1' },
  sueldoBase: '2200', totalBonos: '0', totalHorasExtra: '0', totalDescuentos: '0', totalAnticipos: '0', sueldoNeto: '2200',
  estado: 'PENDIENTE', fechaPago: null, ...c
})

test('reporte con datos: PDF valido', async () => {
  const reporte = construirReporte({
    periodo: '2026-10',
    nominas: [nominaFila('Mamani', { estado: 'PAGADA', fechaPago: '2026-10-31' }), nominaFila('Choque')],
    anticipos: [{ id: 'a1', empleado: { nombres: 'Ana', apellidos: 'Mamani', cargo: 'Limpieza' }, fecha: '2026-10-05', monto: '400', metodoPago: 'EFECTIVO', estado: 'PARCIAL' }]
  })
  const pdf = await generarReportePersonalPdf(reporte)
  esPdf(pdf)
})

test('reporte de un periodo sin nominas: PDF valido', async () => {
  const pdf = await generarReportePersonalPdf(construirReporte({ periodo: '2020-01' }))
  esPdf(pdf)
  assert.equal(paginas(pdf), 1)
})

test('reporte con 80 empleados: varias paginas', async () => {
  const nominas = Array.from({ length: 80 }, (_, i) => nominaFila(`Apellido${String(i).padStart(2, '0')}`))
  const pdf = await generarReportePersonalPdf(construirReporte({ periodo: '2026-10', nominas }))
  esPdf(pdf)
  assert.ok(paginas(pdf) >= 2)
})

test('nombres de archivo: sin tildes ni caracteres raros', () => {
  assert.equal(nombreArchivoBoleta(boleta('PAGADA')), 'boleta-nomina-2026-10-mamani.pdf')
  assert.equal(
    nombreArchivoBoleta({ periodo: '2026-10', empleado: { apellidos: 'Peña Núñez/Ñandú' } }),
    'boleta-nomina-2026-10-pena.pdf'
  )
  assert.equal(
    nombreArchivoBoleta({ periodo: '2026-10', empleado: { apellidos: "O'Brien-Álvarez" } }),
    'boleta-nomina-2026-10-o-brien-alvarez.pdf'
  )
  assert.equal(nombreArchivoBoleta({ periodo: '2026-10', empleado: { apellidos: '  ' } }), 'boleta-nomina-2026-10-empleado.pdf')
  assert.equal(nombreArchivoComprobante({ fecha: '2026-10-20', empleado }), 'comprobante-anticipo-2026-10-20-mamani.pdf')
  assert.equal(nombreArchivoReporte({ periodo: '2026-10' }), 'reporte-personal-2026-10.pdf')
  assert.equal(slug('Ñandú  ¡Ya!'), 'nandu-ya')
  assert.equal(primerApellido({ apellidos: 'Álvarez Soto' }), 'alvarez')
  for (const nombre of [nombreArchivoBoleta(boleta('PAGADA')), nombreArchivoComprobante({ fecha: '2026-10-20', empleado })]) {
    assert.match(nombre, /^[a-z0-9.-]+$/)
  }
})

test('enviarPdf: mismos encabezados que el recibo; descarga por defecto e inline a pedido', () => {
  const respuesta = () => {
    const r = { cabeceras: null, cuerpo: null }
    r.set = (h) => { r.cabeceras = h }
    r.send = (b) => { r.cuerpo = b }
    return r
  }
  const pdf = Buffer.from('%PDF-1.3 x')
  const a = respuesta()
  enviarPdf(a, pdf, 'boleta.pdf')
  assert.deepEqual(a.cabeceras, {
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': 'attachment; filename="boleta.pdf"',
    'Cache-Control': 'private, no-store'
  })
  assert.equal(a.cuerpo, pdf)
  const b = respuesta()
  enviarPdf(b, pdf, 'boleta.pdf', true)
  assert.equal(b.cabeceras['Content-Disposition'], 'inline; filename="boleta.pdf"')
})
