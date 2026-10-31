/**
 * Reglas puras de los anticipos salariales (HU8): validacion del alta, estado y reparto del descuento en
 * la nomina. No toca la base de datos; el dinero se calcula con Decimal.
 */
const { Decimal, errorHttp, parsearMonto, validarMetodoPago } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')

const CERO = new Decimal(0)
const ESTADOS = ['PENDIENTE', 'PARCIAL', 'DESCONTADO']
const ETIQUETA_ESTADO = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', DESCONTADO: 'Descontado' }
const MAX_DESCRIPCION = 200
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const FECHA_MINIMA = '1900-01-01'

const redondear = (valor) => new Decimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
const dinero = (valor) => redondear(valor ?? 0).toFixed(2)
const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

// ---------------------------------------------------------------------------
// Validacion del alta
// ---------------------------------------------------------------------------

function errorFecha(mensaje, codigo) {
  return errorHttp(mensaje, 400, { codigo })
}

/** Dia YYYY-MM-DD valido y no futuro (hoy en hora de Bolivia). Devuelve { texto, fecha } (fecha: medianoche UTC, columna DATE). */
function parsearFechaAnticipo(valor, hoy = fechaEnZona(), campo = 'fecha', codigo = 'FECHA_ANTICIPO_INVALIDA') {
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor.trim())) {
    throw errorFecha(`${campo} debe tener el formato YYYY-MM-DD`, codigo)
  }
  const texto = valor.trim()
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorFecha(`${campo} no es una fecha valida`, codigo)
  }
  if (texto < FECHA_MINIMA) throw errorFecha(`${campo} no puede ser anterior a ${FECHA_MINIMA}`, codigo)
  if (texto > hoy) throw errorFecha(`${campo} no puede ser una fecha futura`, codigo)
  return { texto, fecha }
}

function normalizarDescripcion(valor) {
  if (typeof valor !== 'string' || !valor.trim()) throw errorHttp('descripcion es requerida', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length > MAX_DESCRIPCION) {
    throw errorHttp(`descripcion no puede superar ${MAX_DESCRIPCION} caracteres`, 400)
  }
  return texto
}

/** Metodo de pago de un anticipo: los de un pago real; SALDO_A_FAVOR no aplica a personal. */
function validarMetodoAnticipo(valor) {
  if (valor === 'SALDO_A_FAVOR') {
    throw errorHttp('SALDO_A_FAVOR no aplica a pagos de personal (anticipos ni nomina): use EFECTIVO, TRANSFERENCIA, TARJETA o CHEQUE', 400, {
      codigo: 'METODO_PAGO_INVALIDO'
    })
  }
  validarMetodoPago(valor)
  return valor
}

/** Alta: empleadoId, monto, fecha, metodoPago y descripcion son obligatorios. */
function validarDatosAnticipo(datos = {}, hoy) {
  const campos = ['empleadoId', 'monto', 'fecha', 'metodoPago', 'descripcion']
  const faltantes = campos.filter((c) => vacio(datos[c]))
  if (faltantes.length) {
    throw errorHttp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: faltantes }
    })
  }
  if (typeof datos.empleadoId !== 'string') throw errorHttp('empleadoId debe ser un texto', 400)
  const { texto, fecha } = parsearFechaAnticipo(datos.fecha, hoy)
  return {
    empleadoId: datos.empleadoId.trim(),
    monto: parsearMonto(datos.monto, 'monto'),
    fecha,
    fechaTexto: texto,
    metodoPago: validarMetodoAnticipo(datos.metodoPago),
    descripcion: normalizarDescripcion(datos.descripcion)
  }
}

// ---------------------------------------------------------------------------
// Estado y saldo
// ---------------------------------------------------------------------------

/** Lo que falta por descontar (nunca negativo). */
function saldoPendiente(monto, montoDescontado) {
  const saldo = redondear(monto).minus(redondear(montoDescontado ?? 0))
  return saldo.lt(0) ? CERO : saldo
}

/** PENDIENTE (nada descontado), PARCIAL (descontado en parte) o DESCONTADO (por completo). */
function estadoAnticipo(monto, montoDescontado) {
  const descontado = redondear(montoDescontado ?? 0)
  if (descontado.lte(0)) return 'PENDIENTE'
  return descontado.gte(redondear(monto)) ? 'DESCONTADO' : 'PARCIAL'
}

// ---------------------------------------------------------------------------
// Descuento automatico
// ---------------------------------------------------------------------------

const textoDeDia = (f) => (f instanceof Date ? f.toISOString().slice(0, 10) : String(f ?? ''))
const marca = (f) => (f instanceof Date ? f.getTime() : new Date(f ?? 0).getTime())

