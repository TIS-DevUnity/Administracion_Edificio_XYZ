const { Prisma } = require('@prisma/client')
const {
  obtenerTransporter,
  variablesFaltantes,
  redireccionDeSeguridad,
  verificarConexion
} = require('../../../config/mailer')
const prisma = require('../../../config/prisma')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { pendientesDe } = require('../expensas/saldo.util')

const Decimal = Prisma.Decimal

// Correo con forma usuario@dominio.ext (no verifica que exista, solo que pueda ser valido).
const CORREO_VALIDO = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/**
 * Deja constancia de un aviso por correo (enviado, fallido u omitido). Registrar nunca debe
 * interrumpir el flujo principal: si no se puede guardar, solo se avisa en consola.
 */
async function registrarEnvio({ expensaId = null, tipo, destinatario = null, asunto, estado, motivo = null }) {
  try {
    await prisma.envioCorreo.create({
      data: { expensaId, tipo, destinatario, asunto, estado, motivo }
    })
  } catch (err) {
    console.error('[notificaciones] No se pudo registrar el envio de correo:', err.message)
  }
}

/**
 * Envia un correo y deja constancia del resultado. Nunca debe interrumpir el flujo principal
 * (generacion de expensas / aplicacion de mora): si no hay correo, no es valido, no hay SMTP
 * configurado o el envio falla, se registra el motivo y se continua.
 * Devuelve 'ENVIADO', 'FALLIDO' u 'OMITIDO'.
 */
async function enviarCorreo({ to, subject, html, expensaId = null, tipo = 'EXPENSA_GENERADA', nombreDestinatario = null }) {
  const contexto = { expensaId, tipo, asunto: subject }
  const quien = nombreDestinatario ?? 'El residente'

  if (typeof to !== 'string' || !to.trim()) {
    await registrarEnvio({ ...contexto, estado: 'OMITIDO', motivo: `${quien} no tiene correo registrado` })
    return 'OMITIDO'
  }
  const destinatario = to.trim()

  if (!CORREO_VALIDO.test(destinatario)) {
    await registrarEnvio({ ...contexto, destinatario, estado: 'FALLIDO', motivo: `El correo "${destinatario}" de ${quien} no es valido` })
    return 'FALLIDO'
  }

  const transporter = obtenerTransporter()
  if (!transporter) {
    console.warn(`[notificaciones] SMTP no configurado, se omite envio a ${destinatario}: ${subject}`)
    await registrarEnvio({ ...contexto, destinatario, estado: 'OMITIDO', motivo: 'El servicio de correo (SMTP) no esta configurado' })
    return 'OMITIDO'
  }

  // Fuera de produccion nunca se escribe a los residentes reales (la base de datos es compartida):
  // todo va a SMTP_REDIRIGIR_A y, sin esa variable, no se envia nada. En el registro queda siempre
  // el destinatario real, para poder revisarlo o reenviarlo despues.
  const redireccion = redireccionDeSeguridad()
  if (redireccion && !redireccion.destino) {
    await registrarEnvio({
      ...contexto,
      destinatario,
      estado: 'OMITIDO',
      motivo: 'Fuera de produccion (NODE_ENV distinto de production) y sin SMTP_REDIRIGIR_A: no se envian correos a residentes reales'
    })
    return 'OMITIDO'
  }
  if (redireccion && !CORREO_VALIDO.test(redireccion.destino)) {
    await registrarEnvio({
      ...contexto,
      destinatario,
      estado: 'OMITIDO',
      motivo: 'SMTP_REDIRIGIR_A no es un correo valido: no se envio el aviso'
    })
    return 'OMITIDO'
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: redireccion ? redireccion.destino : destinatario,
      subject: redireccion ? `[PRUEBA - para ${destinatario}] ${subject}` : subject,
      html
    })
    await registrarEnvio({
      ...contexto,
      destinatario,
      estado: 'ENVIADO',
      motivo: redireccion ? 'Fuera de produccion: redirigido a la bandeja de pruebas' : null
    })
    return 'ENVIADO'
  } catch (err) {
    console.error(`[notificaciones] No se pudo enviar correo a ${destinatario}:`, err.message)
    await registrarEnvio({ ...contexto, destinatario, estado: 'FALLIDO', motivo: `No se pudo enviar: ${err.message}` })
    return 'FALLIDO'
  }
}

/** Personas con ocupacion vigente de un inmueble (propietario primero), sin repetir. */
async function obtenerOcupantes(inmuebleId) {
  const ocupantes = await prisma.ocupanteInmueble.findMany({
    where: { inmuebleId, ...filtroOcupanteVigente() },
    include: { copropietario: { select: { id: true, nombre: true, apellido: true, email: true } } },
    orderBy: [{ esPropietario: 'desc' }, { fechaInicio: 'asc' }]
  })
  const vistos = new Set()
  return ocupantes
    .map((o) => o.copropietario)
    .filter((c) => (vistos.has(c.id) ? false : vistos.add(c.id)))
}

/**
 * Obtiene los correos de los ocupantes actualmente activos de un inmueble, sin duplicados.
 */
async function obtenerDestinatariosInmueble(inmuebleId) {
  const ocupantes = await obtenerOcupantes(inmuebleId)
  return [...new Set(ocupantes.map((c) => c.email).filter(Boolean))]
}

/**
 * Envia el aviso a cada ocupante vigente y deja constancia de cada intento. Si nadie puede recibirlo
 * la expensa igual existe: solo queda registrado el inconveniente. Devuelve cuantos correos
 * se enviaron, fallaron o se omitieron.
 */
