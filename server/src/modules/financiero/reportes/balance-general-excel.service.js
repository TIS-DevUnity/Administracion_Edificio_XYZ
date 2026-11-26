/**
 * Balance general en Excel (HU13). Recibe lo que devuelve `balance-general.util.construirBalanceGeneral`: el mismo
 * objeto de la vista previa JSON y del PDF. Hojas: "Balance" (con subtotales, totales y la nota de limitaciones)
 * y "Datos" (las mismas lineas en una tabla plana).
 */
const comun = require('./excel-comun.util')

const { num } = comun

/** balance-general-2026-11-14.xlsx */
function nombreArchivoBalanceGeneralExcel(balance) {
  return `balance-general-${balance.fechaCorte}.xlsx`
}

const SECCIONES = [
  { clave: 'activos', titulo: 'Activos', total: 'Total activos' },
  { clave: 'pasivos', titulo: 'Pasivos', total: 'Total pasivos' },
  { clave: 'patrimonio', titulo: 'Patrimonio', total: 'Total patrimonio' }
]

async function generarBalanceGeneralExcel(balance) {
  const libro = comun.nuevoLibro(balance.titulo)
  const encabezado = {
    titulo: balance.titulo,
    // Con fecha de corte (`fechaEmision` presente) la fecha del encabezado ya no es la de emision.
    lineas: [`${balance.fechaEmision ? 'A la fecha de corte' : 'A la fecha de emisión'}: ${balance.fechaCorte}`],
    generadoEn: balance.generadoEn,
    generadoPor: balance.generadoPor
  }

  // --- Balance
  const hoja = libro.addWorksheet('Balance')
  let fila = comun.encabezado(hoja, encabezado)
  // La nota de limitaciones va visible, antes de las cifras.
  hoja.mergeCells(fila, 1, fila, 3)
  const nota = hoja.getCell(fila, 1)
  nota.value = balance.nota
  nota.font = { italic: true }
  nota.alignment = { wrapText: true, vertical: 'top' }
  hoja.getRow(fila).height = 42
  fila += 2

  const filas = []
  for (const s of SECCIONES) {
    const bloque = balance[s.clave]
    filas.push({ celdas: [s.titulo, '', ''], negrita: true })
    for (const g of bloque.grupos) {
      filas.push({ celdas: [g.nombre, '', ''], negrita: true })
      for (const l of g.lineas) filas.push([`   ${l.concepto}`, l.cantidad, num(l.monto)])
      filas.push({ celdas: [`Subtotal ${g.nombre.toLowerCase()}`, '', num(g.subtotal)], negrita: true })
    }
    filas.push({ celdas: [s.total, '', num(bloque.total)], negrita: true })
    filas.push(['', '', ''])
  }
  const v = balance.verificacion
  filas.push({ celdas: ['Verificación', '', ''], negrita: true })
  filas.push(['Activos', '', num(v.activos)])
  filas.push(['Pasivos + patrimonio', '', num(v.pasivosMasPatrimonio)])
  filas.push([`${v.formula}: ${v.coincide ? 'se cumple' : 'NO se cumple'}`, '', ''])

  comun.tabla(
    hoja,
    fila,
    [
      { titulo: 'Concepto', ancho: 62 },
      { titulo: 'Cantidad', ancho: 12, tipo: 'entero' },
      { titulo: 'Monto', ancho: 20, tipo: 'moneda' }
    ],
    filas
  )

  // --- Datos en tabla plana
  const datos = libro.addWorksheet('Datos')
  fila = comun.encabezado(datos, { ...encabezado, titulo: `${balance.titulo} - datos` })
  comun.tabla(
    datos,
    fila,
    [
      { titulo: 'Sección', ancho: 14 },
      { titulo: 'Grupo', ancho: 32 },
      { titulo: 'Concepto', ancho: 58 },
      { titulo: 'Cantidad', ancho: 12, tipo: 'entero' },
      { titulo: 'Monto', ancho: 20, tipo: 'moneda' }
    ],
    SECCIONES.flatMap((s) => balance[s.clave].grupos.flatMap((g) => g.lineas.map((l) => [s.titulo, g.nombre, l.concepto, l.cantidad, num(l.monto)])))
  )

  return comun.aBuffer(libro)
}

module.exports = { generarBalanceGeneralExcel, nombreArchivoBalanceGeneralExcel }
