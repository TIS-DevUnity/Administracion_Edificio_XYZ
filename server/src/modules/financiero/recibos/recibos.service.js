const crypto = require('crypto')
const prisma = require('../../../config/prisma')
const { supabase, STORAGE_BUCKET } = require('../../../config/supabase')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  formatearFolio,
  estadoPagoDe,
  resumenRecibo
} = require('../expensas/saldo.util')

const CARPETA_COMPROBANTES = 'comprobantes-pago'
const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024 // 5MB
const SEGUNDOS_ENLACE = 60 * 5

// Formatos aceptados. Se detectan por el contenido del archivo (no por el tipo que declara
// el cliente), porque ese dato lo puede escribir cualquiera.
const FORMATOS_COMPROBANTE = [
  { mime: 'image/jpeg', extension: 'jpg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    extension: 'png',
    coincide: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    coincide: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  }
]
const MENSAJE_FORMATOS = 'Formato no permitido. Formatos aceptados: JPG, PNG o WEBP (maximo 5MB)'

function detectarFormato(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  return FORMATOS_COMPROBANTE.find((f) => f.coincide(buffer)) ?? null
}

function nombreSeguro(nombre) {
  return String(nombre || 'comprobante').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

async function buscarRecibo(id, include = {}) {
  const recibo = await prisma.recibo.findUnique({ where: { id }, include })
  if (!recibo) {
    throw errorHttp('Recibo no encontrado', 404)
  }
  return recibo
}

/** Detalle de un recibo: lo recibido, a que expensas se aplico y el saldo a favor generado. */
async function obtener(id) {
  const recibo = await buscarRecibo(id, {
    inmueble: { include: { tipoInmueble: true } },
    pagos: { include: { expensa: { select: { id: true, periodo: true, estado: true } } } },
    movimientosSaldo: true,
    registradoPor: { select: { id: true, nombre: true, apellido: true } }
  })

  const pagos = [...recibo.pagos].sort((a, b) => a.expensa.periodo.localeCompare(b.expensa.periodo))
  const saldoFavorGenerado = recibo.movimientosSaldo.reduce((acc, m) => acc.plus(m.monto), new Decimal(0))

  return {
    recibo: {
      ...resumenRecibo(recibo),
      comprobanteNombre: recibo.comprobanteNombre,
      createdAt: recibo.createdAt
    },
    inmueble: {
      id: recibo.inmueble.id,
      codigo: recibo.inmueble.codigo,
      tipo: recibo.inmueble.tipoInmueble?.nombre ?? recibo.inmueble.clase
    },
    estadoPago: estadoPagoDe(pagos.map((p) => p.expensa.estado)),
    pagos: pagos.map((p) => ({
      id: p.id,
      expensaId: p.expensa.id,
      periodo: p.expensa.periodo,
      monto: new Decimal(p.monto).toFixed(2),
      estadoExpensa: p.expensa.estado
    })),
    saldoFavorGenerado: saldoFavorGenerado.toFixed(2),
    registradoPor: recibo.registradoPor
  }
}

/** Adjunta (o reemplaza) la foto del comprobante de un recibo. */
async function adjuntarComprobante(id, { archivo, usuarioId, ip }) {
  if (!archivo) {
    throw errorHttp('El archivo del comprobante es requerido (campo "archivo")', 400)
  }
  if (archivo.size > MAX_COMPROBANTE_BYTES) {
    throw errorHttp(MENSAJE_FORMATOS, 400)
  }
  const formato = detectarFormato(archivo.buffer)
  if (!formato) {
    throw errorHttp(MENSAJE_FORMATOS, 400)
  }

  const recibo = await buscarRecibo(id)

  const nombre = `${nombreSeguro(archivo.originalname).replace(/\.[^.]*$/, '')}.${formato.extension}`
  const comprobantePath = `${CARPETA_COMPROBANTES}/${crypto.randomUUID()}-${nombre}`

  const { error: errorSubida } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(comprobantePath, archivo.buffer, { contentType: formato.mime, upsert: false })
  if (errorSubida) {
    throw errorHttp(`No se pudo subir el comprobante: ${errorSubida.message}`, 502)
  }

  try {
    await prisma.recibo.update({
      where: { id },
      data: { comprobantePath, comprobanteMime: formato.mime, comprobanteNombre: nombre }
    })
  } catch (err) {
    await supabase.storage.from(STORAGE_BUCKET).remove([comprobantePath])
    throw err
  }

  // El comprobante anterior (si habia) ya no se usa; borrarlo es solo limpieza.
  if (recibo.comprobantePath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([recibo.comprobantePath])
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Recibo',
    entidadId: id,
    detalle: {
      folio: formatearFolio(recibo.folioNumero),
      motivo: 'COMPROBANTE',
      comprobante: { antes: recibo.comprobanteNombre, despues: nombre }
    },
    ip
  })

  return {
    recibo: resumenRecibo({ ...recibo, comprobantePath }),
    comprobanteNombre: nombre,
    mensaje: 'Comprobante adjuntado correctamente'
  }
}

