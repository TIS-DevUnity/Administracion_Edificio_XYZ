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

// Correo con forma usuario@dominio.ext (no verifica que exista, solo que pueda ser valido).
const CORREO_VALIDO = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** Correos de CORREOS_DE_PRUEBA_PERMITIDOS (separados por comas), en minusculas y sin espacios. */
function correosDePruebaPermitidos(env = process.env) {
  return (env.CORREOS_DE_PRUEBA_PERMITIDOS || '')
    .split(',')
    .map((correo) => correo.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * A donde sale de verdad un correo dirigido a `destinatario` (ya validado):
 *  - Produccion: al destinatario, sin cambios.
 *  - Fuera de produccion, destinatario en CORREOS_DE_PRUEBA_PERMITIDOS: a su correo real.
 *  - Fuera de produccion, cualquier otro: a SMTP_REDIRIGIR_A (con el real en el asunto) o, sin esa
 *    variable (o si no es un correo valido), no se envia.
 * Devuelve { enviar: true, to, prefijoAsunto, destinoReal } o { enviar: false, motivo }.
 * `destinoReal` solo se informa cuando el envio no fue directo (redirigido o permitido por lista de pruebas).
 */
function decidirDestino(destinatario, env = process.env) {
  if (env.NODE_ENV === 'production') {
    return { enviar: true, to: destinatario, prefijoAsunto: '', destinoReal: null }
  }

  if (correosDePruebaPermitidos(env).includes(destinatario.toLowerCase())) {
    return { enviar: true, to: destinatario, prefijoAsunto: '', destinoReal: destinatario }
  }

  const redirigirA = (env.SMTP_REDIRIGIR_A || '').trim()
  if (!redirigirA) {
    return {
      enviar: false,
      motivo: 'Fuera de produccion (NODE_ENV distinto de production), sin SMTP_REDIRIGIR_A y el correo no esta en CORREOS_DE_PRUEBA_PERMITIDOS: no se envian correos a residentes reales'
    }
  }
  if (!CORREO_VALIDO.test(redirigirA)) {
    return { enviar: false, motivo: 'SMTP_REDIRIGIR_A no es un correo valido: no se envio el correo' }
  }
  return { enviar: true, to: redirigirA, prefijoAsunto: `[PRUEBA - para ${destinatario}] `, destinoReal: redirigirA }
}

/**
 * Envio de bajo nivel de un correo: valida el correo, aplica la redireccion de seguridad (decidirDestino) y
 * usa el transporte SMTP. No registra nada ni lanza errores: quien la llama guarda el resultado.
 * Devuelve { estado: 'ENVIADO' | 'FALLIDO' | 'OMITIDO', motivo, destinatario, destinoReal }:
 *  - OMITIDO: no se intento (sin correo, correo no valido, SMTP sin configurar, bloqueado fuera de produccion).
 *  - FALLIDO: se intento y el servidor de correo respondio con error.
 * `destinatario` es el correo al que iba dirigido; `destinoReal` donde se entrego si fue redirigido o permitido
 * por lista de pruebas (null en produccion).
 * `deps` permite inyectar el transporte y el entorno (pruebas).
 */
async function enviarMensaje({ to, subject, html, text }, deps = {}) {
  const env = deps.env ?? process.env
  const resultado = (estado, motivo = null, destinatario = null, destinoReal = null) => ({
    estado,
    motivo,
    destinatario,
    destinoReal
  })

  if (typeof to !== 'string' || !to.trim()) {
    return resultado('OMITIDO', 'El destinatario no tiene correo registrado')
  }
  const destinatario = to.trim()

  if (!CORREO_VALIDO.test(destinatario)) {
    return resultado('OMITIDO', `El correo "${destinatario}" no es valido`, destinatario)
  }

  const transporte = deps.transporte !== undefined ? deps.transporte : obtenerTransporter()
  if (!transporte) {
    return resultado('OMITIDO', 'El servicio de correo (SMTP) no esta configurado', destinatario)
  }

  const destino = decidirDestino(destinatario, env)
  if (!destino.enviar) return resultado('OMITIDO', destino.motivo, destinatario)

  try {
    await transporte.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: destino.to,
      subject: `${destino.prefijoAsunto}${subject}`,
      html,
      ...(text ? { text } : {})
    })
    return resultado(
      'ENVIADO',
      destino.destinoReal && destino.to !== destinatario ? 'Fuera de produccion: redirigido a la bandeja de pruebas' : null,
      destinatario,
      destino.destinoReal
    )
  } catch (err) {
    return resultado('FALLIDO', `No se pudo enviar: ${err.message}`, destinatario, destino.destinoReal)
  }
}

module.exports = {
  obtenerTransporter,
  variablesFaltantes,
  redireccionDeSeguridad,
  verificarConexion,
  CORREO_VALIDO,
  correosDePruebaPermitidos,
  decidirDestino,
  enviarMensaje
}
