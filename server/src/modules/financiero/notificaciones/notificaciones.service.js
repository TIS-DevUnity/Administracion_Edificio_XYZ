const { Prisma } = require('@prisma/client')
const { obtenerTransporter } = require('../../../config/mailer')
const prisma = require('../../../config/prisma')
const { pendientesDe } = require('../expensas/saldo.util')

const Decimal = Prisma.Decimal

/**
 * Envia un correo. Nunca debe interrumpir el flujo principal (generacion de
 * expensas / aplicacion de mora): si falla o no hay SMTP configurado, se
 * registra en consola y se continua, igual que registrarAuditoria.
 */
async function enviarCorreo({ to, subject, html }) {
  if (!to) return

  const transporter = obtenerTransporter()
  if (!transporter) {
    console.warn(`[notificaciones] SMTP no configurado, se omite envio a ${to}: ${subject}`)
    return
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html
    })
  } catch (err) {
    console.error(`[notificaciones] No se pudo enviar correo a ${to}:`, err.message)
  }
}

/**
 * Obtiene los correos de los ocupantes actualmente activos (fechaFin null)
 * de un inmueble, sin duplicados.
 */
async function obtenerDestinatariosInmueble(inmuebleId) {
  const ocupantes = await prisma.ocupanteInmueble.findMany({
    where: { inmuebleId, fechaFin: null },
    include: { copropietario: true }
  })

  const correos = ocupantes.map((o) => o.copropietario?.email).filter(Boolean)

  return [...new Set(correos)]
}

async function notificarExpensaGenerada(expensa) {
  const destinatarios = await obtenerDestinatariosInmueble(expensa.inmuebleId)
  const codigo = expensa.inmueble?.codigo || expensa.inmuebleId
  const tipo = expensa.tipoNombre ? ` (tipo ${expensa.tipoNombre})` : ''

  const html = `
    <p>Se genero la expensa del periodo <strong>${expensa.periodo}</strong> para el inmueble <strong>${codigo}</strong>${tipo}.</p>
    <p>Expensa fija: <strong>${new Decimal(expensa.montoBase).toFixed(2)}</strong></p>
    <p>Total a la fecha: <strong>${new Decimal(expensa.montoTotal).toFixed(2)}</strong> (el agua se suma cuando llega la factura del mes)</p>
    <p>Fecha de vencimiento: <strong>${new Date(expensa.fechaVencimiento).toLocaleDateString('es-BO', { timeZone: 'UTC' })}</strong></p>
  `

  await Promise.all(
    destinatarios.map((to) =>
      enviarCorreo({ to, subject: `Nueva expensa generada - ${expensa.periodo}`, html })
    )
  )
}

async function notificarMoraAplicada(expensa) {
  const destinatarios = await obtenerDestinatariosInmueble(expensa.inmuebleId)
  const codigo = expensa.inmueble?.codigo || expensa.inmuebleId

  // Saldo real: lo que falta pagar de la expensa y de la mora.
  const pendientes = pendientesDe(expensa)
  const ultima = (expensa.moras || [])[expensa.moras.length - 1]
  const detalleUltima = ultima
    ? `<p>Mora de ${ultima.mes}: <strong>${new Decimal(ultima.monto).toFixed(2)}</strong> (sobre ${new Decimal(ultima.base).toFixed(2)} pendientes)</p>`
    : ''

  const html = `
    <p>La expensa del periodo <strong>${expensa.periodo}</strong> del inmueble <strong>${codigo}</strong> esta vencida y se le aplico un recargo por mora.</p>
    ${detalleUltima}
    <p>Mora acumulada: <strong>${new Decimal(expensa.montoMora).toFixed(2)}</strong></p>
    <p>Saldo pendiente: <strong>${pendientes.total.toFixed(2)}</strong></p>
  `

  await Promise.all(
    destinatarios.map((to) =>
      enviarCorreo({ to, subject: `Mora aplicada - expensa ${expensa.periodo}`, html })
    )
  )
}

module.exports = {
  enviarCorreo,
  obtenerDestinatariosInmueble,
  notificarExpensaGenerada,
  notificarMoraAplicada
}
