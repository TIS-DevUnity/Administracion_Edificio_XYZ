const { Decimal, errorHttp, parsearMonto } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')

const CAMPOS = ['nombres', 'apellidos', 'documento', 'cargo', 'fechaIngreso', 'telefono', 'sueldoBase']
const ESTADOS = ['ACTIVO', 'INACTIVO']
const ETIQUETA_ESTADO = { ACTIVO: 'Activo', INACTIVO: 'Inactivo' }

const MAX_NOMBRE = 80
const MAX_CARGO = 60
const MIN_DOCUMENTO = 3
const MAX_DOCUMENTO = 20
const MIN_DIGITOS_TELEFONO = 7
const MAX_TELEFONO = 20
const MAX_BUSQUEDA = 100
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const FORMATO_DOCUMENTO = /^[A-Z0-9.-]+(?: [A-Z0-9.-]+)*$/
const FORMATO_TELEFONO = /^[0-9+()\- ]+$/
const FECHA_MINIMA = '1900-01-01'

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')
}

/** Avisa de todos los campos faltantes de una vez, no de uno en uno. */
function exigirCampos(datos, campos) {
  const faltantes = campos.filter((campo) => vacio(datos[campo]))
  if (faltantes.length) {
    throw errorHttp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: faltantes }
    })
  }
}

/** Texto sin espacios al inicio ni al final y con los espacios internos reducidos a uno. */
function normalizarTexto(valor, campo, maximo) {
  if (typeof valor !== 'string') throw errorHttp(`${campo} debe ser un texto`, 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (!texto) throw errorHttp(`${campo} es requerido`, 400)
  if (texto.length > maximo) throw errorHttp(`${campo} no puede superar ${maximo} caracteres`, 400)
  return texto
}

/** Documento en mayusculas y sin espacios sobrantes: "1234567 lp" y "1234567  LP" son el mismo documento. */
function normalizarDocumento(valor) {
  if (typeof valor !== 'string') throw errorHttp('documento debe ser un texto', 400)
  const texto = valor.trim().replace(/\s+/g, ' ').toUpperCase()
  if (texto.length < MIN_DOCUMENTO || texto.length > MAX_DOCUMENTO) {
    throw errorHttp(`documento debe tener entre ${MIN_DOCUMENTO} y ${MAX_DOCUMENTO} caracteres`, 400)
  }
  if (!FORMATO_DOCUMENTO.test(texto)) {
    throw errorHttp('documento solo admite letras, numeros, guiones, puntos y espacios entre grupos', 400)
  }
  return texto
}

function normalizarTelefono(valor) {
  if (typeof valor !== 'string') throw errorHttp('telefono debe ser un texto', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  const digitos = texto.replace(/\D/g, '').length
  if (!texto || texto.length > MAX_TELEFONO || !FORMATO_TELEFONO.test(texto) || digitos < MIN_DIGITOS_TELEFONO) {
    throw errorHttp(
      `telefono no es valido: solo numeros, +, guiones, parentesis y espacios (minimo ${MIN_DIGITOS_TELEFONO} digitos, maximo ${MAX_TELEFONO} caracteres)`,
      400
    )
  }
  return texto
}

function errorFechaIngreso(mensaje) {
  return errorHttp(mensaje, 400, { codigo: 'FECHA_INGRESO_INVALIDA' })
}

/**
 * Fecha de ingreso YYYY-MM-DD. Se guarda como medianoche UTC: la columna es DATE y asi el dia no se
 * corre por la zona horaria. No puede ser futura (dia de hoy en hora de Bolivia, o `hoy` si se indica).
 */
function parsearFechaIngreso(valor, hoy = fechaEnZona()) {
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor.trim())) {
    throw errorFechaIngreso('fechaIngreso debe tener el formato YYYY-MM-DD')
  }
  const texto = valor.trim()
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorFechaIngreso('fechaIngreso no es una fecha valida')
  }
  if (texto < FECHA_MINIMA) throw errorFechaIngreso(`fechaIngreso no puede ser anterior a ${FECHA_MINIMA}`)
  if (texto > hoy) throw errorFechaIngreso('fechaIngreso no puede ser una fecha futura')
  return fecha
}

