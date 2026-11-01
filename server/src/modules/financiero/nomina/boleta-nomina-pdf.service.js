/**
 * Boleta de pago de sueldo en PDF (HU8). `generarBoletaNominaPdf` recibe un objeto plano (lo arma
 * `nomina.util.datosParaBoleta`) y devuelve un Buffer; no usa Prisma, asi se prueba sin base de datos.
 *
 * datos = {
 *   periodo: '2026-10', estado: 'PAGADA' | 'PENDIENTE',
 *   empleado: { nombres, apellidos, documento, cargo, fechaIngreso: 'YYYY-MM-DD' },
 *   sueldoBase, bonos: [{ descripcion, monto }], horasExtra: [{ descripcion, horas, monto }],
 *   descuentos: [{ descripcion, monto }], anticipos: [{ fecha: 'YYYY-MM-DD', descripcion, monto }],
 *   totales: { bonos, horasExtra, descuentos, anticipos, totalGanado, sueldoNeto },
 *   pago: { fechaPago: 'YYYY-MM-DD', metodoPago, montoPagado } | null
 * }
 */
const { Decimal } = require('../expensas/saldo.util')
const { MARGEN, COLOR_TEXTO, COLOR_SUAVE } = require('../recibos/recibo-pdf.service')
const comun = require('./pdf-comun.util')

/** boleta-nomina-2026-10-mamani.pdf */
function nombreArchivoBoleta(datos) {
  return `boleta-nomina-${datos.periodo}-${comun.primerApellido(datos.empleado)}.pdf`
}

