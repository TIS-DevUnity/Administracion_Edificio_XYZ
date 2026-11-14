const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { fechaEnZona } = require('../expensas/mora.util')
const util = require('./morosos.util')
const { generarMorososPdf, nombreArchivoMorosos } = require('./morosos-pdf.service')

const ENTIDAD_AUDITORIA = 'ReporteFinanciero'

/**
 * Consulta (solo lectura) y arma el listado. La vista previa JSON y el PDF salen de esta misma funcion.
 * Valida antes de tocar la base: un rango invalido no consulta nada.
 */
async function listadoMorosos({ desde, hasta, orden, usuarioId } = {}) {
  const rango = util.validarRango({ desde, hasta })
  const ordenFinal = util.validarOrden(orden)
  const generadoEn = new Date()
  const hoy = fechaEnZona(generadoEn)

  const [expensas, usuario] = await Promise.all([
    prisma.expensa.findMany({
      where: {
        planPagoId: null,
        estado: { not: 'PAGADA' },
        fechaVencimiento: {
          gte: new Date(`${rango.desde}T00:00:00Z`),
          lte: new Date(`${rango.hasta}T00:00:00Z`)
        }
      },
      select: {
        id: true,
        inmuebleId: true,
        periodo: true,
        fechaVencimiento: true,
        montoTotal: true,
        montoMora: true,
        planPagoId: true,
        responsableId: true,
        responsableNombre: true,
        inmueble: { select: { codigo: true } },
        pagos: { select: { montoExpensa: true, montoMora: true } }
      }
    }),
    usuarioId
      ? prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, nombre: true, apellido: true, rol: true } })
      : null
  ])

  return util.construirListadoMorosos({
    expensas: expensas.map(({ inmueble, ...e }) => ({ ...e, inmuebleCodigo: inmueble.codigo })),
    ...rango,
    orden: ordenFinal,
    generadoEn,
    hoy,
    generadoPor: usuario ? { id: usuario.id, nombre: `${usuario.nombre} ${usuario.apellido}`.trim(), rol: usuario.rol } : null
  })
}

/** Deja constancia de la generacion (exitosa o fallida). Nunca interrumpe la respuesta. */
function registrarGeneracion({ usuarioId, ip, desde, hasta, orden, formato, error = null }) {
  return registrarAuditoria({
    usuarioId,
    accion: 'GENERATE',
    entidad: ENTIDAD_AUDITORIA,
    detalle: {
      tipo: util.TIPO_REPORTE,
      desde: desde ?? null,
      hasta: hasta ?? null,
      orden: orden ?? null,
      formato,
      resultado: error ? 'FALLIDO' : 'EXITOSO',
      ...(error ? { error: error.message } : {})
    },
    ip
  })
}

/** Genera el listado en `formato` ("JSON" o "PDF") y lo registra. Devuelve { datos } o { datos, pdf, nombreArchivo }. */
async function generar({ formato, desde, hasta, orden, usuarioId, ip }) {
  try {
    const datos = await listadoMorosos({ desde, hasta, orden, usuarioId })
    const salida = formato === 'PDF' ? { datos, pdf: await generarMorososPdf(datos), nombreArchivo: nombreArchivoMorosos(datos) } : { datos }
    await registrarGeneracion({ usuarioId, ip, desde: datos.rango.desde, hasta: datos.rango.hasta, orden: datos.orden, formato })
    return salida
  } catch (err) {
    await registrarGeneracion({ usuarioId, ip, desde, hasta, orden, formato, error: err })
    throw err
  }
}

module.exports = { listadoMorosos, generar }
