/**
 * SALDO DEL EDIFICIO (BUG-04): cuanto dinero tiene registrado el edificio, de donde viene y en que
 * se gasto, en una sola consulta.
 *
 *   saldo = ingresos - gastos
 *   ingresos = pagos de expensas + ingresos extraordinarios
 *   gastos   = gastos extraordinarios + gastos de personal
 *
 * - "Pagos de expensas" es el dinero que realmente entro: la suma de los recibos, en la fecha del
 *   pago. Un pago cubierto con saldo a favor no suma (esa plata ya se conto cuando el residente la
 *   entrego como anticipo o exceso) y una expensa que todavia no se pago es una deuda, no un ingreso.
 * - Todo se calcula en cada consulta a partir de lo registrado; no existe un saldo guardado que se
 *   pueda editar o desfasar. Al registrar o corregir un pago o un movimiento, el saldo cambia solo.
 * - Lo que los residentes deben (`deudaPendienteDeCobro`) y el saldo a favor que tienen adelantado
 *   se informan aparte: no son parte del saldo.
 * - Gastos de personal (HU8): las nominas PAGADA suman su monto pagado en la fecha de pago, y los anticipos
 *   salariales suman su monto en su fecha (cuando salen, no cuando se descuentan). No hay doble conteo: la
 *   nomina paga el sueldo neto, ya sin los anticipos descontados. Siempre se cuentan, con o sin el interruptor
 *   de asientos de caja: este saldo no lee el libro de caja (movimientos_caja), asi que tampoco cuenta dos
 *   veces los asientos que esos pagos generan. Una nomina pagada con monto 0 no suma ni aparece en el historial.
 */
const prisma = require('../../../config/prisma')
const { Decimal, errorHttp, pendientesDe, formatearFolio } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')
const {
  calcularGastosPersonal,
  gastosPersonalParaCliente,
  totalGastos: sumarGastos,
  movimientoDeNomina,
  movimientoDeAnticipo
} = require('./gastos-personal.util')

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const CERO = new Decimal(0)

function dinero(valor) {
  return new Decimal(valor ?? 0).toFixed(2)
}

function parsearFecha(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor.trim())) {
    throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
  }
  const texto = valor.trim()
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return texto
}

/** Acepta Ingreso, Gasto (o Egreso) sin importar mayusculas. */
function normalizarTipo(valor) {
  if (valor === undefined || valor === null || valor === '') return null
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (texto === 'INGRESO') return 'INGRESO'
  if (texto === 'GASTO' || texto === 'EGRESO') return 'GASTO'
  throw errorHttp('tipo debe ser Ingreso o Gasto', 400)
}

/**
 * Filtros de fecha para las dos fuentes. Los recibos guardan un instante (dia en hora de Bolivia,
 * UTC-4 todo el anio) y los movimientos extraordinarios un dia de calendario.
 */
