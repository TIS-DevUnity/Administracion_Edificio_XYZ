const { Decimal, errorHttp, formatearFolio } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')
const { ETIQUETA_TIPO, dinero } = require('./cuentas.util')
const { estaCerrado } = require('./periodos.util')
const { normalizarPeriodo, normalizarDia, inicioDeDia, finDeDia } = require('./calendario.util')
const { presentarEvento } = require('./eventos.util')

const ESTADOS = ['PENDIENTE', 'CONCILIADO', 'CON_DIFERENCIA']
const ORIGENES = ['RECIBO', 'MOVIMIENTO_FINANCIERO', 'TRASPASO']
const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente',
  CONCILIADO: 'Conciliado',
  CON_DIFERENCIA: 'Con diferencia (pendiente de revision)'
}
const ETIQUETA_TIPO_MOVIMIENTO = { INGRESO: 'Ingreso', EGRESO: 'Gasto' }
// "Efectivo" es lo que pasa por una caja; "transferencia" agrupa todo lo que pasa por una cuenta de banco
// (incluidos tarjeta y cheque; el metodo exacto de un cobro va aparte en `metodoPago`).
const TIPO_CUENTA_POR_MEDIO = { EFECTIVO: 'CAJA', TRANSFERENCIA: 'BANCO' }

const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')
}

/** Acepta Ingreso, Gasto o Egreso (sin importar mayusculas) y devuelve el valor de la base. */
function normalizarTipoMovimiento(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (texto === 'INGRESO') return 'INGRESO'
  if (texto === 'GASTO' || texto === 'EGRESO') return 'EGRESO'
  throw errorHttp('tipo debe ser Ingreso o Gasto', 400)
}

/** Uno o varios estados separados por coma ("PENDIENTE,CON_DIFERENCIA"). */
function normalizarEstados(valor) {
  const partes = String(valor).split(',').map((p) => p.trim().toUpperCase()).filter(Boolean)
  const invalidos = partes.filter((p) => !ESTADOS.includes(p))
  if (partes.length === 0 || invalidos.length) {
    throw errorHttp(`estado debe ser uno o varios de: ${ESTADOS.join(', ')}`, 400)
  }
  return [...new Set(partes)]
}

function normalizarMedio(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!TIPO_CUENTA_POR_MEDIO[texto]) {
    throw errorHttp(`medio debe ser uno de: ${Object.keys(TIPO_CUENTA_POR_MEDIO).join(', ')}`, 400)
  }
  return texto
}

function normalizarOrigen(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!ORIGENES.includes(texto)) throw errorHttp(`origen debe ser uno de: ${ORIGENES.join(', ')}`, 400)
  return texto
}

function normalizarCuentaIdFiltro(valor) {
  if (typeof valor !== 'string' || !valor.trim()) throw errorHttp('cuentaId debe ser un texto', 400)
  return valor.trim()
}

