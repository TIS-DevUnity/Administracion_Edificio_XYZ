const nodemailer = require('nodemailer')

let transporter = null

/**
 * Crea (una sola vez) el transporte SMTP a partir de las variables de entorno.
 * Si no hay configuracion de correo, devuelve null y el llamador debe manejarlo
 * sin interrumpir el flujo principal (igual que el registro de auditoria).
 */
function obtenerTransporter() {
  if (transporter) return transporter

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  })

  return transporter
}

module.exports = { obtenerTransporter }
