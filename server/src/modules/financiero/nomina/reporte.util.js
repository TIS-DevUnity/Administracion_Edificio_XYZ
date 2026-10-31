/**
 * Reporte mensual de gastos de personal (HU8). Agregacion PURA con Decimal: recibe filas planas (sin Prisma)
 * y devuelve todo lo que muestran el JSON y el PDF.
 *
 *  - costoDelPeriodo es DEVENGADO: suma de (sueldoBase + bonos + horasExtra - descuentos) de las nominas del
 *    periodo, es decir, sueldo neto + anticipos descontados = lo que el edificio debe a su personal por ese mes.
 *  - Los anticipos otorgados son una seccion aparte, por la fecha del anticipo: el saldo del edificio los cuenta
 *    como gasto cuando salen (no cuando se descuentan), asi que no se suman al costo del periodo.
 */
const { Decimal } = require('../expensas/saldo.util')

const CERO = new Decimal(0)
const ETIQUETA_ESTADO = { PAGADA: 'Pagada', PENDIENTE: 'Pendiente' }
const ETIQUETA_ESTADO_ANTICIPO = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', DESCONTADO: 'Descontado' }

const redondear = (v) => new Decimal(v ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
const dinero = (v) => redondear(v).toFixed(2)
const suma = (valores) => valores.reduce((acc, v) => acc.plus(redondear(v)), CERO)

const nombreCompleto = (e) => `${e.apellidos} ${e.nombres}`
const porNombre = (a, b) =>
  a.empleado.apellidos.localeCompare(b.empleado.apellidos, 'es') ||
  a.empleado.nombres.localeCompare(b.empleado.nombres, 'es')

/**
 * @param {string} periodo  "YYYY-MM"
 * @param {Array} nominas   [{ id, empleado: { nombres, apellidos, cargo, documento }, sueldoBase, totalBonos,
 *                            totalHorasExtra, totalDescuentos, totalAnticipos, sueldoNeto, estado, fechaPago }]
 *                          (fechaPago: 'YYYY-MM-DD' o null). Solo entran las del periodo.
 * @param {Array} anticipos [{ id, empleado, fecha: 'YYYY-MM-DD', monto, metodoPago, estado }]. Solo entran los
 *                          cuya fecha cae dentro del mes del periodo.
 */
function construirReporte({ periodo, nominas = [], anticipos = [] }) {
  const delPeriodo = nominas.filter((n) => !n.periodo || n.periodo === periodo).sort(porNombre)
  const delMes = anticipos.filter((a) => String(a.fecha).startsWith(`${periodo}-`)).sort((a, b) => a.fecha.localeCompare(b.fecha) || porNombre(a, b))

  const filas = delPeriodo.map((n) => {
    const devengado = redondear(n.sueldoBase).plus(redondear(n.totalBonos)).plus(redondear(n.totalHorasExtra)).minus(redondear(n.totalDescuentos))
    return {
      nominaId: n.id,
      empleado: nombreCompleto(n.empleado),
      empleadoId: n.empleado.id ?? null,
      cargo: n.empleado.cargo,
      documento: n.empleado.documento ?? null,
      sueldoBase: dinero(n.sueldoBase),
      bonos: dinero(n.totalBonos),
      horasExtra: dinero(n.totalHorasExtra),
      descuentos: dinero(n.totalDescuentos),
      anticipos: dinero(n.totalAnticipos),
      sueldoNeto: dinero(n.sueldoNeto),
      devengado: devengado.toFixed(2),
      estado: n.estado,
      estadoEtiqueta: ETIQUETA_ESTADO[n.estado] ?? n.estado,
      fechaPago: n.fechaPago ?? null,
      _devengado: devengado
    }
  })

  const columna = (campo) => dinero(suma(delPeriodo.map((n) => n[campo])))
  const pagadas = delPeriodo.filter((n) => n.estado === 'PAGADA')
  const pendientes = delPeriodo.filter((n) => n.estado !== 'PAGADA')
  const costoDelPeriodo = filas.reduce((acc, f) => acc.plus(f._devengado), CERO)

  const itemsAnticipos = delMes.map((a) => ({
    anticipoId: a.id,
    empleado: nombreCompleto(a.empleado),
    cargo: a.empleado.cargo ?? null,
    fecha: a.fecha,
    monto: dinero(a.monto),
    metodoPago: a.metodoPago,
    estado: a.estado,
    estadoEtiqueta: ETIQUETA_ESTADO_ANTICIPO[a.estado] ?? a.estado
  }))

  return {
    periodo,
    vacio: delPeriodo.length === 0,
    filas: filas.map(({ _devengado, ...fila }) => fila),
    totales: {
      sueldoBase: columna('sueldoBase'),
      bonos: columna('totalBonos'),
      horasExtra: columna('totalHorasExtra'),
      descuentos: columna('totalDescuentos'),
      anticipos: columna('totalAnticipos'),
      sueldoNeto: columna('sueldoNeto')
    },
    resumen: {
      costoDelPeriodo: costoDelPeriodo.toFixed(2),
      pagado: dinero(suma(pagadas.map((n) => n.sueldoNeto))),
      pendiente: dinero(suma(pendientes.map((n) => n.sueldoNeto))),
      cantidad: delPeriodo.length,
      cantidadPagadas: pagadas.length,
      cantidadPendientes: pendientes.length
    },
    anticiposOtorgados: {
      cantidad: itemsAnticipos.length,
      total: dinero(suma(delMes.map((a) => a.monto))),
      items: itemsAnticipos
    }
  }
}

/**
 * Lista de periodos con nominas, mas reciente primero, a partir de grupos (periodo, estado):
 * [{ periodo, estado, cantidad, total }] -> [{ periodo, cantidad, pendientes, pagadas, totalNeto }].
 */
function resumirPeriodos(grupos = []) {
  const porPeriodo = new Map()
  for (const g of grupos) {
    const p = porPeriodo.get(g.periodo) ?? { periodo: g.periodo, cantidad: 0, pendientes: 0, pagadas: 0, total: CERO }
    p.cantidad += g.cantidad
    if (g.estado === 'PAGADA') p.pagadas += g.cantidad
    else p.pendientes += g.cantidad
    p.total = p.total.plus(redondear(g.total))
    porPeriodo.set(g.periodo, p)
  }
  return [...porPeriodo.values()]
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
    .map(({ total, ...p }) => ({ ...p, totalNeto: total.toFixed(2) }))
}

module.exports = { construirReporte, resumirPeriodos, ETIQUETA_ESTADO }
