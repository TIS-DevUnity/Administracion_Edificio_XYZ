/**
 * Flujo de caja en Excel (HU13). Recibe lo que devuelve `flujo-caja.util.construirFlujoCaja`: el mismo objeto de
 * la vista previa JSON y del PDF. Hojas: "Resumen", "Ingresos y egresos" y "Movimientos".
 */
const { Decimal } = require('../expensas/saldo.util')
const comun = require('./excel-comun.util')

const { num, dia } = comun

/** flujo-caja-2026-01-01-a-2026-10-31.xlsx */
function nombreArchivoFlujoCajaExcel(flujo) {
  return `flujo-caja-${flujo.rango.desde}-a-${flujo.rango.hasta}.xlsx`
}

function textoVerificacion(v) {
  if (v.coincide === null) return 'Sin verificar'
  return v.coincide ? 'Coincide con el saldo del edificio' : 'NO coincide con el saldo del edificio'
}

async function generarFlujoCajaExcel(flujo) {
  const { desde, hasta } = flujo.rango
  const libro = comun.nuevoLibro(flujo.titulo)
  const encabezado = {
    titulo: flujo.titulo,
    lineas: [`Del ${desde} al ${hasta}`, ...(flujo.tipo ? [`Movimientos listados: solo ${flujo.tipo.toLowerCase()}s`] : [])],
    generadoEn: flujo.generadoEn,
    generadoPor: flujo.generadoPor
  }

  // --- Resumen
  const resumen = libro.addWorksheet('Resumen')
  let fila = comun.encabezado(resumen, encabezado)
  const v = flujo.verificacion
  comun.tabla(
    resumen,
    fila,
    [
      { titulo: 'Concepto', ancho: 46 },
      { titulo: 'Monto', ancho: 20, tipo: 'moneda' }
    ],
    [
      [`Saldo inicial (al ${flujo.saldoInicialAl})`, num(flujo.saldoInicial)],
      ['Total ingresos', num(flujo.totalIngresos)],
      ['Total egresos', num(flujo.totalEgresos)],
      { celdas: ['Saldo final', num(flujo.saldoFinal)], negrita: true },
      [`Saldo del edificio al ${hasta}`, num(v.saldoEdificio)],
      [`Verificación (${v.formula})`, textoVerificacion(v)]
    ]
  )
  if (flujo.vacio) comun.texto(resumen, fila + 8, flujo.mensaje, { cursiva: true })

  // --- Ingresos y egresos por concepto
  const conceptos = libro.addWorksheet('Ingresos y egresos')
  fila = comun.encabezado(conceptos, encabezado)
  const ing = flujo.ingresos
  const eg = flujo.egresos
  comun.tabla(
    conceptos,
    fila,
    [
      { titulo: 'Sección', ancho: 14 },
      { titulo: 'Concepto', ancho: 40 },
      { titulo: 'Cantidad', ancho: 12, tipo: 'entero' },
      { titulo: 'Monto', ancho: 20, tipo: 'moneda' }
    ],
    [
      ['Ingresos', 'Pagos de expensas', ing.expensas.cantidad, num(ing.expensas.total)],
      ...ing.otros.map((o) => ['Ingresos', o.categoria, o.cantidad, num(o.total)]),
      { celdas: ['Ingresos', 'Total ingresos', '', num(ing.total)], negrita: true },
      ...eg.porCategoria.map((c) => ['Egresos', c.categoria, c.cantidad, num(c.total)]),
      ['Egresos', 'Sueldos', eg.personal.sueldos.cantidad, num(eg.personal.sueldos.total)],
      ['Egresos', 'Anticipos salariales', eg.personal.anticipos.cantidad, num(eg.personal.anticipos.total)],
      { celdas: ['Egresos', 'Total egresos', '', num(eg.total)], negrita: true }
    ]
  )

  // --- Movimientos, de mas antiguo a mas reciente
  const movimientos = libro.addWorksheet('Movimientos')
  fila = comun.encabezado(movimientos, encabezado)
  if (flujo.movimientos.length === 0) {
    comun.texto(movimientos, fila, flujo.vacio ? flujo.mensaje : 'Sin movimientos del tipo indicado', { cursiva: true })
  } else {
    const neto = flujo.movimientos.reduce((acc, m) => acc.plus(m.montoConSigno), new Decimal(0))
    comun.tabla(
      movimientos,
      fila,
      [
        { titulo: 'Fecha', ancho: 14, tipo: 'fecha' },
        { titulo: 'Concepto', ancho: 52 },
        { titulo: 'Categoría', ancho: 28 },
        { titulo: 'Tipo', ancho: 10 },
        { titulo: 'Monto (egresos en negativo)', ancho: 26, tipo: 'moneda' }
      ],
      [
        ...flujo.movimientos.map((m) => [dia(m.fecha), m.concepto, m.categoria, m.tipo === 'INGRESO' ? 'Ingreso' : 'Gasto', num(m.montoConSigno)]),
        { celdas: ['', 'Neto de los movimientos listados', '', '', num(neto.toFixed(2))], negrita: true }
      ]
    )
  }

  return comun.aBuffer(libro)
}

module.exports = { generarFlujoCajaExcel, nombreArchivoFlujoCajaExcel }
