/**
 * Piezas comunes de los Excel (.xlsx) de los reportes financieros (HU13). Cada generador recibe el objeto plano
 * que arma la funcion del reporte (el mismo de la vista previa JSON y del PDF): nada de Prisma, asi se prueban
 * sin base de datos. Los importes van como numeros reales con formato de moneda, nunca como texto.
 */
const ExcelJS = require('exceljs')
const { formatearFecha } = require('../recibos/recibo-pdf.service')

const NOMBRE_EDIFICIO = 'Edificio XYZ'
const FORMATO_MONEDA = '"Bs" #,##0.00'
const FORMATO_ENTERO = '0'
const FORMATO_FECHA = 'dd/mm/yyyy'
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const COLOR_CABECERA = 'FFF3F4F6'

const FORMATOS = { moneda: FORMATO_MONEDA, entero: FORMATO_ENTERO, fecha: FORMATO_FECHA }

/** Los reportes entregan los importes como texto con 2 decimales ("1234.50"); en la hoja van como numero. */
const num = (texto) => (texto === null || texto === undefined || texto === '' ? null : Number(texto))

/** Un dia YYYY-MM-DD como fecha real de Excel (medianoche UTC, sin desfase de zona). */
const dia = (texto) => (texto ? new Date(`${texto}T00:00:00Z`) : null)

function nuevoLibro(titulo) {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Administracion Edificio XYZ'
  libro.title = titulo
  libro.created = new Date()
  return libro
}

/**
 * Cabecera de la hoja: edificio, titulo, lineas propias del reporte, fecha de generacion y usuario.
 * Devuelve la fila donde sigue el contenido (deja una en blanco).
 */
function encabezado(hoja, { titulo, lineas = [], generadoEn, generadoPor }) {
  let fila = 1
  const escribir = (texto, { negrita = false, tamanio = 10 } = {}) => {
    const celda = hoja.getCell(fila, 1)
    celda.value = texto
    celda.font = { bold: negrita, size: tamanio }
    fila += 1
  }
  escribir(NOMBRE_EDIFICIO, { negrita: true, tamanio: 14 })
  escribir(titulo, { negrita: true, tamanio: 12 })
  for (const linea of lineas) escribir(linea)
  escribir(`Fecha de generación: ${formatearFecha(generadoEn)}`)
  escribir(`Generado por: ${generadoPor?.nombre ?? '-'}`)
  return fila + 1
}

/**
 * Tabla con cabecera en negrita. `columnas`: [{ titulo, ancho, tipo: 'texto'|'moneda'|'entero'|'fecha' }];
 * `filas`: arreglos de valores (numeros y fechas reales) o { celdas, negrita } para subtotales y totales.
 * Devuelve la fila siguiente a la tabla.
 */
function tabla(hoja, fila, columnas, filas) {
  columnas.forEach((c, i) => {
    const celda = hoja.getCell(fila, i + 1)
    celda.value = c.titulo
    celda.font = { bold: true }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CABECERA } }
    celda.alignment = { horizontal: c.tipo && c.tipo !== 'texto' ? 'right' : 'left', vertical: 'middle', wrapText: true }
    const columna = hoja.getColumn(i + 1)
    columna.width = Math.max(columna.width ?? 0, c.ancho ?? 14)
  })
  fila += 1

  for (const item of filas) {
    const { celdas, negrita } = Array.isArray(item) ? { celdas: item, negrita: false } : item
    celdas.forEach((valor, i) => {
      const celda = hoja.getCell(fila, i + 1)
      celda.value = valor === '' ? null : valor
      if (negrita) {
        celda.font = { bold: true }
        celda.border = { top: { style: 'thin' } }
      }
      const formato = FORMATOS[columnas[i]?.tipo]
      if (formato && (typeof valor === 'number' || valor instanceof Date)) celda.numFmt = formato
    })
    fila += 1
  }
  return fila + 1
}

/** Una linea de texto suelta (mensaje de "sin registros", nota). */
function texto(hoja, fila, contenido, { negrita = false, cursiva = false } = {}) {
  const celda = hoja.getCell(fila, 1)
  celda.value = contenido
  celda.font = { bold: negrita, italic: cursiva }
  return fila + 1
}

/** El libro como Buffer, listo para enviar. */
async function aBuffer(libro) {
  return Buffer.from(await libro.xlsx.writeBuffer())
}

/** Responde un .xlsx como el resto de los reportes: descarga por defecto. */
function enviarExcel(res, buffer, nombreArchivo) {
  res.set({
    'Content-Type': TIPO_XLSX,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Cache-Control': 'private, no-store'
  })
  res.send(buffer)
}

module.exports = {
  NOMBRE_EDIFICIO,
  FORMATO_MONEDA,
  FORMATO_ENTERO,
  FORMATO_FECHA,
  TIPO_XLSX,
  num,
  dia,
  nuevoLibro,
  encabezado,
  tabla,
  texto,
  aBuffer,
  enviarExcel
}
