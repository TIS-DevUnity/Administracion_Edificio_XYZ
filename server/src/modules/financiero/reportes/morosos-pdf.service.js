/**
 * Listado de morosos en PDF (HU13). Recibe lo que devuelve `morosos.util.construirListadoMorosos` (objeto plano,
 * sin Prisma): el mismo que la vista previa JSON. Hoja A4 horizontal; la tabla repite su cabecera en cada pagina.
 */
const { MARGEN, COLOR_SUAVE, formatearFecha } = require('../recibos/recibo-pdf.service')
const comun = require('../nomina/pdf-comun.util')

/** listado-morosos-2026-01-01-a-2026-10-31.pdf */
function nombreArchivoMorosos(listado) {
  return `listado-morosos-${listado.rango.desde}-a-${listado.rango.hasta}.pdf`
}

function generarMorososPdf(listado) {
  const { desde, hasta } = listado.rango
  const textoRango = `${comun.formatearDia(desde)} al ${comun.formatearDia(hasta)}`
  const m = (v) => comun.monto(v).replace('Bs ', '')

  return comun.generarPdf(
    {
      titulo: `${listado.titulo} ${desde} a ${hasta}`,
      pie: `${listado.titulo} ${desde} a ${hasta} - Documento generado por el sistema`,
      horizontal: true
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `${listado.titulo} - ${desde} a ${hasta}`)

      let y = comun.cabecera(doc, listado.titulo, `Vencimientos del ${textoRango}`)
      y = comun.filaDato(doc, y, 'Emitido', formatearFecha(listado.generadoEn), { alNuevaPagina: continuacion, anchoEtiqueta: 120 })
      y = comun.filaDato(doc, y, 'Generado por', listado.generadoPor?.nombre ?? '-', { alNuevaPagina: continuacion, anchoEtiqueta: 120 })
      y = comun.filaDato(doc, y, 'Orden', listado.orden === 'antiguedad' ? 'Antigüedad de la deuda' : 'Monto adeudado', {
        alNuevaPagina: continuacion,
        anchoEtiqueta: 120
      })
      y += 6

      if (listado.vacio) {
        comun.textoSuave(doc, y, listado.mensaje, { alNuevaPagina: continuacion })
        return
      }

      const t = listado.totales
      const columnas = [
        { titulo: 'Inmueble', ancho: 70 },
        { titulo: 'Responsable de pago', ancho: 190 },
        { titulo: 'Periodo de la deuda', ancho: 110 },
        { titulo: 'Días de mora', ancho: 60, alinear: 'right' },
        { titulo: 'Monto pendiente', ancho: 100, alinear: 'right' },
        { titulo: 'Mora aplicada', ancho: 90, alinear: 'right' },
        { titulo: 'Total acumulado', ancho: 0, alinear: 'right' }
      ]
      columnas[columnas.length - 1].ancho = ancho - columnas.slice(0, -1).reduce((s, c) => s + c.ancho, 0)

      y = comun.dibujarTabla(doc, y, {
        columnas,
        filas: listado.filas.map((f) => [
          f.inmueble,
          f.responsable ?? '-',
          f.periodoDeuda.desde === f.periodoDeuda.hasta ? f.periodoDeuda.desde : `${f.periodoDeuda.desde} a ${f.periodoDeuda.hasta}`,
          String(f.diasMora),
          m(f.montoPendiente),
          m(f.interesMora),
          m(f.totalAcumulado)
        ]),
        total: [`Total (${t.inmuebles} inmuebles)`, '', '', '', m(t.montoPendiente), m(t.interesMora), m(t.totalAcumulado)],
        alNuevaPagina: continuacion,
        tamanio: 8.5
      })
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE).text(
        'Importes en bolivianos (Bs). Días de mora: de la expensa más antigua al día de emisión. Mora: solo la ya aplicada.',
        MARGEN,
        y - 2,
        { width: ancho }
      )
    }
  )
}

module.exports = { generarMorososPdf, nombreArchivoMorosos }