/** Pagina y tamano de pagina con los mismos limites que el resto del modulo financiero. */
function paginar(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

/** Rango de fechas inclusivo (dias de Bolivia). `desde` posterior a `hasta` se rechaza. */
function normalizarRangoDias(desde, hasta) {
  const inicio = vacio(desde) ? null : normalizarDia(desde, 'desde')
  const fin = vacio(hasta) ? null : normalizarDia(hasta, 'hasta')
  if (inicio && fin && inicio > fin) {
    throw errorHttp('El rango de fechas no es valido: desde es posterior a hasta', 400, { codigo: 'RANGO_INVALIDO' })
  }
  return { desde: inicio, hasta: fin }
}

/** Filtros del listado (CA3 y CA9) ya validados. */
function normalizarFiltros(query = {}) {
  const periodo = vacio(query.periodo) ? null : normalizarPeriodo(query.periodo)
  const { desde, hasta } = normalizarRangoDias(query.desde, query.hasta)
  if (periodo && (desde || hasta)) throw errorHttp('Use periodo o desde/hasta, no ambos', 400)

  return {
    periodo,
    desde,
    hasta,
    cuentaId: vacio(query.cuentaId) ? null : normalizarCuentaIdFiltro(query.cuentaId),
    tipo: vacio(query.tipo) ? null : normalizarTipoMovimiento(query.tipo),
    estados: vacio(query.estado) ? null : normalizarEstados(query.estado),
    noConciliados: query.noConciliados === true || query.noConciliados === 'true',
    medio: vacio(query.medio) ? null : normalizarMedio(query.medio),
    origen: vacio(query.origen) ? null : normalizarOrigen(query.origen),
    ...paginar(query.pagina, query.porPagina)
  }
}

/** Condicion de Prisma para MovimientoCaja a partir de los filtros. */
function construirWhere(filtros) {
  const where = {}
  if (filtros.periodo) where.periodo = filtros.periodo
  if (filtros.desde || filtros.hasta) {
    where.fecha = {
      ...(filtros.desde ? { gte: inicioDeDia(filtros.desde) } : {}),
      ...(filtros.hasta ? { lte: finDeDia(filtros.hasta) } : {})
    }
  }
  if (filtros.cuentaId) where.cuentaId = filtros.cuentaId
  if (filtros.tipo) where.tipo = filtros.tipo
  // "No conciliados" son todos los estados menos CONCILIADO (CA9); se puede combinar con `estado`.
  const estados = filtros.noConciliados ? (filtros.estados ?? ESTADOS).filter((e) => e !== 'CONCILIADO') : filtros.estados
  if (estados) where.estado = { in: estados }
  if (filtros.medio) where.cuenta = { tipo: TIPO_CUENTA_POR_MEDIO[filtros.medio] }
  if (filtros.origen) where.origen = filtros.origen
  return where
}

/** "YYYY-MM-DD" de una columna DATE (medianoche UTC) o null. */
function diaDeColumnaDate(fecha) {
  return fecha ? new Date(fecha).toISOString().slice(0, 10) : null
}

/**
 * Forma publica de un asiento del libro de caja y bancos. `ultimoCierre` ("YYYY-MM" o null) sirve para
 * marcar los de un periodo ya cerrado (`bloqueado`).
 */
function presentarMovimiento(movimiento, ultimoCierre = null) {
  const esIngreso = movimiento.tipo === 'INGRESO'
  const monto = new Decimal(movimiento.monto)
  const cuenta = movimiento.cuenta
  return {
    id: movimiento.id,
    fecha: fechaEnZona(new Date(movimiento.fecha)),
    fechaHora: movimiento.fecha,
    concepto: movimiento.concepto,
    tipo: movimiento.tipo,
    tipoEtiqueta: ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipo],
    esIngreso,
    monto: monto.toFixed(2),
    montoConSigno: (esIngreso ? monto : monto.negated()).toFixed(2),
    cuenta: cuenta
      ? { id: cuenta.id, nombre: cuenta.nombre, tipo: cuenta.tipo, tipoEtiqueta: ETIQUETA_TIPO[cuenta.tipo] }
      : { id: movimiento.cuentaId },
    medio: cuenta ? (cuenta.tipo === 'CAJA' ? 'EFECTIVO' : 'TRANSFERENCIA') : null,
    metodoPago: movimiento.recibo?.metodoPago ?? null,
    estado: movimiento.estado,
    estadoEtiqueta: ETIQUETA_ESTADO[movimiento.estado],
    referencia: movimiento.referencia ?? null,
    observacion: movimiento.observacion ?? null,
    origen: movimiento.origen,
    periodo: movimiento.periodo,
    conciliadoEn: movimiento.conciliadoEn ?? null,
    bloqueado: estaCerrado(movimiento.periodo, ultimoCierre)
  }
}

/** Origen del asiento: el recibo, el movimiento extraordinario o el traspaso del que nace (CA4). */
function presentarOrigen(movimiento, contraparte = null) {
  if (movimiento.origen === 'RECIBO' && movimiento.recibo) {
    const r = movimiento.recibo
    return {
      tipo: 'RECIBO',
      id: r.id,
      folio: formatearFolio(r.folioNumero),
      inmueble: r.inmueble ? { id: r.inmueble.id, codigo: r.inmueble.codigo } : null,
      metodoPago: r.metodoPago,
      referencia: r.referencia ?? null,
      urlPdf: `/api/financiero/recibos/${r.id}/pdf`
    }
  }
  if (movimiento.origen === 'MOVIMIENTO_FINANCIERO' && movimiento.movimientoFinanciero) {
    const m = movimiento.movimientoFinanciero
    return {
      tipo: 'MOVIMIENTO_FINANCIERO',
      id: m.id,
      categoria: m.categoria ? { id: m.categoria.id, nombre: m.categoria.nombre } : null,
      concepto: m.concepto,
      tieneComprobante: Boolean(m.comprobantePath)
    }
  }
  if (movimiento.origen === 'TRASPASO') {
    return {
      tipo: 'TRASPASO',
      traspasoId: movimiento.traspasoId,
      contraparte: contraparte
        ? {
            id: contraparte.id,
            cuenta: contraparte.cuenta ? { id: contraparte.cuenta.id, nombre: contraparte.cuenta.nombre } : { id: contraparte.cuentaId },
            tipo: contraparte.tipo,
            monto: dinero(contraparte.monto)
          }
        : null
    }
  }
  return { tipo: movimiento.origen }
}

