const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')
const { exigirCampos } = require('./cuentas.util')
const { OPERACIONES, RESULTADOS } = require('./eventos.util')
const { normalizarDia, normalizarPeriodo, inicioDeDia, finDeDia } = require('./calendario.util')
const {
  vacio,
  normalizarTipoMovimiento,
  normalizarCuentaIdFiltro,
  normalizarRangoDias,
  paginar
} = require('./movimientos-caja.util')

const MAX_REFERENCIA = 200
const MAX_OBSERVACION = 500
const MONTO_MAXIMO = new Decimal('9999999999.99') // limite de DECIMAL(12,2)

// Intentos que se rechazan con 409 y que igual quedan en el historial (CA10 y CA20).
const RECHAZOS_REGISTRABLES = ['ASIENTO_YA_CONCILIADO', 'PERIODO_CERRADO']

/** Texto opcional: null si falta o esta vacio. `colapsar` junta los espacios repetidos en uno. */
function normalizarTexto(valor, campo, max, colapsar) {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw errorHttp(`${campo} debe ser un texto`, 400)
  const texto = colapsar ? valor.trim().replace(/\s+/g, ' ') : valor.trim()
  if (!texto) return null
  if (texto.length > max) throw errorHttp(`${campo} no puede superar ${max} caracteres`, 400)
  return texto
}

function normalizarReferencia(valor) {
  return normalizarTexto(valor, 'referencia', MAX_REFERENCIA, true)
}

function normalizarObservacion(valor) {
  return normalizarTexto(valor, 'observacion', MAX_OBSERVACION, false)
}

/** Forma comparable de una referencia: sin espacios repetidos ni mayusculas; vacia es null. */
function claveReferencia(valor) {
  if (valor === undefined || valor === null) return null
  return String(valor).trim().replace(/\s+/g, ' ').toLowerCase() || null
}

/** Monto que informa el extracto: mayor que cero, hasta 2 decimales y el maximo de DECIMAL(12,2). */
function parsearMontoExtracto(valor) {
  let monto
  try {
    monto = new Decimal(valor)
  } catch {
    throw errorHttp('monto debe ser un numero', 400)
  }
  if (!monto.isFinite()) throw errorHttp('monto debe ser un numero', 400)
  if (monto.lte(0)) throw errorHttp('monto debe ser mayor que cero', 400)
  if (monto.decimalPlaces() > 2) throw errorHttp('monto admite como maximo 2 decimales', 400)
  if (monto.gt(MONTO_MAXIMO)) throw errorHttp('monto supera el maximo permitido', 400)
  return monto
}

/**
 * Lo que el Administrador lee en el extracto bancario o en el arqueo: fecha (YYYY-MM-DD), monto, tipo y
 * referencia (opcional). `observacion` es opcional salvo que haya diferencias.
 */
function normalizarExtracto(datos) {
  exigirCampos(datos, ['fecha', 'monto', 'tipo'])
  return {
    fecha: normalizarDia(datos.fecha, 'fecha'),
    monto: parsearMontoExtracto(datos.monto),
    tipo: normalizarTipoMovimiento(datos.tipo),
    referencia: normalizarReferencia(datos.referencia),
    observacion: normalizarObservacion(datos.observacion)
  }
}

/** Lo nuestro, en la misma forma que el extracto, para compararlos y guardarlos en el historial. */
function datosNuestros(asiento) {
  return {
    fecha: fechaEnZona(new Date(asiento.fecha)),
    monto: new Decimal(asiento.monto).toFixed(2),
    tipo: asiento.tipo,
    referencia: asiento.referencia ?? null
  }
}

/**
 * Compara un asiento con el extracto de forma estricta (CA6 y CA7):
 *  - fecha: el dia de nuestro asiento en America/La_Paz contra el dia del extracto;
 *  - monto: igual al centavo;  - tipo: igual;
 *  - referencia: igual sin importar mayusculas ni espacios repetidos (vacia solo coincide con vacia).
 */
