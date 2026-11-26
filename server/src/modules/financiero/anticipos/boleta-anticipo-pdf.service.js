/**
 * Comprobante de anticipo de sueldo en PDF (HU8). `generarComprobanteAnticipoPdf` recibe un objeto plano y
 * devuelve un Buffer; no usa Prisma, asi se prueba sin base de datos.
 *
 * datos = {
 *   empleado: { nombres, apellidos, documento, cargo },
 *   monto, montoDescontado, saldoPendiente, fecha: 'YYYY-MM-DD', metodoPago, descripcion,
 *   estado: 'PENDIENTE' | 'PARCIAL' | 'DESCONTADO'
 * }
 */
const { MARGEN, COLOR_TEXTO } = require('../recibos/recibo-pdf.service')
const comun = require('../nomina/pdf-comun.util')

const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente de descuento',
  PARCIAL: 'Descontado en parte',
  DESCONTADO: 'Descontado por completo'
}

/** comprobante-anticipo-2026-10-15-mamani.pdf */
function nombreArchivoComprobante(datos) {
  return `comprobante-anticipo-${datos.fecha}-${comun.primerApellido(datos.empleado)}.pdf`
}

function generarComprobanteAnticipoPdf(datos) {
  const e = datos.empleado
  const nombreCompleto = `${e.apellidos} ${e.nombres}`

  return comun.generarPdf(
    {
      titulo: `Comprobante de anticipo ${datos.fecha} - ${nombreCompleto}`,
      pie: `Anticipo ${datos.fecha} - ${nombreCompleto} - Documento generado por el sistema`
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `Comprobante de anticipo - ${nombreCompleto}`)

      let y = comun.cabecera(doc, 'Comprobante de anticipo de sueldo', `Fecha del anticipo: ${comun.formatearDia(datos.fecha)}`)

      y = comun.tituloSeccion(doc, y, 'Empleado')
      for (const [etiqueta, valor] of [
        ['Empleado', nombreCompleto],
        ['Documento', e.documento],
        ['Cargo', e.cargo]
      ]) {
        y = comun.filaDato(doc, y, etiqueta, valor, { alNuevaPagina: continuacion })
      }
      y += 6

      y = comun.tituloSeccion(doc, y, 'Anticipo')
      for (const [etiqueta, valor] of [
        ['Fecha', comun.formatearDia(datos.fecha)],
        ['Método de pago', comun.ETIQUETA_METODO[datos.metodoPago] ?? datos.metodoPago],
        ['Concepto', datos.descripcion]
      ]) {
        y = comun.filaDato(doc, y, etiqueta, valor, { alNuevaPagina: continuacion })
      }

      y = comun.asegurarEspacio(doc, y + 6, 40, continuacion)
      doc.rect(MARGEN, y, ancho, 30).fill(comun.COLOR_FONDO)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXTO).text('MONTO DEL ANTICIPO', MARGEN + 10, y + 10, { width: ancho / 2 })
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_TEXTO).text(comun.monto(datos.monto), MARGEN, y + 8, { width: ancho - 10, align: 'right' })
      y += 46

      y = comun.tituloSeccion(doc, y, 'Descuento en nómina')
      for (const [etiqueta, valor] of [
        ['Estado', ETIQUETA_ESTADO[datos.estado] ?? datos.estado],
        ['Monto ya descontado', comun.monto(datos.montoDescontado)],
        ['Saldo pendiente de descuento', comun.monto(datos.saldoPendiente)]
      ]) {
        y = comun.filaDato(doc, y, etiqueta, valor, { alNuevaPagina: continuacion, anchoEtiqueta: 170 })
      }
      doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280').text(
        'El anticipo se descuenta automáticamente en la próxima nómina del empleado.',
        MARGEN,
        y + 2,
        { width: ancho }
      )
      y = doc.y + 4

      comun.bloqueFirmas(
        doc,
        y,
        [
          { titulo: 'Firma del empleado', lineas: [nombreCompleto, `Documento: ${e.documento}`] },
          { titulo: 'Firma del administrador', lineas: ['Administración del edificio'] }
        ],
        { alNuevaPagina: continuacion }
      )
    }
  )
}

module.exports = { generarComprobanteAnticipoPdf, nombreArchivoComprobante }
