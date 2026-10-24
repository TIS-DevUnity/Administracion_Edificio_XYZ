const { Decimal, errorHttp } = require('../expensas/saldo.util')

const TIPOS_CUENTA = ['CAJA', 'BANCO']
const ETIQUETA_TIPO = { CAJA: 'Caja', BANCO: 'Banco' }

// Donde entra el dinero de cada metodo de pago: el efectivo va a la caja y el resto al banco.
// SALDO_A_FAVOR no esta aqui a proposito: no es dinero nuevo y no genera movimiento de caja.
const TIPO_CUENTA_POR_METODO = {
  EFECTIVO: 'CAJA',
  TRANSFERENCIA: 'BANCO',
  TARJETA: 'BANCO',
  CHEQUE: 'BANCO'
}

// Datos de marcador con los que la migracion crea el "Banco principal": el Administrador los reemplaza.
const BANCO_MARCADOR = 'POR DEFINIR'
const PREFIJO_NUMERO_MARCADOR = 'POR-DEFINIR'

const MIN_NOMBRE = 2
const MAX_NOMBRE = 60
const MAX_BANCO = 60
const MIN_NUMERO_CUENTA = 3
const MAX_NUMERO_CUENTA = 40
// Letras, numeros, guiones y puntos; espacios solo entre grupos (nunca al inicio, al final ni dobles).
const FORMATO_NUMERO_CUENTA = /^[A-Za-z0-9.-]+(?: [A-Za-z0-9.-]+)*$/
const SALDO_INICIAL_MAXIMO = new Decimal('9999999999.99') // limite de DECIMAL(12,2)

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

/** Acepta CAJA o BANCO (sin importar mayusculas) y devuelve el valor de la base. */
function normalizarTipo(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!TIPOS_CUENTA.includes(texto)) {
    throw errorHttp(`tipo debe ser uno de: ${TIPOS_CUENTA.join(', ')}`, 400)
  }
  return texto
}

function normalizarNombre(valor) {
  if (typeof valor !== 'string') throw errorHttp('nombre es requerido', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length < MIN_NOMBRE) throw errorHttp(`nombre debe tener al menos ${MIN_NOMBRE} caracteres`, 400)
  if (texto.length > MAX_NOMBRE) throw errorHttp(`nombre no puede superar ${MAX_NOMBRE} caracteres`, 400)
  return texto
}

/** Nombre del banco. Un texto vacio es null; el valor de marcador no se puede escribir a mano. */
function normalizarBanco(valor) {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw errorHttp('banco debe ser un texto', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (!texto) return null
  if (texto.length > MAX_BANCO) throw errorHttp(`banco no puede superar ${MAX_BANCO} caracteres`, 400)
  if (texto.toUpperCase() === BANCO_MARCADOR) {
    throw errorHttp(`banco no puede ser "${BANCO_MARCADOR}": indique el nombre real del banco`, 400)
  }
  return texto
}

function normalizarNumeroCuenta(valor) {
  if (typeof valor !== 'string') throw errorHttp('numeroCuenta es requerido', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length < MIN_NUMERO_CUENTA || texto.length > MAX_NUMERO_CUENTA) {
    throw errorHttp(`numeroCuenta debe tener entre ${MIN_NUMERO_CUENTA} y ${MAX_NUMERO_CUENTA} caracteres`, 400)
  }
  if (!FORMATO_NUMERO_CUENTA.test(texto)) {
    throw errorHttp('numeroCuenta solo admite letras, numeros, guiones, puntos y espacios entre grupos', 400)
  }
  if (texto.toUpperCase().startsWith(PREFIJO_NUMERO_MARCADOR)) {
    throw errorHttp(`numeroCuenta no puede empezar con ${PREFIJO_NUMERO_MARCADOR}: indique el numero real`, 400)
  }
  return texto
}

/**
 * Saldo con el que arranca una cuenta. A diferencia de un pago, puede ser cero o negativo
 * (sobregiro); admite hasta 2 decimales y el maximo de DECIMAL(12,2).
 */
function parsearSaldoInicial(valor) {
  if (valor === undefined || valor === null || valor === '' || typeof valor === 'boolean') {
    throw errorHttp('saldoInicial es requerido', 400)
  }
  let saldo
  try {
    saldo = new Decimal(valor)
  } catch {
    throw errorHttp('saldoInicial debe ser un numero', 400)
  }
  if (!saldo.isFinite()) throw errorHttp('saldoInicial debe ser un numero', 400)
  if (saldo.decimalPlaces() > 2) throw errorHttp('saldoInicial admite como maximo 2 decimales', 400)
  if (saldo.abs().gt(SALDO_INICIAL_MAXIMO)) throw errorHttp('saldoInicial supera el maximo permitido', 400)
  return saldo.isZero() ? new Decimal(0) : saldo // evita "-0.00"
}

/** Texto con 2 decimales (como se devuelve al cliente). */
function dinero(valor) {
  return new Decimal(valor ?? 0).toFixed(2)
}

/** Tipo de cuenta que recibe un metodo de pago: EFECTIVO -> CAJA; el resto -> BANCO. */
function tipoDeCuentaPara(metodoPago) {
  const tipo = TIPO_CUENTA_POR_METODO[metodoPago]
  if (!tipo) {
    throw errorHttp(`El metodo de pago ${metodoPago} no genera movimiento de caja ni de banco`, 400)
  }
  return tipo
}

/** La cuenta todavia tiene los datos de marcador de la migracion (falta que el Administrador los complete). */
function esMarcador(cuenta) {
  return (
    String(cuenta.banco ?? '').toUpperCase() === BANCO_MARCADOR ||
    String(cuenta.numeroCuenta ?? '').toUpperCase().startsWith(PREFIJO_NUMERO_MARCADOR)
  )
}

/**
 * Cuenta por defecto (activa) de un tipo. La usa crearRecibo y el alta de movimientos cuando el
 * cliente no indica `cuentaId`. `db` es prisma o una transaccion. Solo lee, sin bloquear: un cobro
 * que corre mientras se cambia la cuenta por defecto cae en una cuenta igualmente valida.
 */
async function cuentaPorDefecto(tipo, db) {
  if (!TIPOS_CUENTA.includes(tipo)) throw new Error(`Tipo de cuenta invalido: ${tipo}`)

  const cuentas = await db.cuentaBancaria.findMany({
    where: { tipo, esPorDefecto: true, activa: true },
    orderBy: { createdAt: 'asc' },
    take: 2
  })
  if (cuentas.length === 0) {
    const destino = tipo === 'CAJA' ? 'la caja' : 'el banco'
    throw errorHttp(
      `No hay una cuenta activa por defecto para ${destino}: configurela en caja y bancos antes de registrar el movimiento`,
      409,
      { codigo: 'CUENTA_POR_DEFECTO_FALTANTE', detalle: { tipo } }
    )
  }
  if (cuentas.length > 1) {
    // No deberia pasar (la aplicacion lo impide); se usa la mas antigua para no frenar un cobro.
    console.warn(`[caja-bancos] Hay mas de una cuenta ${tipo} por defecto; se usa la mas antigua (${cuentas[0].id})`)
  }
  return cuentas[0]
}

module.exports = {
  TIPOS_CUENTA,
  ETIQUETA_TIPO,
  vacio,
  exigirCampos,
  normalizarTipo,
  normalizarNombre,
  normalizarBanco,
  normalizarNumeroCuenta,
  parsearSaldoInicial,
  dinero,
  tipoDeCuentaPara,
  esMarcador,
  cuentaPorDefecto
}
