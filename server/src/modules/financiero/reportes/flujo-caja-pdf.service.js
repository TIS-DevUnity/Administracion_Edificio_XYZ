/**
 * Flujo de caja en PDF (HU13). Recibe lo que devuelve `flujo-caja.util.construirFlujoCaja` (objeto plano, sin
 * Prisma): el mismo que la vista previa JSON. Hoja A4 vertical; las tablas repiten su cabecera en cada pagina.
 */
const { MARGEN, COLOR_SUAVE, formatearFecha } = require('../recibos/recibo-pdf.service')
const comun = require('../nomina/pdf-comun.util')

/** flujo-caja-2026-01-01-a-2026-10-31.pdf */
function nombreArchivoFlujoCaja(flujo) {
  return `flujo-caja-${flujo.rango.desde}-a-${flujo.rango.hasta}.pdf`
}

function generarFlujoCajaPdf(flujo) {
  const { desde, hasta } = flujo.rango
  const m = (v) => comun.monto(v).replace('Bs ', '')

  return comun.generarPdf(
    {
      titulo: `${flujo.titulo} ${desde} a ${hasta}`,
      pie: `${flujo.titulo} ${desde} a ${hasta} - Documento generado por el sistema`
    },
    (doc) => {
      const ancho = comun.anchoUtil(doc)
      const continuacion = (d) => comun.cabeceraContinuacion(d, `${flujo.titulo} - ${desde} a ${hasta}`)
      const opciones = { alNuevaPagina: continuacion, anchoEtiqueta: 150 }

      let y = comun.cabecera(doc, flujo.titulo, `Del ${comun.formatearDia(desde)} al ${comun.formatearDia(hasta)}`)
      y = comun.filaDato(doc, y, 'Emitido', formatearFecha(flujo.generadoEn), opciones)
      y = comun.filaDato(doc, y, 'Generado por', flujo.generadoPor?.nombre ?? '-', opciones)
      if (flujo.tipo) y = comun.filaDato(doc, y, 'Movimientos listados', `Solo ${flujo.tipo.toLowerCase()}s`, opciones)
      y += 6

      if (flujo.vacio) {
        y = comun.filaDato(doc, y, `Saldo al ${comun.formatearDia(flujo.saldoInicialAl)}`, comun.monto(flujo.saldoInicial), opciones)
        comun.textoSuave(doc, y, flujo.mensaje, { alNuevaPagina: continuacion })
        return
      }

      const dosColumnas = (titulo, filas, total) => {
        y = comun.tituloSeccion(doc, y, titulo)
        y = comun.dibujarTabla(doc, y, {
          columnas: [
            { titulo: 'Concepto', ancho: ancho - 70 - 100 },
            { titulo: 'Cantidad', ancho: 70, alinear: 'right' },
            { titulo: 'Monto (Bs)', ancho: 100, alinear: 'right' }
          ],
          filas,
          total,
          alNuevaPagina: continuacion
        })
        y += 4
      }

      // --- Resumen
      y = comun.tituloSeccion(doc, y, 'Resumen')
      y = comun.filaDato(doc, y, `Saldo inicial (al ${comun.formatearDia(flujo.saldoInicialAl)})`, comun.monto(flujo.saldoInicial), opciones)
      y = comun.filaDato(doc, y, 'Total ingresos', comun.monto(flujo.totalIngresos), opciones)
      y = comun.filaDato(doc, y, 'Total egresos', comun.monto(flujo.totalEgresos), opciones)
      y = comun.filaDato(doc, y, 'Saldo final', comun.monto(flujo.saldoFinal), opciones)
      const v = flujo.verificacion
      const estado = v.coincide === null ? 'sin verificar' : v.coincide ? 'coincide con el saldo del edificio' : `NO coincide (saldo del edificio: ${comun.monto(v.saldoEdificio)})`
      y = comun.filaDato(doc, y, 'Verificación', `${v.formula}: ${estado}`, opciones)
      y += 6

      // --- Ingresos
      const ing = flujo.ingresos
      dosColumnas(
        'Ingresos',
        [['Pagos de expensas', String(ing.expensas.cantidad), m(ing.expensas.total)], ...ing.otros.map((o) => [o.categoria, String(o.cantidad), m(o.total)])],
        ['Total ingresos', '', m(ing.total)]
      )

      // --- Egresos
      const eg = flujo.egresos
      dosColumnas(
        'Egresos',
        [
          ...eg.porCategoria.map((c) => [c.categoria, String(c.cantidad), m(c.total)]),
          ['Sueldos', String(eg.personal.sueldos.cantidad), m(eg.personal.sueldos.total)],
          ['Anticipos salariales', String(eg.personal.anticipos.cantidad), m(eg.personal.anticipos.total)]
        ],
        ['Total egresos', '', m(eg.total)]
      )

      // --- Movimientos
      y = comun.asegurarEspacio(doc, y, 60, continuacion)
      y = comun.tituloSeccion(doc, y, 'Movimientos (de más antiguo a más reciente)')
      if (flujo.movimientos.length === 0) {
        y = comun.textoSuave(doc, y, 'Sin movimientos del tipo indicado', { alNuevaPagina: continuacion })
      } else {
        y = comun.dibujarTabla(doc, y, {
          columnas: [
            { titulo: 'Fecha', ancho: 62 },
            { titulo: 'Concepto', ancho: ancho - 62 - 110 - 80 },
            { titulo: 'Categoría', ancho: 110 },
            { titulo: 'Monto (Bs)', ancho: 80, alinear: 'right' }
          ],
          filas: flujo.movimientos.map((x) => [x.fecha, x.concepto, x.categoria, m(x.montoConSigno)]),
          alNuevaPagina: continuacion,
          tamanio: 8
        })
      }
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE).text('Importes en bolivianos (Bs). Los egresos figuran con signo negativo.', MARGEN, y, { width: ancho })
    }
  )
}

module.exports = { generarFlujoCajaPdf, nombreArchivoFlujoCaja }