function generarBoletaNominaPdf(datos) {
  const e = datos.empleado
  const nombreCompleto = `${e.apellidos} ${e.nombres}`
  const pagada = datos.estado === 'PAGADA'

  return comun.generarPdf(
    {
      titulo: `Boleta de pago ${datos.periodo} - ${nombreCompleto}`,
      pie: `Boleta ${datos.periodo} - ${nombreCompleto} - Documento generado por el sistema`
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `Boleta de sueldo ${comun.etiquetaPeriodo(datos.periodo)} - ${nombreCompleto}`)

      comun.sello(doc, pagada ? 'PAGADA' : 'PENDIENTE DE PAGO', pagada ? comun.COLOR_PAGADA : comun.COLOR_PENDIENTE)
      let y = comun.cabecera(doc, 'Boleta de pago de sueldo', `Periodo: ${comun.etiquetaPeriodo(datos.periodo)}`)

      // --- Empleado
      y = comun.tituloSeccion(doc, y, 'Datos del empleado')
      for (const [etiqueta, valor] of [
        ['Empleado', nombreCompleto],
        ['Documento', e.documento],
        ['Cargo', e.cargo],
        ['Fecha de ingreso', comun.formatearDia(e.fechaIngreso)]
      ]) {
        y = comun.filaDato(doc, y, etiqueta, valor, { alNuevaPagina: continuacion })
      }
      y += 2

      // --- Sueldo base
      y = comun.asegurarEspacio(doc, y, 20, continuacion)
      doc.rect(MARGEN, y - 2, ancho, 18).fill(comun.COLOR_FONDO)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text('Sueldo base', MARGEN + 6, y + 2, { width: ancho / 2 })
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text(comun.monto(datos.sueldoBase), MARGEN, y + 2, { width: ancho - 6, align: 'right' })
      y += 24

      // --- Bonos
      y = seccionConceptos(doc, y, 'Bonos', datos.bonos, datos.totales.bonos, 'Sin bonos en este periodo', continuacion, ancho)

      // --- Horas extra (con horas y monto)
      y = comun.tituloSeccion(doc, y, 'Horas extra')
      if (datos.horasExtra.length === 0) {
        y = comun.textoSuave(doc, y, 'Sin horas extra en este periodo', { alNuevaPagina: continuacion })
      } else {
        const totalHoras = datos.horasExtra.reduce((acc, h) => acc.plus(h.horas ?? 0), new Decimal(0))
        y = comun.dibujarTabla(doc, y, {
          columnas: [
            { titulo: 'Concepto', ancho: ancho - 200 },
            { titulo: 'Horas', ancho: 90, alinear: 'right' },
            { titulo: 'Monto', ancho: 110, alinear: 'right' }
          ],
          filas: datos.horasExtra.map((h) => [h.descripcion, new Decimal(h.horas ?? 0).toFixed(2), comun.monto(h.monto)]),
          total: ['Total horas extra', totalHoras.toFixed(2), comun.monto(datos.totales.horasExtra)],
          alNuevaPagina: continuacion
        })
      }

      // --- Descuentos
      y = seccionConceptos(doc, y, 'Descuentos', datos.descuentos, datos.totales.descuentos, 'Sin descuentos en este periodo', continuacion, ancho)

      // --- Anticipos descontados
      y = comun.tituloSeccion(doc, y, 'Anticipos descontados')
      if (datos.anticipos.length === 0) {
        y = comun.textoSuave(doc, y, 'Sin anticipos descontados en este periodo', { alNuevaPagina: continuacion })
      } else {
        y = comun.dibujarTabla(doc, y, {
          columnas: [
            { titulo: 'Fecha del anticipo', ancho: 110 },
            { titulo: 'Detalle', ancho: ancho - 220 },
            { titulo: 'Monto aplicado', ancho: 110, alinear: 'right' }
          ],
          filas: datos.anticipos.map((a) => [comun.formatearDia(a.fecha), a.descripcion ?? '', comun.monto(a.monto)]),
          total: ['Total anticipos', '', comun.monto(datos.totales.anticipos)],
          alNuevaPagina: continuacion
        })
      }

      // --- Resumen y sueldo neto destacado
      y = comun.asegurarEspacio(doc, y, 100, continuacion)
      y = comun.tituloSeccion(doc, y, 'Resumen')
      for (const [etiqueta, valor] of [
        ['Total ganado (base + bonos + horas extra)', datos.totales.totalGanado],
        ['Total descuentos', datos.totales.descuentos],
        ['Total anticipos descontados', datos.totales.anticipos]
      ]) {
        doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_SUAVE).text(etiqueta, MARGEN, y, { width: ancho - 130 })
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXTO).text(comun.monto(valor), MARGEN, y, { width: ancho, align: 'right' })
        y += 16
      }
      doc.rect(MARGEN, y + 2, ancho, 30).fill(comun.COLOR_FONDO)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXTO).text('SUELDO NETO', MARGEN + 10, y + 11, { width: ancho / 2 })
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_TEXTO).text(comun.monto(datos.totales.sueldoNeto), MARGEN, y + 9, { width: ancho - 10, align: 'right' })
      y += 46

      // --- Pago
      y = comun.asegurarEspacio(doc, y, 64, continuacion)
      y = comun.tituloSeccion(doc, y, 'Pago')
      if (pagada && datos.pago) {
        for (const [etiqueta, valor] of [
          ['Fecha de pago', comun.formatearDia(datos.pago.fechaPago)],
          ['Método de pago', comun.ETIQUETA_METODO[datos.pago.metodoPago] ?? datos.pago.metodoPago],
          ['Monto pagado', comun.monto(datos.pago.montoPagado)]
        ]) {
          y = comun.filaDato(doc, y, etiqueta, valor, { alNuevaPagina: continuacion })
        }
      } else {
        // Se puede imprimir para firmar antes de pagar: sin datos de pago.
        doc.rect(MARGEN, y, ancho, 26).lineWidth(1.2).strokeColor(comun.COLOR_PENDIENTE).stroke()
        doc.font('Helvetica-Bold').fontSize(11).fillColor(comun.COLOR_PENDIENTE).text('PENDIENTE DE PAGO', MARGEN, y + 8, { width: ancho, align: 'center' })
        y += 34
      }

      // --- Firmas
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

/** Titulo + tabla Concepto/Monto con su total, o un aviso si no hay filas. */
function seccionConceptos(doc, y, titulo, filas, total, vacio, continuacion, ancho) {
  y = comun.tituloSeccion(doc, y, titulo)
  if (filas.length === 0) return comun.textoSuave(doc, y, vacio, { alNuevaPagina: continuacion })
  return comun.dibujarTabla(doc, y, {
    columnas: [
      { titulo: 'Concepto', ancho: ancho - 110 },
      { titulo: 'Monto', ancho: 110, alinear: 'right' }
    ],
    filas: filas.map((f) => [f.descripcion, comun.monto(f.monto)]),
    total: [`Total ${titulo.toLowerCase()}`, comun.monto(total)],
    alNuevaPagina: continuacion
  })
}

module.exports = { generarBoletaNominaPdf, nombreArchivoBoleta }
