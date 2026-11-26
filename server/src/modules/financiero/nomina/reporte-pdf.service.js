/**
 * Reporte mensual de gastos de personal en PDF (HU8). Recibe lo que devuelve `reporte.util.construirReporte`
 * (objeto plano, sin Prisma) y devuelve un Buffer. Hoja A4 horizontal por las columnas de la tabla.
 */
const { MARGEN, COLOR_TEXTO, COLOR_SUAVE, formatearFecha } = require('../recibos/recibo-pdf.service')
const comun = require('./pdf-comun.util')

/** reporte-personal-2026-10.pdf */
function nombreArchivoReporte(reporte) {
  return `reporte-personal-${reporte.periodo}.pdf`
}

function generarReportePersonalPdf(reporte, { generadoEn = new Date() } = {}) {
  const etiqueta = comun.etiquetaPeriodo(reporte.periodo)

  return comun.generarPdf(
    {
      titulo: `Reporte de gastos de personal ${reporte.periodo}`,
      pie: `Gastos de personal ${reporte.periodo} - Documento generado por el sistema`,
      horizontal: true
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `Gastos de personal - ${etiqueta}`)

      let y = comun.cabecera(doc, 'Reporte mensual de gastos de personal', `Periodo: ${etiqueta} - Emitido: ${formatearFecha(generadoEn)}`)

      // --- Resumen
      y = comun.tituloSeccion(doc, y, 'Resumen del periodo')
      const r = reporte.resumen
      const resumen = [
        ['Costo del periodo (devengado)', comun.monto(r.costoDelPeriodo)],
        ['Pagado (sueldos netos de nóminas pagadas)', comun.monto(r.pagado)],
        ['Pendiente de pago (sueldos netos de nóminas pendientes)', comun.monto(r.pendiente)],
        ['Nóminas', `${r.cantidad} (${r.cantidadPagadas} pagadas, ${r.cantidadPendientes} pendientes)`]
      ]
      for (const [e, v] of resumen) {
        y = comun.filaDato(doc, y, e, v, { alNuevaPagina: continuacion, anchoEtiqueta: 320 })
      }
      y += 6

      // --- Nominas por empleado
      y = comun.tituloSeccion(doc, y, 'Nóminas del periodo')
      if (reporte.vacio) {
        y = comun.textoSuave(doc, y, 'Sin nóminas en este periodo', { alNuevaPagina: continuacion })
      } else {
        const t = reporte.totales
        const m = (v) => comun.monto(v).replace('Bs ', '')
        const columnas = [
          { titulo: 'Empleado', ancho: 150 },
          { titulo: 'Cargo', ancho: 100 },
          { titulo: 'Sueldo base', ancho: 62, alinear: 'right' },
          { titulo: 'Bonos', ancho: 52, alinear: 'right' },
          { titulo: 'H. extra', ancho: 52, alinear: 'right' },
          { titulo: 'Descuentos', ancho: 58, alinear: 'right' },
          { titulo: 'Anticipos', ancho: 58, alinear: 'right' },
          { titulo: 'Sueldo neto', ancho: 66, alinear: 'right' },
          { titulo: 'Estado', ancho: 52 },
          { titulo: 'Fecha pago', ancho: 0 }
        ]
        columnas[columnas.length - 1].ancho = ancho - columnas.slice(0, -1).reduce((s, c) => s + c.ancho, 0)
        y = comun.dibujarTabla(doc, y, {
          columnas,
          filas: reporte.filas.map((f) => [
            f.empleado,
            f.cargo,
            m(f.sueldoBase),
            m(f.bonos),
            m(f.horasExtra),
            m(f.descuentos),
            m(f.anticipos),
            m(f.sueldoNeto),
            f.estadoEtiqueta,
            f.fechaPago ? comun.formatearDia(f.fechaPago) : '-'
          ]),
          total: ['Totales', '', m(t.sueldoBase), m(t.bonos), m(t.horasExtra), m(t.descuentos), m(t.anticipos), m(t.sueldoNeto), '', ''],
          alNuevaPagina: continuacion,
          tamanio: 8
        })
        doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE).text('Importes en bolivianos (Bs).', MARGEN, y - 4, { width: ancho })
        y = doc.y + 8
      }

      // --- Anticipos otorgados en el mes
      y = comun.asegurarEspacio(doc, y, 60, continuacion)
      y = comun.tituloSeccion(doc, y, 'Anticipos otorgados en el mes')
      const a = reporte.anticiposOtorgados
      if (a.cantidad === 0) {
        y = comun.textoSuave(doc, y, 'Sin anticipos otorgados en este mes', { alNuevaPagina: continuacion })
      } else {
        y = comun.dibujarTabla(doc, y, {
          columnas: [
            { titulo: 'Empleado', ancho: ancho - 420 },
            { titulo: 'Fecha', ancho: 120 },
            { titulo: 'Monto', ancho: 100, alinear: 'right' },
            { titulo: 'Método', ancho: 100 },
            { titulo: 'Estado', ancho: 100 }
          ],
          filas: a.items.map((i) => [i.empleado, comun.formatearDia(i.fecha), comun.monto(i.monto), comun.ETIQUETA_METODO[i.metodoPago] ?? i.metodoPago, i.estadoEtiqueta]),
          total: [`Total otorgado (${a.cantidad})`, '', comun.monto(a.total), '', ''],
          alNuevaPagina: continuacion
        })
      }

      // --- Nota: devengado vs caja
      const nota =
        'Nota: el costo del periodo es devengado (sueldo base + bonos + horas extra - descuentos = sueldo neto + anticipos ' +
        'descontados): lo que el edificio debe a su personal por el mes. Los anticipos se registran como gasto cuando salen ' +
        '(así los cuenta el saldo del edificio), por eso se muestran aparte y no se suman al costo del periodo.'
      doc.font('Helvetica').fontSize(8)
      const alto = doc.heightOfString(nota, { width: ancho }) + 4
      y = comun.asegurarEspacio(doc, y + 4, alto, continuacion)
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_TEXTO).text(nota, MARGEN, y, { width: ancho })
    }
  )
}

module.exports = { generarReportePersonalPdf, nombreArchivoReporte }
