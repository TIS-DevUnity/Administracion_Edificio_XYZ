const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')

const ENTIDAD_AUDITORIA = 'ReporteFinanciero'

/**
 * Deja constancia de la generacion de un reporte financiero (exitosa o fallida). Nunca interrumpe la respuesta.
 * `extra` suma al detalle los parametros propios del reporte (orden, tipo...).
 */
function registrarGeneracion({ tipo, usuarioId, ip, desde, hasta, formato, extra = {}, error = null }) {
  return registrarAuditoria({
    usuarioId,
    accion: 'GENERATE',
    entidad: ENTIDAD_AUDITORIA,
    detalle: {
      tipo,
      desde: desde ?? null,
      hasta: hasta ?? null,
      ...extra,
      formato,
      resultado: error ? 'FALLIDO' : 'EXITOSO',
      ...(error ? { error: error.message } : {})
    },
    ip
  })
}

/** Quien genera el reporte, para el encabezado: { id, nombre, rol } (null si no se encuentra). */
async function usuarioGenerador(usuarioId) {
  if (!usuarioId) return null
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, nombre: true, apellido: true, rol: true } })
  return u ? { id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), rol: u.rol } : null
}

module.exports = { usuarioGenerador, registrarGeneracion, ENTIDAD_AUDITORIA }
