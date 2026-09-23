const prisma = require('../../../config/prisma')
const expensasService = require('../expensas/expensas.service')
const configuracionMoraService = require('../configuracion-mora/configuracion-mora.service')
const notificacionesService = require('../notificaciones/notificaciones.service')

function periodoActual(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  return `${anio}-${mes}`
}

function ultimoDiaDelMes(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
}

/**
 * Si hoy coincide con el dia de generacion configurado, genera la expensa del
 * periodo actual para cada inmueble activo que todavia no la tenga, y notifica
 * por correo a sus ocupantes. Un inmueble que ya tiene expensa (o falla por
 * cualquier otro motivo) no debe frenar a los demas.
 */
async function ejecutarGeneracionAutomatica(fecha = new Date()) {
  const config = await configuracionMoraService.obtenerVigente().catch(() => null)
  if (!config) {
    console.warn('[cron:expensas] No hay configuracion de mora vigente, se omite la generacion')
    return { generadas: 0, omitidas: 0 }
  }

  if (fecha.getDate() !== config.diaGeneracion) {
    return { generadas: 0, omitidas: 0, motivo: 'no es el dia de generacion' }
  }

  const periodo = periodoActual(fecha)
  const fechaVencimiento = ultimoDiaDelMes(fecha)

  const inmuebles = await prisma.inmueble.findMany({ where: { activo: true } })

  let generadas = 0
  let omitidas = 0

  for (const inmueble of inmuebles) {
    try {
      const expensa = await expensasService.generar({
        inmuebleId: inmueble.id,
        periodo,
        fechaVencimiento
      })
      generadas += 1
      await notificacionesService.notificarExpensaGenerada(expensa)
    } catch (err) {
      // Ya existe expensa para este inmueble/periodo, o el inmueble esta inactivo:
      // no es un error fatal del job, se contabiliza y se sigue con el resto.
      omitidas += 1
      console.warn(`[cron:expensas] Inmueble ${inmueble.codigo}: ${err.message}`)
    }
  }

  console.log(
    `[cron:expensas] Generacion automatica ${periodo}: ${generadas} generadas, ${omitidas} omitidas`
  )
  return { generadas, omitidas }
}

/**
 * Revisa todas las expensas pendientes/parciales y aplica mora a las que ya
 * pasaron su fecha de vencimiento + dias de gracia, notificando por correo.
 */
async function ejecutarAplicacionMoraAutomatica() {
  const expensasVencibles = await prisma.expensa.findMany({
    where: { estado: { in: ['PENDIENTE', 'PARCIAL'] } }
  })

  let aplicadas = 0

  for (const expensa of expensasVencibles) {
    try {
      const resultado = await expensasService.aplicarMora(expensa.id)
      if (resultado.estado === 'VENCIDA') {
        aplicadas += 1
        await notificacionesService.notificarMoraAplicada(resultado)
      }
    } catch (err) {
      console.warn(`[cron:mora] Expensa ${expensa.id}: ${err.message}`)
    }
  }

  console.log(`[cron:mora] Aplicacion automatica de mora: ${aplicadas} expensas marcadas VENCIDA`)
  return { aplicadas }
}

module.exports = {
  periodoActual,
  ultimoDiaDelMes,
  ejecutarGeneracionAutomatica,
  ejecutarAplicacionMoraAutomatica
}
