/**
 * Piezas comunes de los PDF de personal (HU8): boleta de sueldo, comprobante de anticipo y reporte mensual.
 * Reutiliza los helpers y colores del recibo (recibo-pdf.service.js). Todo recibe objetos planos: nada de
 * Prisma, asi los generadores se prueban sin base de datos.
 */
const PDFDocument = require('pdfkit')
const { Decimal } = require('../expensas/saldo.util')
const { formatearMonto, MARGEN, COLOR_TEXTO, COLOR_SUAVE, COLOR_LINEA } = require('../recibos/recibo-pdf.service')

const COLOR_FONDO = '#f3f4f6'
const COLOR_PAGADA = '#047857'
const COLOR_PENDIENTE = '#b45309'
const NOMBRE_EDIFICIO = 'Edificio XYZ'
const AUTOR = 'Administracion Edificio XYZ'
const MARGEN_INFERIOR = MARGEN + 14 // deja sitio al pie de pagina

const ETIQUETA_METODO = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', CHEQUE: 'Cheque' }

const monto = (valor) => formatearMonto(new Decimal(valor ?? 0))

/** "octubre de 2026" -> "Octubre de 2026" para un periodo YYYY-MM. */
function etiquetaPeriodo(periodo) {
  const [anio, mes] = String(periodo).split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(anio, mes - 1, 1))
  )
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "15 de octubre de 2026" para un dia YYYY-MM-DD (sin desfase de zona horaria). */
function formatearDia(dia) {
  if (!dia) return ''
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${dia}T00:00:00Z`)
  )
}

/** Texto apto para nombre de archivo: minusculas, sin tildes ni caracteres raros. */
function slug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Primer apellido del empleado, listo para un nombre de archivo. */
const primerApellido = (empleado) => slug(String(empleado?.apellidos ?? '').split(/\s+/)[0]) || 'empleado'

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

const limiteY = (doc) => doc.page.height - doc.page.margins.bottom
const anchoUtil = (doc) => doc.page.width - MARGEN * 2

/**
 * Crea el documento A4 (vertical u horizontal), ejecuta `dibujar(doc)` y devuelve un Buffer. Cada pagina lleva
 * al pie `pie` y "Pagina x de y".
 */
function generarPdf({ titulo, pie, horizontal = false }, dibujar) {
  return new Promise((resolver, rechazar) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: horizontal ? 'landscape' : 'portrait',
        margins: { top: MARGEN, bottom: MARGEN_INFERIOR, left: MARGEN, right: MARGEN },
        bufferPages: true,
        info: { Title: titulo, Author: AUTOR }
      })
      const partes = []
      doc.on('data', (parte) => partes.push(parte))
      doc.on('end', () => resolver(Buffer.concat(partes)))
      doc.on('error', rechazar)

      dibujar(doc)
      pintarPie(doc, pie)
      doc.end()
    } catch (err) {
      rechazar(err)
    }
  })
}

function pintarPie(doc, pie) {
  const ancho = anchoUtil(doc)
  const rango = doc.bufferedPageRange()
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i)
    const margenInferior = doc.page.margins.bottom
    doc.page.margins.bottom = 0 // para poder escribir dentro del margen inferior
    doc.font('Helvetica').fontSize(7).fillColor(COLOR_SUAVE)
    doc.text(pie, MARGEN, doc.page.height - 36, { width: ancho - 80, align: 'left', lineBreak: false })
    doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, MARGEN + ancho - 80, doc.page.height - 36, {
      width: 80,
      align: 'right',
      lineBreak: false
    })
    doc.page.margins.bottom = margenInferior
  }
}

function lineaEn(doc, y) {
  doc.moveTo(MARGEN, y).lineTo(MARGEN + anchoUtil(doc), y).strokeColor(COLOR_LINEA).lineWidth(0.5).stroke()
}

/** Si no caben `alto` puntos desde `y`, abre una pagina nueva (con `alNuevaPagina` como cabecera) y devuelve la y inicial. */
function asegurarEspacio(doc, y, alto, alNuevaPagina) {
  if (y + alto <= limiteY(doc)) return y
  doc.addPage()
  return alNuevaPagina ? alNuevaPagina(doc) : MARGEN
}

/** Cabecera del documento: edificio, titulo y subtitulo. Devuelve la y donde sigue el contenido. */
function cabecera(doc, titulo, subtitulo) {
  const ancho = anchoUtil(doc)
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_TEXTO).text(NOMBRE_EDIFICIO, MARGEN, MARGEN, { width: ancho })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXTO).text(titulo, MARGEN, doc.y + 1, { width: ancho })
  if (subtitulo) doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE).text(subtitulo, MARGEN, doc.y + 1, { width: ancho })
  const y = doc.y + 6
  lineaEn(doc, y)
  return y + 10
}

/** Cabecera corta de las paginas siguientes. */
function cabeceraContinuacion(doc, texto) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text(`${NOMBRE_EDIFICIO} - ${texto}`, MARGEN, MARGEN, { width: anchoUtil(doc) })
  const y = doc.y + 4
  lineaEn(doc, y)
  return y + 10
}

/** Sello en la esquina superior derecha: "PAGADA" o "PENDIENTE DE PAGO". */
function sello(doc, texto, color) {
  const ancho = 150
  const x = MARGEN + anchoUtil(doc) - ancho
  doc.roundedRect(x, MARGEN, ancho, 22, 3).lineWidth(1.2).strokeColor(color).stroke()
  doc.font('Helvetica-Bold').fontSize(10).fillColor(color).text(texto, x, MARGEN + 6, { width: ancho, align: 'center', lineBreak: false })
}

function tituloSeccion(doc, y, texto) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text(texto, MARGEN, y, { width: anchoUtil(doc) })
  return y + 14
}

/** Par etiqueta / valor. El valor puede ocupar varias lineas. Devuelve la nueva y. */
function filaDato(doc, y, etiqueta, valor, { alNuevaPagina, anchoEtiqueta = 140 } = {}) {
  const ancho = anchoUtil(doc) - anchoEtiqueta
  doc.font('Helvetica-Bold').fontSize(9.5)
  const alto = Math.max(doc.heightOfString(String(valor), { width: ancho }), 12)
  y = asegurarEspacio(doc, y, alto + 4, alNuevaPagina)
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_SUAVE).text(etiqueta, MARGEN, y, { width: anchoEtiqueta - 6 })
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXTO).text(String(valor), MARGEN + anchoEtiqueta, y, { width: ancho })
  return y + alto + 4
}

/** Una linea de texto suave ("Sin bonos en este periodo"). */
function textoSuave(doc, y, texto, { alNuevaPagina } = {}) {
  y = asegurarEspacio(doc, y, 16, alNuevaPagina)
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE).text(texto, MARGEN, y, { width: anchoUtil(doc) })
  return y + 14
}

/**
 * Tabla con cabecera que se repite en cada pagina y filas que nunca se cortan entre dos paginas.
 * `columnas`: [{ titulo, ancho, alinear }]; `filas`: arreglos de texto; `total`: fila opcional de totales
 * (en negrita). Devuelve la y donde termina.
 */
function dibujarTabla(doc, y, { columnas, filas, total, alNuevaPagina, tamanio = 8.5 }) {
  const xs = []
  columnas.reduce((x, c) => (xs.push(x), x + c.ancho), MARGEN)
  const ancho = columnas.reduce((suma, c) => suma + c.ancho, 0)

  const cabeceraTabla = (yy) => {
    doc.rect(MARGEN, yy - 2, ancho, 16).fill(COLOR_FONDO)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_TEXTO)
    columnas.forEach((c, i) => doc.text(c.titulo, xs[i] + 2, yy + 2, { width: c.ancho - 4, align: c.alinear ?? 'left', lineBreak: false }))
    return yy + 18
  }
  const alPaginaNueva = (d) => cabeceraTabla(alNuevaPagina ? alNuevaPagina(d) : MARGEN)

  const alturaDe = (celdas, fuente) => {
    doc.font(fuente).fontSize(tamanio)
    return Math.max(...celdas.map((t, i) => doc.heightOfString(String(t ?? ''), { width: columnas[i].ancho - 4 }))) + 6
  }
  const pintarFila = (celdas, fuente, yy, alto, fondo) => {
    if (fondo) doc.rect(MARGEN, yy - 1, ancho, alto).fill(fondo)
    doc.font(fuente).fontSize(tamanio).fillColor(COLOR_TEXTO)
    celdas.forEach((t, i) => doc.text(String(t ?? ''), xs[i] + 2, yy + 2, { width: columnas[i].ancho - 4, align: columnas[i].alinear ?? 'left' }))
    if (!fondo) {
      doc.moveTo(MARGEN, yy + alto - 1).lineTo(MARGEN + ancho, yy + alto - 1).strokeColor(COLOR_LINEA).lineWidth(0.3).stroke()
    }
  }

  // La cabecera va junto con al menos la primera fila.
  const primera = filas[0] ?? total
  y = asegurarEspacio(doc, y, 18 + (primera ? alturaDe(primera, 'Helvetica') : 0), alNuevaPagina)
  y = cabeceraTabla(y)
  for (const celdas of filas) {
    const alto = alturaDe(celdas, 'Helvetica')
    y = asegurarEspacio(doc, y, alto, alPaginaNueva)
    pintarFila(celdas, 'Helvetica', y, alto)
    y += alto
  }
  if (total) {
    const alto = alturaDe(total, 'Helvetica-Bold')
    y = asegurarEspacio(doc, y, alto, alPaginaNueva)
    pintarFila(total, 'Helvetica-Bold', y, alto, COLOR_FONDO)
    y += alto
  }
  return y + 4
}

/**
 * Bloque de dos firmas, siempre completo en una misma pagina (si no cabe, pasa a la siguiente).
 * `firmas`: [{ titulo, lineas: [texto, ...] }].
 */
function bloqueFirmas(doc, y, firmas, { alNuevaPagina } = {}) {
  const alto = 88
  y = asegurarEspacio(doc, y + 16, alto, alNuevaPagina)
  const ancho = anchoUtil(doc)
  const hueco = 40
  const anchoFirma = (ancho - hueco * (firmas.length - 1)) / firmas.length
  firmas.forEach((f, i) => {
    const x = MARGEN + i * (anchoFirma + hueco)
    doc.moveTo(x, y + 40).lineTo(x + anchoFirma, y + 40).strokeColor(COLOR_TEXTO).lineWidth(0.8).stroke()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_TEXTO).text(f.titulo, x, y + 46, { width: anchoFirma, align: 'center' })
    let yy = doc.y
    for (const linea of f.lineas ?? []) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_SUAVE).text(linea, x, yy + 1, { width: anchoFirma, align: 'center' })
      yy = doc.y
    }
  })
  return y + alto
}

/** Responde un PDF como lo hacen el recibo y el estado de cuenta. Descarga por defecto; `inline` lo abre en el navegador. */
function enviarPdf(res, pdf, nombreArchivo, inline = false) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nombreArchivo}"`,
    'Cache-Control': 'private, no-store'
  })
  res.send(pdf)
}

module.exports = {
  COLOR_FONDO,
  COLOR_PAGADA,
  COLOR_PENDIENTE,
  ETIQUETA_METODO,
  monto,
  etiquetaPeriodo,
  formatearDia,
  slug,
  primerApellido,
  limiteY,
  anchoUtil,
  generarPdf,
  lineaEn,
  asegurarEspacio,
  cabecera,
  cabeceraContinuacion,
  sello,
  tituloSeccion,
  filaDato,
  textoSuave,
  dibujarTabla,
  bloqueFirmas,
  enviarPdf
}
