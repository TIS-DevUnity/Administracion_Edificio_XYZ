/**
 * Listado de morosos en Excel (HU13). Recibe lo que devuelve `morosos.util.construirListadoMorosos`: el mismo
 * objeto de la vista previa JSON y del PDF. Hojas: "Morosos" (una fila por inmueble, con totales) y "Detalle"
 * (una fila por expensa).
 */
const comun = require('./excel-comun.util')

const { num, dia } = comun

/** listado-morosos-2026-01-01-a-2026-10-31.xlsx */
function nombreArchivoMorososExcel(listado) {
  return `listado-morosos-${listado.rango.desde}-a-${listado.rango.hasta}.xlsx`
}

async function generarMorososExcel(listado) {
  const { desde, hasta } = listado.rango
  const libro = comun.nuevoLibro(listado.titulo)
  const encabezado = {
    titulo: listado.titulo,
    lineas: [`Vencimientos del ${desde} al ${hasta}`, `Orden: ${listado.orden === 'antiguedad' ? 'antigüedad de la deuda' : 'monto adeudado'}`],
    generadoEn: listado.generadoEn,
    generadoPor: listado.generadoPor
  }

  // --- Una fila por inmueble
  const hoja = libro.addWorksheet('Morosos')
  let fila = comun.encabezado(hoja, encabezado)
  if (listado.vacio) {
    comun.texto(hoja, fila, listado.mensaje, { cursiva: true })
  } else {
    const t = listado.totales
    comun.tabla(
      hoja,
      fila,
      [
        { titulo: 'Inmueble', ancho: 14 },
        { titulo: 'Responsable de pago', ancho: 34 },
        { titulo: 'Periodo desde', ancho: 14 },
        { titulo: 'Periodo hasta', ancho: 14 },
        { titulo: 'Días de mora', ancho: 12, tipo: 'entero' },
        { titulo: 'Monto pendiente', ancho: 18, tipo: 'moneda' },
        { titulo: 'Mora aplicada', ancho: 16, tipo: 'moneda' },
        { titulo: 'Total acumulado', ancho: 18, tipo: 'moneda' }
      ],
      [
        ...listado.filas.map((f) => [
          f.inmueble,
          f.responsable ?? '-',
          f.periodoDeuda.desde,
          f.periodoDeuda.hasta,
          f.diasMora,
          num(f.montoPendiente),
          num(f.interesMora),
          num(f.totalAcumulado)
        ]),
        { celdas: [`Total (${t.inmuebles} inmuebles)`, '', '', '', '', num(t.montoPendiente), num(t.interesMora), num(t.totalAcumulado)], negrita: true }
      ]
    )
  }

  // --- Una fila por expensa
  const detalle = libro.addWorksheet('Detalle')
  fila = comun.encabezado(detalle, { ...encabezado, titulo: `${listado.titulo} - detalle por expensa` })
  if (listado.vacio) {
    comun.texto(detalle, fila, listado.mensaje, { cursiva: true })
  } else {
    comun.tabla(
      detalle,
      fila,
      [
        { titulo: 'Inmueble', ancho: 14 },
        { titulo: 'Responsable de pago', ancho: 34 },
        { titulo: 'Periodo', ancho: 14 },
        { titulo: 'Vencimiento', ancho: 14, tipo: 'fecha' },
        { titulo: 'Días de mora', ancho: 12, tipo: 'entero' },
        { titulo: 'Monto pendiente', ancho: 18, tipo: 'moneda' },
        { titulo: 'Mora aplicada', ancho: 16, tipo: 'moneda' },
        { titulo: 'Total', ancho: 18, tipo: 'moneda' }
      ],
      listado.filas.flatMap((f) =>
        f.expensas.map((e) => [f.inmueble, e.responsable ?? '-', e.periodo, dia(e.fechaVencimiento), e.diasMora, num(e.montoPendiente), num(e.interesMora), num(e.total)])
      )
    )
  }

  return comun.aBuffer(libro)
}

module.exports = { generarMorososExcel, nombreArchivoMorososExcel }
