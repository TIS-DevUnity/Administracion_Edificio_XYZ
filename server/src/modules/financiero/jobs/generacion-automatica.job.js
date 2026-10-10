const prisma = require('../../../config/prisma')
const { filtroPagaExpensa } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const expensasService = require('../expensas/expensas.service')
const configuracionMoraService = require('../configuracion-mora/configuracion-mora.service')
const notificacionesService = require('../notificaciones/notificaciones.service')
const aguaService = require('../agua/agua.service')
const { fechaEnZona, vencimientoDelPeriodo } = require('../expensas/mora.util')

/** Periodo (YYYY-MM) de una fecha, visto en hora de Bolivia. */
function periodoActual(fecha = new Date()) {
  return fechaEnZona(fecha).slice(0, 7)
}

/** Dia del mes de una fecha, visto en hora de Bolivia. */
function diaDelMes(fecha = new Date()) {
  return Number(fechaEnZona(fecha).slice(8, 10))
}

/**
 * Si hoy coincide con el dia de generacion configurado (o si se pasa
 * { forzar: true }, usado por el endpoint manual de administracion), genera
 * la expensa del periodo actual para cada departamento activo y con alguien
 * asignado que todavia no la tenga, y notifica por correo a sus ocupantes.
 * Un inmueble que ya tiene expensa (o falla por cualquier otro motivo) no
 * debe frenar a los demas. Al final reparte el agua del periodo si ya hay
 * factura registrada.
 *
 * `usuarioId` / `ip` solo vienen cuando lo dispara un administrador a mano; el cron
 * real los deja en null y la auditoria lo registra como origen AUTOMATICO.
 */
async function ejecutarGeneracionAutomatica(
  fecha = new Date(),
  { forzar = false, usuarioId = null, ip = null } = {}
) {
  const config = await configuracionMoraService.obtenerVigente().catch(() => null)
  if (!config) {
    console.warn('[cron:expensas] No hay configuracion de mora vigente, se omite la generacion')
    return { generadas: 0, omitidas: 0 }
  }

  if (!forzar && diaDelMes(fecha) !== config.diaGeneracion) {
    return { generadas: 0, omitidas: 0, motivo: 'no es el dia de generacion' }
  }

  const periodo = periodoActual(fecha)
  const fechaVencimiento = vencimientoDelPeriodo(periodo, config.diaVencimiento)

  const inmuebles = await prisma.inmueble.findMany({
    where: filtroPagaExpensa(fecha),
    orderBy: { codigo: 'asc' }
  })

  let generadas = 0
  const nuevas = []
  const yaGeneradas = []
  const pendientes = []

  // Las que ya tienen expensa del periodo se saltan: asi reintentar no genera errores ni duplica.
  const existentes = await prisma.expensa.findMany({
    where: { periodo, inmuebleId: { in: inmuebles.map((inmueble) => inmueble.id) } },
    select: { inmuebleId: true }
  })
  const conExpensa = new Set(existentes.map((expensa) => expensa.inmuebleId))

  for (const inmueble of inmuebles) {
    if (conExpensa.has(inmueble.id)) {
      yaGeneradas.push(inmueble.codigo)
      continue
    }
    try {
      const expensa = await expensasService.generar({
        inmuebleId: inmueble.id,
        periodo,
        fechaVencimiento,
        usuarioId,
        ip,
        origen: usuarioId ? 'MANUAL_JOB' : 'AUTOMATICO',
        recalcularAgua: false,
        configuracion: config
      })
      generadas += 1
      nuevas.push(expensa)
    } catch (err) {
      // No es un error fatal del job: se conserva lo generado y se sigue con el resto.
      // Una expensa que ya existia no es un problema; cualquier otro motivo queda como
      // pendiente para corregirlo y volver a ejecutar (lo ya generado no se duplica).
      if (err.codigo === 'EXPENSA_DUPLICADA') {
        yaGeneradas.push(inmueble.codigo)
      } else {
        pendientes.push({ inmuebleId: inmueble.id, codigo: inmueble.codigo, motivo: err.message })
        console.warn(`[cron:expensas] Inmueble ${inmueble.codigo}: ${err.message}`)
      }
    }
  }

  // Departamentos que no entran en esta generacion y por que (baulera y parqueo no pagan).
  const pagan = new Set(inmuebles.map((inmueble) => inmueble.id))
  const otrosDepartamentos = await prisma.inmueble.findMany({
    where: { clase: 'DEPARTAMENTO', id: { notIn: [...pagan] } },
    select: { codigo: true, activo: true },
    orderBy: { codigo: 'asc' }
  })
  const excluidos = otrosDepartamentos.map((inmueble) => ({
    codigo: inmueble.codigo,
    motivo: inmueble.activo ? 'Sin nadie asignado' : 'Inmueble inactivo'
  }))
  const omitidas = yaGeneradas.length + pendientes.length

  // Si el periodo ya tiene factura de agua, las expensas nuevas entran en el reparto.
  if (generadas > 0) {
    try {
      await aguaService.recalcularPeriodo(periodo, { usuarioId, ip })
    } catch (err) {
      console.warn(`[cron:expensas] No se pudo repartir el agua de ${periodo}: ${err.message}`)
    }
  }

  // Se vuelven a leer para avisar con los montos ya repartidos (agua incluida si hay factura).
  if (nuevas.length > 0) {
    const vigentes = await prisma.expensa.findMany({
      where: { id: { in: nuevas.map((expensa) => expensa.id) } },
      include: { inmueble: true }
    })
    for (const expensa of vigentes) {
      await notificacionesService.notificarExpensaGenerada(expensa)
    }
  }

  console.log(
    `[cron:expensas] Generacion automatica ${periodo}: ${generadas} generadas, ` +
      `${yaGeneradas.length} ya existian, ${pendientes.length} pendientes`
  )
  return { periodo, generadas, omitidas, yaGeneradas, pendientes, excluidos }
}

/**
 * Revisa las expensas con deuda y deja la mora al dia: genera una linea por cada mes de
 * atraso que todavia no tenga. El correo se envia unicamente cuando se agrega mora nueva,
 * asi un pago parcial no provoca avisos repetidos.
 */
async function ejecutarAplicacionMoraAutomatica({ usuarioId = null, ip = null } = {}) {
  const config = await configuracionMoraService.obtenerVigente().catch(() => null)
  if (!config) {
    console.warn('[cron:mora] No hay configuracion de mora vigente, se omite la aplicacion')
    return { aplicadas: 0 }
  }

  const expensasConDeuda = await prisma.expensa.findMany({
    where: { estado: { in: ['PENDIENTE', 'PARCIAL', 'VENCIDA'] } }
  })

  let aplicadas = 0

  for (const expensa of expensasConDeuda) {
    try {
      const resultado = await expensasService.aplicarMora(expensa.id, {
        usuarioId,
        ip,
        origen: usuarioId ? 'MANUAL_JOB' : 'AUTOMATICO'
      })
      if (resultado.moraActualizada) {
        aplicadas += 1
        await notificacionesService.notificarMoraAplicada(resultado)
      }
    } catch (err) {
      console.warn(`[cron:mora] Expensa ${expensa.id}: ${err.message}`)
    }
  }

  console.log(`[cron:mora] Aplicacion automatica de mora: ${aplicadas} expensas con mora nueva`)
  return { aplicadas }
}

module.exports = {
  periodoActual,
  ejecutarGeneracionAutomatica,
  ejecutarAplicacionMoraAutomatica
}
