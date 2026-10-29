const nodemailer = require('nodemailer')

const VARIABLES_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']

// Un servidor de correo que no responde no debe dejar colgada la peticion que envia el aviso.
const TIMEOUT_CONEXION_MS = 10000
const TIMEOUT_SALUDO_MS = 10000
const TIMEOUT_SOCKET_MS = 15000

let transporter = null

/** Nombres (nunca valores) de las variables SMTP obligatorias que faltan. */
function variablesFaltantes() {
  return VARIABLES_SMTP.filter((nombre) => !process.env[nombre])
}

/**
 * Crea (una sola vez) el transporte SMTP a partir de las variables de entorno.
 * Si no hay configuracion de correo, devuelve null y el llamador debe manejarlo
 * sin interrumpir el flujo principal (igual que el registro de auditoria).
 */
function obtenerTransporter() {
  if (transporter) return transporter

  if (variablesFaltantes().length > 0) {
    return null
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: TIMEOUT_CONEXION_MS,
    greetingTimeout: TIMEOUT_SALUDO_MS,
    socketTimeout: TIMEOUT_SOCKET_MS
  })

  return transporter
}

/**
 * Redireccion de seguridad de los correos. La base de datos es compartida y tiene correos de
 * residentes, asi que solo en produccion (NODE_ENV=production) se les escribe directamente.
 * En cualquier otro entorno (development, test, vacio o sin definir):
 *  - { destino: 'x@y.z' }: todo se envia a SMTP_REDIRIGIR_A.
 *  - { destino: null }: falta SMTP_REDIRIGIR_A, no se envia nada.
 * Devuelve null en produccion: se envia al destinatario real.
 */
function redireccionDeSeguridad() {
  if (process.env.NODE_ENV === 'production') return null
  const destino = (process.env.SMTP_REDIRIGIR_A || '').trim()
  return { destino: destino || null }
}

/**
 * Comprueba la conexion y la autenticacion con el servidor SMTP sin enviar ningun correo
 * (`transporter.verify()`). Nunca devuelve credenciales, solo el resultado y el motivo.
 */
async function verificarConexion() {
  const transporte = obtenerTransporter()
  if (!transporte) {
    return { conexion: 'ERROR', motivo: 'El servicio de correo (SMTP) no esta configurado' }
  }
  try {
    await transporte.verify()
    return { conexion: 'OK' }
  } catch (err) {
    return { conexion: 'ERROR', motivo: err.message }
  }
}

module.exports = { obtenerTransporter, variablesFaltantes, redireccionDeSeguridad, verificarConexion }
