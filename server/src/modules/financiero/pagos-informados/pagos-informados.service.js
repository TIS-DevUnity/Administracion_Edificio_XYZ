const crypto = require('crypto')
const prisma = require('../../../config/prisma')
const { supabase, STORAGE_BUCKET } = require('../../../config/supabase')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  normalizarClaveSolicitud,
  parsearFechaPago
} = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')
const {
  MENSAJE_FORMATOS,
  MAX_COMPROBANTE_BYTES,
  SEGUNDOS_ENLACE,
  detectarFormato,
  nombreSeguro
} = require('../recibos/recibos.service')
const cuentaInmueble = require('../cuenta-inmueble/cuenta-inmueble.service')

/**
 * Pago informado: el copropietario (rol CONSULTA) avisa que pago una expensa fuera del sistema y,
 * si quiere, adjunta la foto del comprobante. No cobra nada por si solo: queda PENDIENTE hasta que
 * el administrador lo comprueba. Al confirmarlo se registra el pago de siempre (con su recibo) y se
 * descuenta de la deuda; al rechazarlo queda el motivo.
 */

const CARPETA_COMPROBANTES = 'comprobantes-pagos-informados'
const ESTADOS_VALIDOS = ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO']
const MAX_LARGO_MOTIVO = 500
const MAXIMO_LISTADO = 200

const INCLUIR = {
  inmueble: { select: { id: true, codigo: true } },
  copropietario: { select: { id: true, nombre: true, apellido: true } }
}

function presentar(pago) {
  return {
    id: pago.id,
    estado: pago.estado,
    inmueble: pago.inmueble ?? { id: pago.inmuebleId },
    copropietario: pago.copropietario ?? { id: pago.copropietarioId },
    monto: new Decimal(pago.monto).toFixed(2),
    metodoPago: pago.metodoPago,
    referencia: pago.referencia,
    fechaPago: pago.fechaPago.toISOString().slice(0, 10),
    tieneComprobante: Boolean(pago.comprobantePath),
    comprobanteNombre: pago.comprobanteNombre,
    motivoRechazo: pago.motivoRechazo,
    reciboId: pago.reciboId,
    revisadoEn: pago.revisadoEn,
    createdAt: pago.createdAt
  }
}

async function buscar(id) {
  const pago = await prisma.pagoInformado.findUnique({ where: { id }, include: INCLUIR })
  if (!pago) throw errorHttp('Pago informado no encontrado', 404)
  return pago
}

/** El rol CONSULTA solo ve los pagos de sus inmuebles (`inmuebleIds`); los demas roles, todos. */
function exigirPropio(pago, inmuebleIds) {
  if (inmuebleIds && !inmuebleIds.includes(pago.inmuebleId)) {
    throw errorHttp('Solo puede consultar su propia informacion', 403, { codigo: 'SOLO_INFORMACION_PROPIA' })
  }
}

