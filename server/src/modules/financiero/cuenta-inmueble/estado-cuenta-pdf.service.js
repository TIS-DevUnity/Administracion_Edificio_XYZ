const PDFDocument = require('pdfkit')
const { Prisma } = require('@prisma/client')

const Decimal = Prisma.Decimal

const ZONA_HORARIA = process.env.CRON_TIMEZONE || 'America/La_Paz'
const MARGEN = 40
const COLOR_TEXTO = '#1f2937'
const COLOR_SUAVE = '#6b7280'
const COLOR_LINEA = '#d1d5db'
const COLOR_FONDO_ENCABEZADO = '#f3f4f6'

// Columnas de la tabla de movimientos.
const ANCHO_FECHA = 62
const ANCHO_CARGO = 64
const ANCHO_ABONO = 64
const ANCHO_SALDO = 74
const SEPARACION = 6

const ETIQUETA_SITUACION = { DEBE: 'Debe', A_FAVOR: 'A favor', AL_DIA: 'Al dia' }

/** "17 de octubre de 2026, 11:30" en hora de Bolivia. */
function formatearFechaHora(fecha) {
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

/** Bs 1,234.50 (los importes llegan como texto con 2 decimales). */
function monto(valor) {
  const [entero, decimales] = new Decimal(valor).toFixed(2).split('.')
  return `Bs ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`
}

function montoONada(valor) {
  return new Decimal(valor).isZero() ? '' : monto(valor)
}

/** Saldo corrido como texto: positivo = debe, negativo = a favor. */
function saldoTexto(instantanea) {
  const neto = new Decimal(instantanea.saldoNeto)
  if (neto.isZero()) return monto(0)
  return neto.gt(0) ? monto(neto) : `${monto(neto.negated())} a favor`
}

/** Texto y subtexto que acompanan a cada tipo de movimiento. */
function textosDe(movimiento) {
  const lineas = []
  if (movimiento.tipo === 'EXPENSA') {
    for (const linea of movimiento.desglose ?? []) {
      lineas.push(`${linea.concepto}: ${monto(linea.monto)}`)
    }
  } else if (movimiento.tipo === 'MORA') {
    const { base, tipoValor, valor } = movimiento.detalle ?? {}
    if (base) {
      lineas.push(
        `Calculada sobre ${monto(base)} (${tipoValor === 'PORCENTAJE' ? `${valor}%` : `monto fijo ${monto(valor)}`})`
      )
    }
  } else if (movimiento.tipo === 'PAGO' || movimiento.tipo === 'APLICACION_SALDO') {
    const partes = []
    // El uso del saldo a favor no es un cobro: no tiene metodo de pago ni recibo propios.
    if (movimiento.tipo === 'PAGO') {
      if (movimiento.metodoEtiqueta) partes.push(`Metodo: ${movimiento.metodoEtiqueta}`)
      if (movimiento.folio) partes.push(`Recibo ${movimiento.folio}`)
      if (movimiento.referencia) partes.push(`Ref.: ${movimiento.referencia}`)
    }
    if (partes.length) lineas.push(partes.join(' - '))
    if (movimiento.tipo === 'APLICACION_SALDO') {
      lineas.push(`Se uso ${monto(movimiento.aplicadoDeSaldoAFavor)} del saldo a favor (no cambia el saldo total)`)
    }
    if (movimiento.obligacion) {
      lineas.push(
        `Obligacion ${movimiento.obligacion.periodo}: original ${monto(movimiento.obligacion.importeOriginal)}, ` +
          `pagado hasta aqui ${monto(movimiento.obligacion.pagadoHastaAqui)}, saldo pendiente ${monto(movimiento.obligacion.saldoPendiente)}`
      )
    }
  } else if (movimiento.tipo === 'SALDO_A_FAVOR') {
    const partes = []
    if (movimiento.metodoEtiqueta) partes.push(`Metodo: ${movimiento.metodoEtiqueta}`)
    if (movimiento.folio) partes.push(`Recibo ${movimiento.folio}`)
    if (partes.length) lineas.push(partes.join(' - '))
  }
  return lineas
}

/**
 * Genera el estado de cuenta en PDF a partir de lo que devuelve
 * `cuenta-inmueble.service.obtenerEstadoCuenta` (asi el PDF y la pantalla muestran lo mismo).
 * Cada pagina repite la identificacion del inmueble y del periodo; si hay muchos movimientos se
 * reparten en las paginas necesarias sin cortar ningun renglon. Devuelve un Buffer.
 */
function generarEstadoCuentaPdf(estado) {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEN, bottom: 56, left: MARGEN, right: MARGEN },
      bufferPages: true,
      info: {
        Title: `Estado de cuenta ${estado.inmueble.codigo} - ${estado.periodo.etiqueta}`,
        Author: 'Administracion Edificio XYZ'
      }
    })
    const partes = []
    doc.on('data', (parte) => partes.push(parte))
    doc.on('end', () => resolver(Buffer.concat(partes)))
    doc.on('error', rechazar)

    const ancho = doc.page.width - MARGEN * 2
    const xFecha = MARGEN
    const xConcepto = xFecha + ANCHO_FECHA + SEPARACION
    const anchoConcepto = ancho - ANCHO_FECHA - ANCHO_CARGO - ANCHO_ABONO - ANCHO_SALDO - SEPARACION * 4
    const xCargo = xConcepto + anchoConcepto + SEPARACION
    const xAbono = xCargo + ANCHO_CARGO + SEPARACION
    const xSaldo = xAbono + ANCHO_ABONO + SEPARACION
    const limiteY = () => doc.page.height - doc.page.margins.bottom

    function linea(y) {
      doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho, y).strokeColor(COLOR_LINEA).lineWidth(0.5).stroke()
    }

    /** Cabecera de cada pagina: identifica el inmueble y el periodo. Devuelve la y donde sigue el contenido. */
    function cabeceraPagina() {
      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_TEXTO).text('Edificio XYZ - Estado de cuenta', MARGEN, MARGEN, { width: ancho })
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLOR_SUAVE)
        .text(
          `Inmueble ${estado.inmueble.codigo} (${estado.inmueble.tipo}) - Periodo: ${estado.periodo.etiqueta}`,
          MARGEN,
          doc.y + 2,
          { width: ancho }
        )
      const y = doc.y + 6
      linea(y)
      return y + 8
    }

    function cabeceraTabla(y) {
      doc.rect(MARGEN, y - 2, ancho, 16).fill(COLOR_FONDO_ENCABEZADO)
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_TEXTO)
      doc.text('Fecha', xFecha, y + 2, { width: ANCHO_FECHA })
      doc.text('Concepto', xConcepto, y + 2, { width: anchoConcepto })
      doc.text('Cargo', xCargo, y + 2, { width: ANCHO_CARGO, align: 'right' })
      doc.text('Abono', xAbono, y + 2, { width: ANCHO_ABONO, align: 'right' })
      doc.text('Saldo', xSaldo, y + 2, { width: ANCHO_SALDO, align: 'right' })
      return y + 18
    }

    function nuevaPagina() {
      doc.addPage()
      return cabeceraPagina()
    }

    /** Asegura que quepan `alto` puntos; si no, pasa a una pagina nueva (con la cabecera de la tabla). */
    function asegurarEspacio(y, alto, conCabeceraTabla) {
      if (y + alto <= limiteY()) return y
      const nuevaY = nuevaPagina()
      return conCabeceraTabla ? cabeceraTabla(nuevaY) : nuevaY
    }

    // ----------------------------------------------------------------- Pagina 1
    let y = cabeceraPagina()

    const datos = [
      ['Inmueble', `${estado.inmueble.codigo} (${estado.inmueble.tipo})`],
      [
        'Propietario / responsable',
        estado.ocupantes.length
          ? estado.ocupantes.map((o) => `${o.nombre} ${o.apellido} (${o.rol === 'PROPIETARIO' ? 'propietario' : 'inquilino'})`).join(', ')
          : 'Sin ocupantes vigentes'
      ],
      ['Periodo consultado', estado.periodo.etiqueta],
      ['Emitido', formatearFechaHora(estado.generadoEn)]
    ]
    for (const [etiqueta, valor] of datos) {
      const alto = Math.max(doc.heightOfString(valor, { width: ancho - 150 }), 12)
      y = asegurarEspacio(y, alto + 4, false)
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE).text(etiqueta, MARGEN, y, { width: 145 })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_TEXTO).text(valor, MARGEN + 150, y, { width: ancho - 150 })
      y += alto + 4
    }
    y += 6
    linea(y)
    y += 10

    if (estado.sinMovimientos) {
      y = asegurarEspacio(y, 60, false)
      doc.rect(MARGEN, y, ancho, 34).fill(COLOR_FONDO_ENCABEZADO)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text(estado.mensaje, MARGEN + 10, y + 11, { width: ancho - 20 })
      y += 46
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE).text(
        `Saldo al inicio del periodo: ${saldoTexto(estado.saldoAnterior)}`,
        MARGEN,
        y,
        { width: ancho }
      )
      y = doc.y + 10
    } else {
      y = cabeceraTabla(y)

      // Saldo con el que se llega al periodo.
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLOR_SUAVE)
      doc.text('Saldo anterior', xConcepto, y, { width: anchoConcepto })
      doc.text(saldoTexto(estado.saldoAnterior), xSaldo, y, { width: ANCHO_SALDO, align: 'right' })
      y += 14

      for (const movimiento of estado.movimientos) {
        const lineasExtra = textosDe(movimiento)

        doc.font('Helvetica-Bold').fontSize(8)
        const altoTitulo = doc.heightOfString(movimiento.descripcion, { width: anchoConcepto })
        doc.font('Helvetica').fontSize(7)
        const altoExtra = lineasExtra.reduce((suma, texto) => suma + doc.heightOfString(texto, { width: anchoConcepto }), 0)
        const alto = Math.max(altoTitulo + altoExtra, 12) + 6

        y = asegurarEspacio(y, alto, true)

        doc.font('Helvetica').fontSize(8).fillColor(COLOR_TEXTO).text(movimiento.fecha, xFecha, y, { width: ANCHO_FECHA })
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_TEXTO).text(movimiento.descripcion, xConcepto, y, { width: anchoConcepto })
        let yExtra = y + altoTitulo
        doc.font('Helvetica').fontSize(7).fillColor(COLOR_SUAVE)
        for (const texto of lineasExtra) {
          doc.text(texto, xConcepto, yExtra, { width: anchoConcepto })
          yExtra += doc.heightOfString(texto, { width: anchoConcepto })
        }
        doc.font('Helvetica').fontSize(8).fillColor(COLOR_TEXTO)
        doc.text(montoONada(movimiento.cargo), xCargo, y, { width: ANCHO_CARGO, align: 'right' })
        doc.text(montoONada(movimiento.abono), xAbono, y, { width: ANCHO_ABONO, align: 'right' })
        doc.font('Helvetica-Bold').text(saldoTexto(movimiento.saldoCorrido), xSaldo, y, { width: ANCHO_SALDO, align: 'right' })

        y += alto
        linea(y - 3)
      }
      y += 8
    }

    // ------------------------------------------------------------------ Resumen
    const final = estado.resumenPeriodo.saldoFinal
    const filasResumen = [
      ['Saldo anterior', saldoTexto(estado.saldoAnterior)],
      ['Total cargos del periodo', monto(estado.resumenPeriodo.totalCargos)],
      ['Total abonos del periodo', monto(estado.resumenPeriodo.totalAbonos)],
      ['Saldo total adeudado', monto(final.saldoAdeudado)]
    ]
    if (new Decimal(final.saldoAFavorRestante).gt(0)) {
      filasResumen.push(['Saldo a favor restante', monto(final.saldoAFavorRestante)])
    }
    filasResumen.push(['Situacion', ETIQUETA_SITUACION[final.situacion] ?? final.situacion])

    y = asegurarEspacio(y, 24 + filasResumen.length * 15, false)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text('Resumen', MARGEN, y)
    y = doc.y + 4
    for (const [etiqueta, valor] of filasResumen) {
      const destacada = etiqueta === 'Saldo total adeudado'
      doc.font(destacada ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(COLOR_TEXTO)
      doc.text(etiqueta, MARGEN, y, { width: 200 })
      doc.text(valor, MARGEN + 200, y, { width: 150, align: 'right' })
      y += 15
    }

    if (estado.deudasPendientes.length > 0) {
      y += 8
      y = asegurarEspacio(y, 24 + estado.deudasPendientes.length * 14, false)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXTO).text('Deudas pendientes', MARGEN, y)
      y = doc.y + 4
      for (const deuda of estado.deudasPendientes) {
        y = asegurarEspacio(y, 14, false)
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO)
        doc.text(`Expensa ${deuda.periodo}`, MARGEN, y, { width: 120 })
        doc.fillColor(COLOR_SUAVE).text(`cargado ${monto(deuda.importeCargado)}, pagado ${monto(deuda.pagado)}`, MARGEN + 120, y, { width: 260 })
        doc.fillColor(COLOR_TEXTO).font('Helvetica-Bold').text(monto(deuda.pendiente), MARGEN, y, { width: 350, align: 'right' })
        y += 14
      }
    }

    // ------------------------------------------------------ Pie de cada pagina
    const rango = doc.bufferedPageRange()
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i)
      const margenInferior = doc.page.margins.bottom
      doc.page.margins.bottom = 0 // para poder escribir dentro del margen inferior
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(COLOR_SUAVE)
        .text(
          `Inmueble ${estado.inmueble.codigo} - ${estado.periodo.etiqueta} - Documento generado por el sistema`,
          MARGEN,
          doc.page.height - 38,
          { width: ancho - 80, align: 'left', lineBreak: false }
        )
      doc.text(`Pagina ${i - rango.start + 1} de ${rango.count}`, MARGEN + ancho - 80, doc.page.height - 38, {
        width: 80,
        align: 'right',
        lineBreak: false
      })
      doc.page.margins.bottom = margenInferior
    }

    doc.end()
  })
}

module.exports = { generarEstadoCuentaPdf }
