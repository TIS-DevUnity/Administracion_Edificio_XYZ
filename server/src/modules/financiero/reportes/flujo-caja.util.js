/**
 * Flujo de caja a nivel edificio (HU13): reglas puras, sin base de datos. Recibe las filas ya leidas y arma el
 * reporte; la vista previa JSON y el PDF salen del mismo resultado. Todo el dinero va con Decimal.
 *
 *   saldoFinal = saldoInicial + ingresos - egresos
 */
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { fechaEnZona, sumarDias } = require('../expensas/mora.util')
const { movimientoDeNomina, movimientoDeAnticipo } = require('../saldo-edificio/gastos-personal.util')
const { validarRango } = require('./morosos.util')

const CERO = new Decimal(0)
const TITULO = 'Flujo de caja'
const TIPO_REPORTE = 'FLUJO_CAJA'
const MENSAJE_VACIO = 'No hay movimientos en el rango de fechas indicado'
const SIN_CATEGORIA = 'Sin categoría'

const dinero = (valor) => new Decimal(valor ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
const suma = (valores) => valores.reduce((acc, v) => acc.plus(v), CERO)
const dia = (fecha) => new Date(fecha).toISOString().slice(0, 10)

/** Filtro opcional de la lista de movimientos: Ingreso o Gasto (tambien Egreso). Devuelve INGRESO, GASTO o null. */
function validarTipo(valor) {
  if (valor === undefined || valor === null || valor === '') return null
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (texto === 'INGRESO') return 'INGRESO'
  if (texto === 'GASTO' || texto === 'EGRESO') return 'GASTO'
  throw errorHttp('tipo debe ser Ingreso o Gasto', 400, { codigo: 'TIPO_INVALIDO' })
}

/** Dia anterior a `desde` (YYYY-MM-DD): hasta ahi llega el saldo inicial. */
const diaAnterior = (desde) => sumarDias(desde, -1)

/** Agrupa filas { categoria, monto } por nombre de categoria: [{ categoria, total, cantidad }], por nombre. */
function agruparPorCategoria(filas) {
  const grupos = new Map()
  for (const f of filas) {
    const nombre = f.categoria?.nombre ?? SIN_CATEGORIA
    const g = grupos.get(nombre) ?? { total: CERO, cantidad: 0 }
    grupos.set(nombre, { total: g.total.plus(f.monto), cantidad: g.cantidad + 1 })
  }
  return [...grupos.entries()]
    .map(([categoria, g]) => ({ categoria, total: g.total, cantidad: g.cantidad }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'))
}

const linea = (g) => ({ categoria: g.categoria, total: dinero(g.total), cantidad: g.cantidad })

function conceptoDeRecibo(r) {
  const codigo = r.inmueble?.codigo ?? ''
  const periodos = [...new Set((r.pagos ?? []).map((p) => p.expensa?.periodo).filter(Boolean))].sort()
  return periodos.length ? `Pago de expensa ${periodos.join(', ')} - ${codigo}` : `Pago anticipado - ${codigo}`
}

/** Movimientos del rango, todos en una sola forma, de la fecha mas antigua a la mas reciente. */
function listarMovimientos({ recibos, extraordinarios, nominas, anticipos }) {
  const filas = [
    ...recibos.map((r) => ({
      fecha: fechaEnZona(new Date(r.fechaPago)),
      origen: 'PAGO_EXPENSA',
      tipo: 'INGRESO',
      concepto: conceptoDeRecibo(r),
      categoria: 'Pagos de expensas',
      monto: new Decimal(r.montoTotal),
      _marca: new Date(r.fechaPago).getTime()
    })),
    ...extraordinarios.map((m) => ({
      fecha: dia(m.fecha),
      origen: 'EXTRAORDINARIO',
      tipo: m.tipo === 'INGRESO' ? 'INGRESO' : 'GASTO',
      concepto: m.concepto,
      categoria: m.categoria?.nombre ?? SIN_CATEGORIA,
      monto: new Decimal(m.monto),
      _marca: new Date(m.createdAt ?? m.fecha).getTime()
    })),
    ...nominas.map((n) => ({ ...movimientoDeNomina(n), categoria: 'Sueldos', monto: new Decimal(n.montoPagado) })),
    ...anticipos.map((a) => ({ ...movimientoDeAnticipo(a), categoria: 'Anticipos salariales', monto: new Decimal(a.monto) }))
  ]
  return filas
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a._marca - b._marca)
    .map((f) => ({
      fecha: f.fecha,
      origen: f.origen,
      tipo: f.tipo,
      concepto: f.concepto,
      categoria: f.categoria,
      monto: dinero(f.monto),
      montoConSigno: dinero(f.tipo === 'INGRESO' ? f.monto : f.monto.negated())
    }))
}

/**
 * Arma el flujo de caja. `saldoInicial`: saldo acumulado hasta el dia anterior a `desde`. `saldoEdificioAlCierre`:
 * saldo acumulado hasta `hasta` segun saldo-edificio (null si no se consulto); sirve para verificar el calculo.
 * `recibos`, `extraordinarios`, `nominas` y `anticipos` son las filas del rango (ver flujo-caja.service).
 */
function construirFlujoCaja({
  desde,
  hasta,
  tipo,
  saldoInicial = 0,
  saldoEdificioAlCierre = null,
  recibos = [],
  extraordinarios = [],
  nominas = [],
  anticipos = [],
  generadoPor = null,
  generadoEn = new Date()
} = {}) {
  const rango = validarRango({ desde, hasta })
  const filtro = validarTipo(tipo)

  const ingresosExtra = extraordinarios.filter((m) => m.tipo === 'INGRESO')
  const egresosExtra = extraordinarios.filter((m) => m.tipo !== 'INGRESO')

  const porExpensas = suma(recibos.map((r) => r.montoTotal))
  const otros = agruparPorCategoria(ingresosExtra)
  const totalOtros = suma(otros.map((g) => g.total))
  const categorias = agruparPorCategoria(egresosExtra)
  const sueldos = suma(nominas.map((n) => n.montoPagado))
  const anticiposTotal = suma(anticipos.map((a) => a.monto))
  const totalPersonal = sueldos.plus(anticiposTotal)

  const totalIngresos = porExpensas.plus(totalOtros)
  const totalEgresos = suma(categorias.map((g) => g.total)).plus(totalPersonal)
  const inicial = new Decimal(saldoInicial ?? 0)
  const saldoFinal = inicial.plus(totalIngresos).minus(totalEgresos)

  const movimientos = listarMovimientos({ recibos, extraordinarios, nominas, anticipos }).filter((m) => !filtro || m.tipo === filtro)
  const vacio = recibos.length + extraordinarios.length + nominas.length + anticipos.length === 0

  return {
    titulo: TITULO,
    tipoReporte: TIPO_REPORTE,
    rango,
    tipo: filtro === 'INGRESO' ? 'Ingreso' : filtro === 'GASTO' ? 'Gasto' : null,
    generadoEn: new Date(generadoEn).toISOString(),
    generadoPor,
    vacio,
    mensaje: vacio ? MENSAJE_VACIO : null,
    saldoInicial: dinero(inicial),
    saldoInicialAl: diaAnterior(rango.desde),
    ingresos: {
      expensas: { total: dinero(porExpensas), cantidad: recibos.length },
      otros: otros.map(linea),
      totalOtros: dinero(totalOtros),
      total: dinero(totalIngresos)
    },
    egresos: {
      porCategoria: categorias.map(linea),
      personal: {
        sueldos: { total: dinero(sueldos), cantidad: nominas.length },
        anticipos: { total: dinero(anticiposTotal), cantidad: anticipos.length },
        total: dinero(totalPersonal)
      },
      total: dinero(totalEgresos)
    },
    totalIngresos: dinero(totalIngresos),
    totalEgresos: dinero(totalEgresos),
    saldoFinal: dinero(saldoFinal),
    verificacion: {
      formula: 'saldo inicial + ingresos - egresos = saldo final',
      saldoFinalCalculado: dinero(saldoFinal),
      saldoEdificio: saldoEdificioAlCierre === null ? null : dinero(saldoEdificioAlCierre),
      coincide: saldoEdificioAlCierre === null ? null : saldoFinal.eq(new Decimal(saldoEdificioAlCierre))
    },
    movimientos
  }
}

module.exports = {
  TITULO,
  TIPO_REPORTE,
  MENSAJE_VACIO,
  validarTipo,
  diaAnterior,
  agruparPorCategoria,
  listarMovimientos,
  construirFlujoCaja
}