const NORMALIZADORES = {
  nombres: (v) => normalizarTexto(v, 'nombres', MAX_NOMBRE),
  apellidos: (v) => normalizarTexto(v, 'apellidos', MAX_NOMBRE),
  documento: normalizarDocumento,
  cargo: (v) => normalizarTexto(v, 'cargo', MAX_CARGO),
  fechaIngreso: (v, hoy) => parsearFechaIngreso(v, hoy),
  telefono: normalizarTelefono,
  sueldoBase: (v) => parsearMonto(v, 'sueldoBase')
}

/** Alta: los 7 campos son obligatorios. Devuelve los datos listos para guardar. */
function validarDatosAlta(datos = {}, hoy) {
  exigirCampos(datos, CAMPOS)
  return Object.fromEntries(CAMPOS.map((campo) => [campo, NORMALIZADORES[campo](datos[campo], hoy)]))
}

/**
 * Edicion: llega al menos uno de los 7 campos y cada uno enviado se valida como en el alta
 * (uno vacio es un error, no "sin cambio"). Devuelve solo los campos enviados.
 */
function validarDatosEdicion(datos = {}, hoy) {
  const enviados = CAMPOS.filter((campo) => datos[campo] !== undefined)
  if (enviados.length === 0) {
    throw errorHttp(`Envie al menos uno de: ${CAMPOS.join(', ')}`, 400, { codigo: 'SIN_CAMBIOS' })
  }
  exigirCampos(datos, enviados)
  return Object.fromEntries(enviados.map((campo) => [campo, NORMALIZADORES[campo](datos[campo], hoy)]))
}

/** Acepta ACTIVO o INACTIVO sin importar mayusculas. */
function normalizarEstado(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!ESTADOS.includes(texto)) {
    throw errorHttp(`estado debe ser uno de: ${ESTADOS.join(', ')}`, 400)
  }
  return texto
}

/** Filtro `estado` del listado: opcional. */
function normalizarFiltroEstado(valor) {
  return vacio(valor) ? null : normalizarEstado(valor)
}

/** Texto de busqueda `q` del listado: opcional. */
function normalizarBusqueda(valor) {
  if (vacio(valor)) return null
  if (typeof valor !== 'string') throw errorHttp('q debe ser un texto', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length > MAX_BUSQUEDA) throw errorHttp(`q no puede superar ${MAX_BUSQUEDA} caracteres`, 400)
  return texto
}

/** Un dia de calendario guardado como DATE, como YYYY-MM-DD. */
function fechaTexto(fecha) {
  return new Date(fecha).toISOString().slice(0, 10)
}

function dinero(valor) {
  return new Decimal(valor ?? 0).toFixed(2)
}

/** El empleado tal como se devuelve al cliente. */
function empleadoParaCliente(e) {
  return {
    id: e.id,
    nombres: e.nombres,
    apellidos: e.apellidos,
    documento: e.documento,
    cargo: e.cargo,
    fechaIngreso: fechaTexto(e.fechaIngreso),
    telefono: e.telefono,
    sueldoBase: dinero(e.sueldoBase),
    estado: e.estado,
    estadoEtiqueta: ETIQUETA_ESTADO[e.estado],
    createdAt: e.createdAt,
    updatedAt: e.updatedAt
  }
}

/** Valores de un empleado para la auditoria (montos y fechas como texto). */
function valoresAuditados(e) {
  return { ...empleadoParaCliente(e), createdAt: undefined, updatedAt: undefined, id: undefined, estadoEtiqueta: undefined }
}

/**
 * Cambios entre dos versiones del empleado, solo de los campos enviados que de verdad cambian:
 * { campo: { antes, despues } }. Incluye sueldoBase anterior y nuevo cuando cambia.
 */
function diferenciasEmpleado(antes, despues, campos) {
  const a = valoresAuditados(antes)
  const d = valoresAuditados(despues)
  const cambios = {}
  for (const campo of campos) {
    if (a[campo] !== d[campo]) cambios[campo] = { antes: a[campo], despues: d[campo] }
  }
  return cambios
}

module.exports = {
  CAMPOS,
  ESTADOS,
  ETIQUETA_ESTADO,
  normalizarTexto,
  normalizarDocumento,
  normalizarTelefono,
  parsearFechaIngreso,
  validarDatosAlta,
  validarDatosEdicion,
  normalizarEstado,
  normalizarFiltroEstado,
  normalizarBusqueda,
  fechaTexto,
  dinero,
  empleadoParaCliente,
  diferenciasEmpleado
}
