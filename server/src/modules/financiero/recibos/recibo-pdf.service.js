const PDFDocument = require('pdfkit')

const ETIQUETA_METODO = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CHEQUE: 'Cheque',
  SALDO_A_FAVOR: 'Saldo a favor'
}

const ETIQUETA_ESTADO_PAGO = {
  PAGADO: 'Pagado',
  PAGO_PARCIAL: 'Pago parcial',
  SALDO_A_FAVOR: 'Saldo a favor'
}

const ETIQUETA_ESTADO_EXPENSA = {
  PAGADA: 'Pagada',
  PARCIAL: 'Pago parcial',
  VENCIDA: 'Vencida (con deuda)',
  PENDIENTE: 'Pendiente'
}

const ZONA_HORARIA = process.env.CRON_TIMEZONE || 'America/La_Paz'
const MARGEN = 50
const COLOR_TEXTO = '#1f2937'
const COLOR_SUAVE = '#6b7280'
const COLOR_LINEA = '#d1d5db'

/** "3 de octubre de 2026, 14:03" en hora de Bolivia. */
function formatearFecha(fecha) {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(fecha))
}

function formatearMonto(decimal) {
  const [entero, decimales] = decimal.toFixed(2).split('.')
  return `Bs ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`
}

function filaDato(doc, etiqueta, valor) {
  const y = doc.y
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_SUAVE).text(etiqueta, MARGEN, y, { width: 140 })
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text(valor, MARGEN + 140, y, {
    width: doc.page.width - MARGEN * 2 - 140
  })
  doc.moveDown(0.4)
}

function linea(doc) {
  doc.moveTo(MARGEN, doc.y).lineTo(doc.page.width - MARGEN, doc.y).strokeColor(COLOR_LINEA).lineWidth(0.5).stroke()
  doc.moveDown(0.6)
}

/**
 * Genera el recibo en PDF de un cobro. Devuelve un Buffer.
 * `datos` es lo que arma `recibos.service.datosParaPdf`.
 */
function generarReciboPdf(datos) {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'A5',
      margin: MARGEN,
      info: { Title: `Recibo ${datos.folio}`, Author: 'Administracion Edificio XYZ' }
    })
    const partes = []
    doc.on('data', (parte) => partes.push(parte))
    doc.on('end', () => resolver(Buffer.concat(partes)))
    doc.on('error', rechazar)

    const ancho = doc.page.width - MARGEN * 2

    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_TEXTO).text('Edificio XYZ', MARGEN, MARGEN)
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE).text('Recibo de pago')
    doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_TEXTO).text(datos.folio, MARGEN, MARGEN, {
      width: ancho,
      align: 'right'
    })
    doc.y = MARGEN + 42
    linea(doc)

    filaDato(doc, 'Inmueble', `${datos.inmueble.codigo} (${datos.inmueble.tipo})`)
    if (datos.recibidoDe.length) {
      filaDato(doc, 'Recibido de', datos.recibidoDe.join(', '))
    }
    filaDato(doc, 'Fecha del pago', formatearFecha(datos.fechaPago))
    filaDato(doc, 'Metodo de pago', ETIQUETA_METODO[datos.metodoPago] ?? datos.metodoPago)
    if (datos.referencia) {
      filaDato(doc, 'Referencia', datos.referencia)
    }
    filaDato(doc, 'Estado del pago', ETIQUETA_ESTADO_PAGO[datos.estadoPago] ?? datos.estadoPago)
    filaDato(doc, 'Monto pagado', formatearMonto(datos.montoTotal))

    if (datos.expensas.length) {
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text('Detalle', MARGEN, doc.y)
      doc.moveDown(0.3)
      for (const e of datos.expensas) {
        const y = doc.y
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO)
        doc.text(`Expensa ${e.periodo}`, MARGEN, y, { width: 90 })
        doc.fillColor(COLOR_SUAVE).text(ETIQUETA_ESTADO_EXPENSA[e.estado] ?? e.estado, MARGEN + 90, y, { width: 120 })
        doc.fillColor(COLOR_TEXTO).text(formatearMonto(e.monto), MARGEN, y, { width: ancho, align: 'right' })
        doc.moveDown(0.3)
      }
    }

    if (datos.saldoFavorGenerado.gt(0)) {
      const y = doc.y
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO).text('Saldo a favor generado', MARGEN, y, { width: 210 })
      doc.text(formatearMonto(datos.saldoFavorGenerado), MARGEN, y, { width: ancho, align: 'right' })
      doc.moveDown(0.3)
    }

    doc.moveDown(0.6)
    linea(doc)
    if (datos.registradoPor) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE).text(`Registrado por ${datos.registradoPor}`, MARGEN, doc.y)
    }
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE).text(`Folio ${datos.folio} - documento generado por el sistema`, MARGEN, doc.y)

    doc.end()
  })
}

module.exports = { generarReciboPdf }
