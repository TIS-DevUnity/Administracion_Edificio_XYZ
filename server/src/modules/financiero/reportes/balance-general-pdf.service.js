/**
 * Balance general en PDF (HU13). Recibe lo que devuelve `balance-general.util.construirBalanceGeneral` (objeto
 * plano, sin Prisma): el mismo que la vista previa JSON. Hoja A4 vertical.
 */
const { MARGEN, COLOR_SUAVE, formatearFecha } = require('../recibos/recibo-pdf.service')
const comun = require('../nomina/pdf-comun.util')

/** balance-general-2026-11-14.pdf */
function nombreArchivoBalanceGeneral(balance) {
  return `balance-general-${balance.fechaCorte}.pdf`
}

function generarBalanceGeneralPdf(balance) {
  const m = (v) => comun.monto(v).replace('Bs ', '')

  return comun.generarPdf(
    {
      titulo: `${balance.titulo} ${balance.fechaCorte}`,
      pie: `${balance.titulo} al ${balance.fechaCorte} - Documento generado por el sistema`
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `${balance.titulo} - ${balance.fechaCorte}`)
      const opciones = { alNuevaPagina: continuacion, anchoEtiqueta: 150 }

      let y = comun.cabecera(doc, balance.titulo, `A la fecha de emisión: ${comun.formatearDia(balance.fechaCorte)}`)
      y = comun.filaDato(doc, y, 'Emitido', formatearFecha(balance.generadoEn), opciones)
      y = comun.filaDato(doc, y, 'Generado por', balance.generadoPor?.nombre ?? '-', opciones)
      y += 2

      // La nota de limitaciones va visible, antes de las cifras.
      y = comun.asegurarEspacio(doc, y, 40, continuacion)
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_SUAVE)
      const altoNota = doc.heightOfString(balance.nota, { width: ancho }) + 4
      doc.text(balance.nota, MARGEN, y, { width: ancho })
      y += altoNota + 8

      const seccion = (titulo, bloque, etiquetaTotal) => {
        y = comun.asegurarEspacio(doc, y, 60, continuacion)
        y = comun.tituloSeccion(doc, y, titulo)
        for (const g of bloque.grupos) {
          y = comun.dibujarTabla(doc, y, {
            columnas: [
              { titulo: g.nombre, ancho: ancho - 70 - 110 },
              { titulo: 'Cantidad', ancho: 70, alinear: 'right' },
              { titulo: 'Monto (Bs)', ancho: 110, alinear: 'right' }
            ],
            filas: g.lineas.map((l) => [l.concepto, l.cantidad === null ? '' : String(l.cantidad), m(l.monto)]),
            total: [`Subtotal ${g.nombre.toLowerCase()}`, '', m(g.subtotal)],
            alNuevaPagina: continuacion
          })
        }
        y = comun.filaDato(doc, y, etiquetaTotal, comun.monto(bloque.total), opciones)
        y += 8
      }

      seccion('Activos', balance.activos, 'Total activos')
      seccion('Pasivos', balance.pasivos, 'Total pasivos')
      seccion('Patrimonio', balance.patrimonio, 'Total patrimonio')

      const v = balance.verificacion
      y = comun.asegurarEspacio(doc, y, 40, continuacion)
      y = comun.tituloSeccion(doc, y, 'Verificación')
      y = comun.filaDato(doc, y, 'Activos', comun.monto(v.activos), opciones)
      y = comun.filaDato(doc, y, 'Pasivos + patrimonio', comun.monto(v.pasivosMasPatrimonio), opciones)
      comun.filaDato(doc, y, 'Resultado', `${v.formula}: ${v.coincide ? 'se cumple' : 'NO se cumple'}`, opciones)
    }
  )
}

module.exports = { generarBalanceGeneralPdf, nombreArchivoBalanceGeneral }