/**
 * Reparte lo disponible del sueldo entre los anticipos con saldo, del mas antiguo al mas nuevo (fecha, luego
 * createdAt, luego id). Cada anticipo recibe como maximo su saldo pendiente y el total nunca supera
 * `disponible`; lo que no cabe queda pendiente para la nomina siguiente. `anticipos`: filas con
 * { id, monto, montoDescontado, fecha, createdAt }.
 * Devuelve { aplicaciones: [{ anticipoId, monto, montoDescontado, estado }], total } donde `montoDescontado`
 * y `estado` son los que quedan en el anticipo despues de aplicar.
 */
function distribuirAnticipos(anticipos, disponible) {
  let restante = new Decimal(disponible ?? 0)
  if (restante.lt(0)) restante = CERO
  restante = restante.toDecimalPlaces(2, Decimal.ROUND_DOWN)

  const ordenados = [...anticipos].sort(
    (a, b) =>
      textoDeDia(a.fecha).localeCompare(textoDeDia(b.fecha)) ||
      marca(a.createdAt) - marca(b.createdAt) ||
      String(a.id).localeCompare(String(b.id))
  )

  const aplicaciones = []
  let total = CERO
  for (const a of ordenados) {
    if (restante.lte(0)) break
    const saldo = saldoPendiente(a.monto, a.montoDescontado)
    if (saldo.lte(0)) continue
    const aplicado = Decimal.min(saldo, restante)
    const descontado = redondear(a.montoDescontado ?? 0).plus(aplicado)
    aplicaciones.push({
      anticipoId: a.id,
      monto: aplicado,
      montoDescontado: descontado,
      estado: estadoAnticipo(a.monto, descontado)
    })
    total = total.plus(aplicado)
    restante = restante.minus(aplicado)
  }
  return { aplicaciones, total }
}

// ---------------------------------------------------------------------------
// Filtros del listado
// ---------------------------------------------------------------------------

function normalizarFiltroEstado(valor) {
  if (vacio(valor)) return null
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!ESTADOS.includes(texto)) throw errorHttp(`estado debe ser uno de: ${ESTADOS.join(', ')}`, 400)
  return texto
}

function normalizarFiltroEmpleado(valor) {
  if (vacio(valor)) return null
  if (typeof valor !== 'string') throw errorHttp('empleadoId debe ser un texto', 400)
  return valor.trim()
}

/** desde/hasta opcionales (YYYY-MM-DD, inclusivos). Si desde es posterior a hasta: 400 RANGO_INVALIDO. */
function normalizarRango(desde, hasta) {
  const dia = (v, campo) => {
    if (vacio(v)) return null
    if (typeof v !== 'string' || !SOLO_FECHA.test(v.trim())) throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
    const texto = v.trim()
    if (new Date(`${texto}T00:00:00Z`).toISOString().slice(0, 10) !== texto) {
      throw errorHttp(`${campo} no es una fecha valida`, 400)
    }
    return texto
  }
  const inicio = dia(desde, 'desde')
  const fin = dia(hasta, 'hasta')
  if (inicio && fin && inicio > fin) {
    throw errorHttp('El rango de fechas no es valido: desde es posterior a hasta', 400, { codigo: 'RANGO_INVALIDO' })
  }
  return { desde: inicio, hasta: fin }
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

function anticipoParaCliente(a) {
  const salida = {
    id: a.id,
    empleadoId: a.empleadoId,
    monto: dinero(a.monto),
    montoDescontado: dinero(a.montoDescontado),
    saldoPendiente: saldoPendiente(a.monto, a.montoDescontado).toFixed(2),
    fecha: textoDeDia(a.fecha),
    metodoPago: a.metodoPago,
    descripcion: a.descripcion,
    estado: a.estado,
    estadoEtiqueta: ETIQUETA_ESTADO[a.estado],
    createdAt: a.createdAt
  }
  if (a.empleado) {
    salida.empleado = {
      id: a.empleado.id,
      nombres: a.empleado.nombres,
      apellidos: a.empleado.apellidos,
      cargo: a.empleado.cargo,
      documento: a.empleado.documento
    }
  }
  if (a.aplicaciones) {
    salida.aplicaciones = a.aplicaciones.map((p) => ({
      id: p.id,
      nominaId: p.nominaId,
      periodo: p.nomina?.periodo ?? null,
      estadoNomina: p.nomina?.estado ?? null,
      montoAplicado: dinero(p.monto),
      createdAt: p.createdAt
    }))
  }
  if (a.asiento !== undefined) {
    salida.asiento = a.asiento
      ? {
          id: a.asiento.id,
          cuentaId: a.asiento.cuentaId,
          cuenta: a.asiento.cuenta?.nombre ?? null,
          periodo: a.asiento.periodo,
          estado: a.asiento.estado
        }
      : null
  }
  return salida
}

module.exports = {
  ESTADOS,
  MAX_DESCRIPCION,
  dinero,
  parsearFechaAnticipo,
  validarMetodoAnticipo,
  validarDatosAnticipo,
  saldoPendiente,
  estadoAnticipo,
  distribuirAnticipos,
  normalizarFiltroEstado,
  normalizarFiltroEmpleado,
  normalizarRango,
  anticipoParaCliente
}