/** Enlace temporal (5 minutos) para ver la foto del comprobante. */
async function obtenerEnlaceComprobante(id) {
  const recibo = await buscarRecibo(id)
  if (!recibo.comprobantePath) {
    throw errorHttp('El recibo no tiene comprobante adjunto', 404)
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(recibo.comprobantePath, SEGUNDOS_ENLACE)
  if (error) {
    throw errorHttp(`No se pudo generar el enlace del comprobante: ${error.message}`, 502)
  }

  return {
    folio: formatearFolio(recibo.folioNumero),
    nombre: recibo.comprobanteNombre,
    mimeType: recibo.comprobanteMime,
    url: data.signedUrl,
    venceEnSegundos: SEGUNDOS_ENLACE
  }
}

/** Todo lo que necesita el PDF del recibo, ya leido de la base de datos. */
async function datosParaPdf(id) {
  const recibo = await buscarRecibo(id, {
    inmueble: { include: { tipoInmueble: true } },
    pagos: { include: { expensa: { select: { periodo: true, estado: true } } } },
    movimientosSaldo: true,
    registradoPor: { select: { nombre: true, apellido: true } }
  })

  const ocupantes = await prisma.ocupanteInmueble.findMany({
    where: { inmuebleId: recibo.inmuebleId, fechaFin: null },
    include: { copropietario: { select: { nombre: true, apellido: true } } },
    orderBy: [{ esPropietario: 'desc' }, { fechaInicio: 'asc' }]
  })

  const pagos = [...recibo.pagos].sort((a, b) => a.expensa.periodo.localeCompare(b.expensa.periodo))
  const saldoFavorGenerado = recibo.movimientosSaldo.reduce((acc, m) => acc.plus(m.monto), new Decimal(0))

  return {
    folio: formatearFolio(recibo.folioNumero),
    fechaPago: recibo.fechaPago,
    inmueble: { codigo: recibo.inmueble.codigo, tipo: recibo.inmueble.tipoInmueble?.nombre ?? recibo.inmueble.clase },
    recibidoDe: ocupantes.map((o) => `${o.copropietario.nombre} ${o.copropietario.apellido}`),
    montoTotal: new Decimal(recibo.montoTotal),
    metodoPago: recibo.metodoPago,
    referencia: recibo.referencia,
    estadoPago: estadoPagoDe(pagos.map((p) => p.expensa.estado)),
    expensas: pagos.map((p) => ({
      periodo: p.expensa.periodo,
      monto: new Decimal(p.monto),
      estado: p.expensa.estado
    })),
    saldoFavorGenerado,
    registradoPor: recibo.registradoPor
      ? `${recibo.registradoPor.nombre} ${recibo.registradoPor.apellido}`
      : null
  }
}

module.exports = {
  MENSAJE_FORMATOS,
  MAX_COMPROBANTE_BYTES,
  obtener,
  adjuntarComprobante,
  obtenerEnlaceComprobante,
  datosParaPdf
}