async function enviarAvisoAOcupantes({ expensa, tipo, subject, html }) {
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0 }
  const cuenta = (resultado) => {
    if (resultado === 'ENVIADO') resumen.enviados += 1
    else if (resultado === 'FALLIDO') resumen.fallidos += 1
    else resumen.omitidos += 1
  }

  const ocupantes = await obtenerOcupantes(expensa.inmuebleId)
  if (ocupantes.length === 0) {
    await registrarEnvio({
      expensaId: expensa.id,
      tipo,
      asunto: subject,
      estado: 'OMITIDO',
      motivo: 'El inmueble no tiene ocupantes vigentes a quienes avisar'
    })
    resumen.omitidos += 1
    return resumen
  }

  const yaEnviados = new Set()
  for (const persona of ocupantes) {
    const correo = typeof persona.email === 'string' ? persona.email.trim().toLowerCase() : ''
    // Si propietario e inquilino comparten correo, se avisa una sola vez.
    if (correo && yaEnviados.has(correo)) continue
    if (correo) yaEnviados.add(correo)
    cuenta(
      await enviarCorreo({
        to: persona.email,
        subject,
        html,
        expensaId: expensa.id,
        tipo,
        nombreDestinatario: `${persona.nombre} ${persona.apellido}`
      })
    )
  }
  return resumen
}

async function notificarExpensaGenerada(expensa) {
  const codigo = expensa.inmueble?.codigo || expensa.inmuebleId
  const tipo = expensa.tipoNombre ? ` (tipo ${expensa.tipoNombre})` : ''

  // Con baulera o parqueo a su cargo se detalla cada concepto; si solo hay departamento, no.
  const detalleCargos =
    (expensa.cargos || []).length > 1
      ? `<ul>${expensa.cargos
          .map(
            (cargo) =>
              `<li>${cargo.clase === 'DEPARTAMENTO' ? 'Departamento' : cargo.clase === 'PARQUEO' ? 'Parqueo' : 'Baulera'} ${cargo.codigo}: <strong>${new Decimal(cargo.monto).toFixed(2)}</strong></li>`
          )
          .join('')}</ul>`
      : ''

  const html = `
    <p>Se genero la expensa del periodo <strong>${expensa.periodo}</strong> para el inmueble <strong>${codigo}</strong>${tipo}.</p>
    <p>Expensa fija: <strong>${new Decimal(expensa.montoBase).toFixed(2)}</strong></p>
    ${detalleCargos}
    <p>Total a la fecha: <strong>${new Decimal(expensa.montoTotal).toFixed(2)}</strong> (el importe del agua se suma despues, cuando la administracion lo registra)</p>
    <p>Fecha limite de pago: <strong>${new Date(expensa.fechaVencimiento).toLocaleDateString('es-BO', { timeZone: 'UTC' })}</strong></p>
  `

  return enviarAvisoAOcupantes({
    expensa,
    tipo: 'EXPENSA_GENERADA',
    subject: `Nueva expensa generada - ${expensa.periodo}`,
    html
  })
}

async function notificarMoraAplicada(expensa) {
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

  return enviarAvisoAOcupantes({
    expensa,
    tipo: 'MORA_APLICADA',
    subject: `Mora aplicada - expensa ${expensa.periodo}`,
    html
  })
}

const ESTADOS_ENVIO = ['ENVIADO', 'FALLIDO', 'OMITIDO']

/** Registro de avisos por correo (para revisar los que no se pudieron enviar). Mas recientes primero. */
async function listarEnvios({ estado, expensaId, pagina, porPagina } = {}) {
  if (estado !== undefined && estado !== '' && !ESTADOS_ENVIO.includes(estado)) {
    const error = new Error(`estado invalido. Valores permitidos: ${ESTADOS_ENVIO.join(', ')}`)
    error.status = 400
    throw error
  }
  const where = {
    ...(estado ? { estado } : {}),
    ...(expensaId ? { expensaId } : {})
  }
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(200, Math.max(1, Number.parseInt(porPagina, 10) || 50))

  const [envios, total] = await Promise.all([
    prisma.envioCorreo.findMany({
      where,
      include: { expensa: { select: { periodo: true, inmueble: { select: { codigo: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.envioCorreo.count({ where })
  ])

  return {
    envios: envios.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      estado: e.estado,
      destinatario: e.destinatario,
      asunto: e.asunto,
      motivo: e.motivo,
      expensaId: e.expensaId,
      periodo: e.expensa?.periodo ?? null,
      inmueble: e.expensa?.inmueble?.codigo ?? null,
      createdAt: e.createdAt
    })),
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

/**
 * Estado del servicio de correo, sin exponer valores de las variables:
 *  - configurado / faltan: si estan las variables SMTP obligatorias (y los nombres de las que faltan).
 *  - modo: PRODUCCION (se escribe a los residentes), REDIRIGIDO (todo va a SMTP_REDIRIGIR_A) o
 *    BLOQUEADO (fuera de produccion sin SMTP_REDIRIGIR_A: no se envia nada).
 *  - con `verificar`, ademas prueba la conexion con el servidor SMTP sin enviar ningun correo.
 */
async function estadoCorreo({ verificar = false } = {}) {
  const faltan = variablesFaltantes()
  const redireccion = redireccionDeSeguridad()
  let modo = 'PRODUCCION'
  if (redireccion) modo = redireccion.destino ? 'REDIRIGIDO' : 'BLOQUEADO'

  const estado = { configurado: faltan.length === 0, faltan, modo }
  if (verificar) Object.assign(estado, await verificarConexion())
  return estado
}

module.exports = {
  enviarCorreo,
  obtenerOcupantes,
  obtenerDestinatariosInmueble,
  notificarExpensaGenerada,
  notificarMoraAplicada,
  listarEnvios,
  estadoCorreo
}