function compararConExtracto(asiento, extracto) {
  const nuestro = datosNuestros(asiento)
  const diferencias = []
  if (nuestro.fecha !== extracto.fecha) diferencias.push({ campo: 'fecha', nuestro: nuestro.fecha, banco: extracto.fecha })
  if (!new Decimal(asiento.monto).equals(extracto.monto)) {
    diferencias.push({ campo: 'monto', nuestro: nuestro.monto, banco: extracto.monto.toFixed(2) })
  }
  if (asiento.tipo !== extracto.tipo) diferencias.push({ campo: 'tipo', nuestro: asiento.tipo, banco: extracto.tipo })
  if (claveReferencia(asiento.referencia) !== claveReferencia(extracto.referencia)) {
    diferencias.push({ campo: 'referencia', nuestro: nuestro.referencia, banco: extracto.referencia })
  }
  return { coincide: diferencias.length === 0, diferencias }
}

/** Columnas del extracto que se guardan en el asiento. `diferencia` es nuestro monto menos el del banco. */
function datosDeExtracto(extracto, asiento) {
  return {
    montoBanco: extracto.monto,
    fechaBanco: new Date(`${extracto.fecha}T00:00:00Z`),
    tipoBanco: extracto.tipo,
    referenciaBanco: extracto.referencia,
    diferencia: new Decimal(asiento.monto).minus(extracto.monto)
  }
}

/** Detalle que queda en el historial de un intento: lo enviado, lo nuestro y las diferencias. */
function detalleDeIntento(asiento, extracto, diferencias) {
  return {
    enviado: {
      fecha: extracto.fecha,
      monto: extracto.monto.toFixed(2),
      tipo: extracto.tipo,
      referencia: extracto.referencia
    },
    nuestro: datosNuestros(asiento),
    diferencias,
    observacion: extracto.observacion
  }
}

function normalizarOperacion(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!OPERACIONES.includes(texto)) throw errorHttp(`operacion debe ser una de: ${OPERACIONES.join(', ')}`, 400)
  return texto
}

function normalizarResultado(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!RESULTADOS.includes(texto)) throw errorHttp(`resultado debe ser uno de: ${RESULTADOS.join(', ')}`, 400)
  return texto
}

/** Filtros del historial de conciliaciones (CA21). */
function normalizarFiltrosEventos(query = {}) {
  const texto = (campo) => {
    if (vacio(query[campo])) return null
    if (typeof query[campo] !== 'string') throw errorHttp(`${campo} debe ser un texto`, 400)
    return query[campo].trim()
  }
  const { desde, hasta } = normalizarRangoDias(query.desde, query.hasta)
  return {
    cuentaId: vacio(query.cuentaId) ? null : normalizarCuentaIdFiltro(query.cuentaId),
    periodo: vacio(query.periodo) ? null : normalizarPeriodo(query.periodo),
    movimientoCajaId: texto('movimientoCajaId'),
    operacion: vacio(query.operacion) ? null : normalizarOperacion(query.operacion),
    resultado: vacio(query.resultado) ? null : normalizarResultado(query.resultado),
    usuarioId: texto('usuarioId'),
    desde,
    hasta,
    ...paginar(query.pagina, query.porPagina)
  }
}

function construirWhereEventos(filtros) {
  const where = {}
  for (const campo of ['cuentaId', 'periodo', 'movimientoCajaId', 'operacion', 'resultado', 'usuarioId']) {
    if (filtros[campo]) where[campo] = filtros[campo]
  }
  if (filtros.desde || filtros.hasta) {
    where.createdAt = {
      ...(filtros.desde ? { gte: inicioDeDia(filtros.desde) } : {}),
      ...(filtros.hasta ? { lte: finDeDia(filtros.hasta) } : {})
    }
  }
  return where
}

module.exports = {
  MAX_OBSERVACION,
  RECHAZOS_REGISTRABLES,
  normalizarReferencia,
  normalizarObservacion,
  claveReferencia,
  parsearMontoExtracto,
  normalizarExtracto,
  datosNuestros,
  compararConExtracto,
  datosDeExtracto,
  detalleDeIntento,
  normalizarFiltrosEventos,
  construirWhereEventos
}