/** Detalle completo de un asiento: datos, origen, extracto, responsables e historial. */
function presentarDetalle(movimiento, { ultimoCierre = null, contraparte = null } = {}) {
  const persona = (u) => (u ? { id: u.id, nombre: u.nombre, apellido: u.apellido } : null)
  return {
    movimiento: presentarMovimiento(movimiento, ultimoCierre),
    origen: presentarOrigen(movimiento, contraparte),
    extracto: {
      fecha: diaDeColumnaDate(movimiento.fechaBanco),
      monto: movimiento.montoBanco === null || movimiento.montoBanco === undefined ? null : dinero(movimiento.montoBanco),
      tipo: movimiento.tipoBanco ?? null,
      referencia: movimiento.referenciaBanco ?? null,
      diferencia: movimiento.diferencia === null || movimiento.diferencia === undefined ? null : dinero(movimiento.diferencia)
    },
    registradoPor: persona(movimiento.registradoPor),
    conciliadoPor: persona(movimiento.conciliadoPor),
    historial: (movimiento.eventosConciliacion ?? []).map(presentarEvento)
  }
}

/**
 * Totales de un conjunto de asientos a partir de un groupBy por [tipo, estado] (con _sum.monto y
 * _count._all): ingresos, egresos, balance y el desglose por estado.
 */
function resumirGrupos(grupos) {
  const cero = () => ({ cantidad: 0, ingresos: new Decimal(0), egresos: new Decimal(0) })
  const porEstado = { PENDIENTE: cero(), CONCILIADO: cero(), CON_DIFERENCIA: cero() }
  let ingresos = new Decimal(0)
  let egresos = new Decimal(0)
  let cantidad = 0

  for (const g of grupos) {
    const monto = new Decimal(g._sum?.monto ?? 0)
    const n = g._count?._all ?? 0
    const destino = porEstado[g.estado]
    cantidad += n
    if (g.tipo === 'INGRESO') {
      ingresos = ingresos.plus(monto)
      if (destino) destino.ingresos = destino.ingresos.plus(monto)
    } else {
      egresos = egresos.plus(monto)
      if (destino) destino.egresos = destino.egresos.plus(monto)
    }
    if (destino) destino.cantidad += n
  }

  const mostrar = (e) => ({ cantidad: e.cantidad, ingresos: e.ingresos.toFixed(2), egresos: e.egresos.toFixed(2) })
  return {
    ingresos: ingresos.toFixed(2),
    egresos: egresos.toFixed(2),
    balance: ingresos.minus(egresos).toFixed(2),
    cantidad,
    porEstado: {
      PENDIENTE: mostrar(porEstado.PENDIENTE),
      CONCILIADO: mostrar(porEstado.CONCILIADO),
      CON_DIFERENCIA: mostrar(porEstado.CON_DIFERENCIA)
    }
  }
}

/** Datos de paginacion que devuelven los listados. */
function armarPaginacion(numeroPagina, tamanio, total) {
  return { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
}

module.exports = {
  ESTADOS,
  ORIGENES,
  ETIQUETA_ESTADO,
  vacio,
  normalizarTipoMovimiento,
  normalizarEstados,
  normalizarMedio,
  normalizarOrigen,
  normalizarCuentaIdFiltro,
  paginar,
  normalizarRangoDias,
  normalizarFiltros,
  construirWhere,
  diaDeColumnaDate,
  presentarMovimiento,
  presentarOrigen,
  presentarDetalle,
  resumirGrupos,
  armarPaginacion
}