function filtrosDeFecha(desde, hasta) {
  return {
    recibos: {
      ...(desde ? { gte: new Date(`${desde}T00:00:00.000-04:00`) } : {}),
      ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-04:00`) } : {})
    },
    movimientos: {
      ...(desde ? { gte: new Date(`${desde}T00:00:00Z`) } : {}),
      ...(hasta ? { lte: new Date(`${hasta}T00:00:00Z`) } : {})
    }
  }
}

const conRango = (campo, rango) => (Object.keys(rango).length ? { [campo]: rango } : {})

/** Ingresos por pagos de expensas y extraordinarios, y gastos, dentro de un rango (o de todo). */
async function totales(filtros) {
  const [recibos, extraordinarios, nominasPagadas, anticipos] = await Promise.all([
    prisma.recibo.aggregate({ where: conRango('fechaPago', filtros.recibos), _sum: { montoTotal: true }, _count: { _all: true } }),
    prisma.movimientoFinanciero.groupBy({
      by: ['tipo'],
      where: conRango('fecha', filtros.movimientos),
      _sum: { monto: true },
      _count: { _all: true }
    }),
    // Gastos de personal: la nomina se ubica por su fecha de pago (instante) y el anticipo por su dia.
    prisma.nomina.aggregate({
      where: { estado: 'PAGADA', montoPagado: { gt: 0 }, ...conRango('fechaPago', filtros.recibos) },
      _sum: { montoPagado: true },
      _count: { _all: true }
    }),
    prisma.anticipoSalarial.aggregate({
      where: conRango('fecha', filtros.movimientos),
      _sum: { monto: true },
      _count: { _all: true }
    })
  ])
  const extra = (tipo) => extraordinarios.find((g) => g.tipo === tipo)
  const pagosDeExpensas = new Decimal(recibos._sum.montoTotal ?? 0)
  const ingresosExtraordinarios = new Decimal(extra('INGRESO')?._sum.monto ?? 0)
  const gastosExtraordinarios = new Decimal(extra('EGRESO')?._sum.monto ?? 0)
  const gastosPersonal = calcularGastosPersonal({
    nominas: { monto: nominasPagadas._sum.montoPagado, cantidad: nominasPagadas._count._all },
    anticipos: { monto: anticipos._sum.monto, cantidad: anticipos._count._all }
  })
  return {
    pagosDeExpensas,
    ingresosExtraordinarios,
    gastosExtraordinarios,
    totalIngresos: pagosDeExpensas.plus(ingresosExtraordinarios),
    gastosPersonal,
    totalGastos: sumarGastos(gastosExtraordinarios, gastosPersonal),
    cantidadPagos: recibos._count._all,
    cantidadIngresosExtraordinarios: extra('INGRESO')?._count._all ?? 0,
    cantidadGastos: extra('EGRESO')?._count._all ?? 0
  }
}

/** Texto del concepto de un pago: a que expensas se aplico, o pago anticipado. */
function conceptoDePago(recibo) {
  const codigo = recibo.inmueble?.codigo ?? ''
  const periodos = [...new Set((recibo.pagos ?? []).map((p) => p.expensa?.periodo).filter(Boolean))].sort()
  const sobrante = (recibo.movimientosSaldo ?? []).reduce((acc, m) => acc.plus(m.monto), CERO)
  if (periodos.length > 0) {
    const base = `Pago de expensa ${periodos.join(', ')} - ${codigo}`
    return sobrante.gt(0) ? `${base} (con saldo a favor de Bs ${dinero(sobrante)})` : base
  }
  return `Pago anticipado - ${codigo}`
}

function movimientoDePago(recibo) {
  return {
    id: recibo.id,
    origen: 'PAGO_EXPENSA',
    tipo: 'INGRESO',
    tipoEtiqueta: 'Ingreso',
    fecha: fechaEnZona(new Date(recibo.fechaPago)),
    concepto: conceptoDePago(recibo),
    monto: dinero(recibo.montoTotal),
    montoConSigno: dinero(recibo.montoTotal),
    detalle: {
      folio: formatearFolio(recibo.folioNumero),
      inmueble: recibo.inmueble?.codigo ?? null,
      metodoPago: recibo.metodoPago,
      referencia: recibo.referencia ?? null
    },
    _marca: new Date(recibo.fechaPago).getTime()
  }
}

function movimientoExtraordinario(m) {
  const esIngreso = m.tipo === 'INGRESO'
  const monto = new Decimal(m.monto)
  return {
    id: m.id,
    origen: 'EXTRAORDINARIO',
    tipo: esIngreso ? 'INGRESO' : 'GASTO',
    tipoEtiqueta: esIngreso ? 'Ingreso' : 'Gasto',
    fecha: new Date(m.fecha).toISOString().slice(0, 10),
    concepto: m.concepto,
    monto: monto.toFixed(2),
    montoConSigno: (esIngreso ? monto : monto.negated()).toFixed(2),
    detalle: { categoria: m.categoria?.nombre ?? null, tieneComprobante: Boolean(m.comprobantePath) },
    _marca: new Date(m.createdAt).getTime()
  }
}

/** Mas reciente primero: por dia y, dentro del dia, por hora de registro. */
const masReciente = (a, b) => b.fecha.localeCompare(a.fecha) || b._marca - a._marca

/** Lo que falta cobrar a los residentes y el saldo a favor que tienen adelantado (informativo). */
async function informativo() {
  const [expensas, saldo] = await Promise.all([
    prisma.expensa.findMany({ where: { estado: { not: 'PAGADA' } }, include: { pagos: true } }),
    prisma.movimientoSaldo.aggregate({ _sum: { monto: true } })
  ])
  const deuda = expensas.reduce((acc, e) => acc.plus(pendientesDe(e).total), CERO)
  return {
    deudaPendienteDeCobro: dinero(deuda),
    expensasPendientes: expensas.length,
    saldoAFavorDeResidentes: dinero(saldo._sum.monto)
  }
}

/**
 * Resumen del dinero del edificio.
 *  - `saldoActual`: lo acumulado hasta `hasta` (o hasta hoy si no se indica), sin limite por abajo.
 *  - `totalIngresos` / `totalGastos` / `saldoDelPeriodo` y el historial: el rango pedido
 *    (`desde` y `hasta`); sin rango es todo lo registrado y coincide con el saldo actual.
 *  - `tipo` filtra solo el historial (Ingreso o Gasto).
 */
async function obtener({ desde, hasta, tipo, pagina, porPagina } = {}) {
  const inicio = parsearFecha(desde, 'desde')
  const fin = parsearFecha(hasta, 'hasta')
  if (inicio && fin && inicio > fin) {
    throw errorHttp('El rango de fechas no es valido: desde es posterior a hasta', 400, { codigo: 'RANGO_INVALIDO' })
  }
  const tipoFiltro = normalizarTipo(tipo)

  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  const descartar = (numeroPagina - 1) * tamanio

  const filtrosPeriodo = filtrosDeFecha(inicio, fin)
  const filtrosAcumulado = filtrosDeFecha(null, fin)

  const whereRecibos = conRango('fechaPago', filtrosPeriodo.recibos)
  const whereMovimientos = {
    ...conRango('fecha', filtrosPeriodo.movimientos),
    ...(tipoFiltro === 'INGRESO' ? { tipo: 'INGRESO' } : {}),
    ...(tipoFiltro === 'GASTO' ? { tipo: 'EGRESO' } : {})
  }
  const incluirPagos = tipoFiltro !== 'GASTO' // los pagos de expensas siempre son ingresos
  const incluirPersonal = tipoFiltro !== 'INGRESO' // los gastos de personal siempre son gastos
  const whereNominas = { estado: 'PAGADA', montoPagado: { gt: 0 }, ...conRango('fechaPago', filtrosPeriodo.recibos) }
  const whereAnticipos = conRango('fecha', filtrosPeriodo.movimientos)

  const [
    delPeriodo,
    acumulado,
    recibos,
    extraordinarios,
    cantidadRecibos,
    cantidadExtraordinarios,
    pendiente,
    nominas,
    anticiposRegistrados,
    cantidadNominas,
    cantidadAnticipos
  ] = await Promise.all([
    totales(filtrosPeriodo),
    inicio ? totales(filtrosAcumulado) : null,
    // Del historial solo se leen los (pagina * tamanio) mas recientes de cada fuente; se mezclan despues.
    incluirPagos
      ? prisma.recibo.findMany({
          where: whereRecibos,
          include: {
            inmueble: { select: { codigo: true } },
            pagos: { select: { expensa: { select: { periodo: true } } } },
            movimientosSaldo: { select: { monto: true } }
          },
          orderBy: [{ fechaPago: 'desc' }, { folioNumero: 'desc' }],
          take: descartar + tamanio
        })
      : [],
    prisma.movimientoFinanciero.findMany({
      where: whereMovimientos,
      include: { categoria: { select: { nombre: true } } },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      take: descartar + tamanio
    }),
    incluirPagos ? prisma.recibo.count({ where: whereRecibos }) : 0,
    prisma.movimientoFinanciero.count({ where: whereMovimientos }),
    informativo(),
    incluirPersonal
      ? prisma.nomina.findMany({
          where: whereNominas,
          include: { empleado: { select: { nombres: true, apellidos: true } } },
          orderBy: [{ fechaPago: 'desc' }, { id: 'asc' }],
          take: descartar + tamanio
        })
      : [],
    incluirPersonal
      ? prisma.anticipoSalarial.findMany({
          where: whereAnticipos,
          include: { empleado: { select: { nombres: true, apellidos: true } } },
          orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
          take: descartar + tamanio
        })
      : [],
    incluirPersonal ? prisma.nomina.count({ where: whereNominas }) : 0,
    incluirPersonal ? prisma.anticipoSalarial.count({ where: whereAnticipos }) : 0
  ])

  const base = acumulado ?? delPeriodo
  const historial = [
    ...recibos.map(movimientoDePago),
    ...extraordinarios.map(movimientoExtraordinario),
    ...nominas.map(movimientoDeNomina),
    ...anticiposRegistrados.map(movimientoDeAnticipo)
  ]
    .sort(masReciente)
    .slice(descartar, descartar + tamanio)
    .map(({ _marca, ...movimiento }) => movimiento)
  const total = cantidadRecibos + cantidadExtraordinarios + cantidadNominas + cantidadAnticipos

  return {
    rango: { desde: inicio, hasta: fin },
    // El saldo se calcula en cada consulta con lo registrado: no hay ningun numero guardado que editar.
    saldoActual: dinero(base.totalIngresos.minus(base.totalGastos)),
    totalIngresos: dinero(delPeriodo.totalIngresos),
    totalGastos: dinero(delPeriodo.totalGastos),
    saldoDelPeriodo: dinero(delPeriodo.totalIngresos.minus(delPeriodo.totalGastos)),
    ingresos: {
      pagosDeExpensas: dinero(delPeriodo.pagosDeExpensas),
      extraordinarios: dinero(delPeriodo.ingresosExtraordinarios),
      cantidadPagos: delPeriodo.cantidadPagos,
      cantidadExtraordinarios: delPeriodo.cantidadIngresosExtraordinarios
    },
    gastos: {
      extraordinarios: dinero(delPeriodo.gastosExtraordinarios),
      cantidad: delPeriodo.cantidadGastos,
      personal: dinero(delPeriodo.gastosPersonal.total)
    },
    // Aditivo (HU8): nominas pagadas + anticipos salariales. Ya estan incluidos en totalGastos.
    gastosPersonal: gastosPersonalParaCliente(delPeriodo.gastosPersonal),
    // Informativo: lo que deben los residentes NO es parte del saldo del edificio.
    pendienteDeCobro: pendiente,
    movimientos: historial,
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

module.exports = { obtener }