async function subirComprobante(archivo) {
  if (archivo.size > MAX_COMPROBANTE_BYTES) throw errorHttp(MENSAJE_FORMATOS, 400)
  const formato = detectarFormato(archivo.buffer)
  if (!formato) throw errorHttp(MENSAJE_FORMATOS, 400)

  const nombre = `${nombreSeguro(archivo.originalname).replace(/\.[^.]*$/, '')}.${formato.extension}`
  const comprobantePath = `${CARPETA_COMPROBANTES}/${crypto.randomUUID()}-${nombre}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(comprobantePath, archivo.buffer, { contentType: formato.mime, upsert: false })
  if (error) throw errorHttp(`No se pudo subir el comprobante: ${error.message}`, 502)

  return { comprobantePath, comprobanteMime: formato.mime, comprobanteNombre: nombre }
}

/**
 * Registra el aviso de pago de un copropietario. `inmueblesPermitidos` son los inmuebles que ocupa:
 * solo puede informar pagos de esos. Con la misma `claveSolicitud` un reenvio no crea otro aviso.
 */
async function informar({
  copropietarioId,
  inmueblesPermitidos,
  inmuebleId,
  monto,
  metodoPago,
  referencia,
  fechaPago,
  archivo,
  claveSolicitud,
  usuarioId,
  ip
}) {
  if (!inmuebleId || typeof inmuebleId !== 'string') throw errorHttp('inmuebleId es requerido', 400)
  const montoInformado = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const dia = fechaEnZona(parsearFechaPago(fechaPago, { obligatoria: true }))
  const clave = normalizarClaveSolicitud(claveSolicitud)

  if (clave) {
    const existente = await prisma.pagoInformado.findUnique({ where: { claveSolicitud: clave }, include: INCLUIR })
    if (existente) {
      return { duplicado: true, pago: presentar(existente), mensaje: 'Este pago ya estaba informado: no se registro de nuevo' }
    }
  }

  if (!inmueblesPermitidos.includes(inmuebleId)) {
    throw errorHttp('Solo puede informar pagos de sus propios inmuebles', 403, { codigo: 'SOLO_INFORMACION_PROPIA' })
  }
  const inmueble = await prisma.inmueble.findUnique({
    where: { id: inmuebleId },
    select: { id: true, codigo: true, clase: true, activo: true }
  })
  if (!inmueble) throw errorHttp('Inmueble no encontrado', 404)
  if (inmueble.clase !== 'DEPARTAMENTO') {
    throw errorHttp('Las expensas se pagan en el departamento: elija el departamento', 409, { codigo: 'SOLO_DEPARTAMENTO' })
  }
  if (!inmueble.activo) throw errorHttp(`El inmueble ${inmueble.codigo} esta inactivo`, 409, { codigo: 'INMUEBLE_INACTIVO' })

  const comprobante = archivo ? await subirComprobante(archivo) : {}

  let pago
  try {
    pago = await prisma.pagoInformado.create({
      data: {
        inmuebleId,
        copropietarioId,
        monto: montoInformado,
        metodoPago,
        referencia: referenciaLimpia,
        fechaPago: new Date(`${dia}T00:00:00Z`),
        claveSolicitud: clave,
        ...comprobante
      },
      include: INCLUIR
    })
  } catch (err) {
    if (comprobante.comprobantePath) await supabase.storage.from(STORAGE_BUCKET).remove([comprobante.comprobantePath])
    // Dos solicitudes con la misma clave llegaron a la vez: gana la primera.
    if (err.code === 'P2002' && clave) {
      const yaCreado = await prisma.pagoInformado.findUnique({ where: { claveSolicitud: clave }, include: INCLUIR })
      if (yaCreado) {
        return { duplicado: true, pago: presentar(yaCreado), mensaje: 'Este pago ya estaba informado: no se registro de nuevo' }
      }
    }
    throw err
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'PagoInformado',
    entidadId: pago.id,
    detalle: {
      inmueble: inmueble.codigo,
      monto: montoInformado.toFixed(2),
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: dia,
      comprobante: comprobante.comprobanteNombre ?? null
    },
    ip
  })

  return { pago: presentar(pago), mensaje: 'Pago informado: el administrador lo revisara y lo confirmara' }
}

/** Lista de avisos de pago, mas recientes primero. `inmuebleIds` limita la lista (rol CONSULTA). */
async function listar({ estado, inmuebleId, inmuebleIds } = {}) {
  if (estado !== undefined && estado !== '' && !ESTADOS_VALIDOS.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400)
  }
  const filtroInmueble = inmuebleIds
    ? { inmuebleId: { in: inmuebleId ? inmuebleIds.filter((id) => id === inmuebleId) : inmuebleIds } }
    : inmuebleId
      ? { inmuebleId }
      : {}

  const pagos = await prisma.pagoInformado.findMany({
    where: { ...filtroInmueble, ...(estado ? { estado } : {}) },
    include: INCLUIR,
    orderBy: { createdAt: 'desc' },
    take: MAXIMO_LISTADO
  })
  return { pagos: pagos.map(presentar) }
}

async function obtener(id, { inmuebleIds } = {}) {
  const pago = await buscar(id)
  exigirPropio(pago, inmuebleIds)
  return { pago: presentar(pago) }
}

/** Enlace temporal (5 minutos) para ver la foto del comprobante. */
async function obtenerEnlaceComprobante(id, { inmuebleIds } = {}) {
  const pago = await buscar(id)
  exigirPropio(pago, inmuebleIds)
  if (!pago.comprobantePath) throw errorHttp('El pago informado no tiene comprobante adjunto', 404)

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(pago.comprobantePath, SEGUNDOS_ENLACE)
  if (error) throw errorHttp(`No se pudo generar el enlace del comprobante: ${error.message}`, 502)

  return { nombre: pago.comprobanteNombre, mimeType: pago.comprobanteMime, url: data.signedUrl, venceEnSegundos: SEGUNDOS_ENLACE }
}

/**
 * El administrador comprobo el dinero: se registra el pago normal del inmueble (recibo, orden de
 * meses, mora primero...) y el aviso queda CONFIRMADO con su recibo. Si el pago normal no se puede
 * registrar (por ejemplo un mes atrasado que se debe pagar completo), el aviso sigue PENDIENTE.
 */
async function confirmar(id, { cuentaId, usuarioId, ip }) {
  const pago = await buscar(id)

  // Se reserva el aviso antes de cobrar: una segunda confirmacion o un rechazo a la vez no pasan.
  const reservado = await prisma.pagoInformado.updateMany({
    where: { id, estado: 'PENDIENTE' },
    data: { estado: 'CONFIRMADO', revisadoPorId: usuarioId, revisadoEn: new Date() }
  })
  if (reservado.count === 0) {
    const actual = await buscar(id)
    throw errorHttp(
      `El pago informado ya fue ${actual.estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}`,
      409,
      { codigo: 'PAGO_YA_REVISADO' }
    )
  }

  let resultado
  try {
    resultado = await cuentaInmueble.registrarPagoInmueble({
      inmuebleId: pago.inmuebleId,
      monto: new Decimal(pago.monto).toFixed(2),
      metodoPago: pago.metodoPago,
      referencia: pago.referencia ?? undefined,
      fechaPago: pago.fechaPago.toISOString().slice(0, 10),
      cuentaId,
      // Reintentar la confirmacion no puede cobrar dos veces.
      claveSolicitud: `pago-informado-${pago.id}`,
      usuarioId,
      ip
    })
  } catch (err) {
    await prisma.pagoInformado.updateMany({
      where: { id, estado: 'CONFIRMADO', reciboId: null },
      data: { estado: 'PENDIENTE', revisadoPorId: null, revisadoEn: null }
    })
    throw err
  }

  const actualizado = await prisma.pagoInformado.update({
    where: { id },
    data: { reciboId: resultado.recibo.id },
    include: INCLUIR
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'CONFIRMAR',
    entidad: 'PagoInformado',
    entidadId: id,
    detalle: { folio: resultado.recibo.folio, monto: new Decimal(pago.monto).toFixed(2), inmueble: pago.inmueble.codigo },
    ip
  })

  return { pago: presentar(actualizado), recibo: resultado.recibo, mensaje: 'Pago confirmado y registrado' }
}

/** El administrador no acepta el aviso: queda RECHAZADO con el motivo, sin tocar la deuda. */
async function rechazar(id, { motivo, usuarioId, ip }) {
  if (typeof motivo !== 'string' || !motivo.trim()) throw errorHttp('El motivo del rechazo es requerido', 400)
  const motivoLimpio = motivo.trim()
  if (motivoLimpio.length > MAX_LARGO_MOTIVO) {
    throw errorHttp(`El motivo no puede superar ${MAX_LARGO_MOTIVO} caracteres`, 400)
  }

  const pago = await buscar(id)
  const rechazado = await prisma.pagoInformado.updateMany({
    where: { id, estado: 'PENDIENTE' },
    data: { estado: 'RECHAZADO', motivoRechazo: motivoLimpio, revisadoPorId: usuarioId, revisadoEn: new Date() }
  })
  if (rechazado.count === 0) {
    const actual = await buscar(id)
    throw errorHttp(
      `El pago informado ya fue ${actual.estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}`,
      409,
      { codigo: 'PAGO_YA_REVISADO' }
    )
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'RECHAZAR',
    entidad: 'PagoInformado',
    entidadId: id,
    detalle: { motivo: motivoLimpio, monto: new Decimal(pago.monto).toFixed(2), inmueble: pago.inmueble.codigo },
    ip
  })

  return { pago: presentar(await buscar(id)), mensaje: 'Pago rechazado' }
}

module.exports = { informar, listar, obtener, obtenerEnlaceComprobante, confirmar, rechazar }
