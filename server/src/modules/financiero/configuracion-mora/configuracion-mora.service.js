const prisma = require('../../../config/prisma')
const { fechaEnZona } = require('../expensas/mora.util')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')

const MODOS_MORA = ['UNICA', 'MENSUAL']
const DIA_VENCIMIENTO_POR_DEFECTO = 10

/**
 * Configuracion que rige en `fecha` (por defecto hoy): la mas reciente cuyo vigenteDesde ya
 * llego. Una configuracion con fecha futura queda programada y todavia no rige.
 */
async function obtenerVigente(fecha = new Date()) {
  const config = await prisma.configuracionMora.findFirst({
    where: { vigenteDesde: { lte: fecha } },
    orderBy: { vigenteDesde: 'desc' }
  })

  if (!config) {
    throw Object.assign(new Error('No hay una configuracion de mora vigente'), { status: 404 })
  }

  return config
}

async function listarHistorial() {
  return prisma.configuracionMora.findMany({
    orderBy: { vigenteDesde: 'desc' }
  })
}

function errorValidacion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 })
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Desde cuando rige una configuracion nueva. Sin valor, desde ahora. Una fecha (YYYY-MM-DD,
 * dia en hora de Bolivia) de hoy o anterior rige desde ahora; una futura queda programada.
 * No se aceptan fechas pasadas para no reescribir lo ya calculado.
 */
function resolverVigenteDesde(valor) {
  const ahora = new Date()
  if (valor === undefined || valor === null || valor === '') return ahora

  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor)) {
    throw errorValidacion('vigenteDesde debe tener el formato YYYY-MM-DD')
  }

  const inicioDelDia = new Date(`${valor}T00:00:00-04:00`)
  if (Number.isNaN(inicioDelDia.getTime())) {
    throw errorValidacion('vigenteDesde no es una fecha valida')
  }
  if (inicioDelDia <= ahora) {
    const hoy = fechaEnZona(ahora)
    if (valor < hoy) {
      throw errorValidacion('vigenteDesde no puede ser una fecha pasada: la nueva regla solo aplica hacia adelante')
    }
    return ahora
  }
  return inicioDelDia
}

/**
 * Crea una nueva configuracion (la mas reciente es la vigente; las anteriores quedan de
 * historial).
 *  - diaGeneracion: dia del mes en que se generan las expensas (1-28).
 *  - diaVencimiento: dia del mes en que vencen (1-28, no antes del dia de generacion). Si no
 *    se envia se conserva el de la configuracion anterior.
 *  - diasGracia: dias extra despues del vencimiento antes de que corra la mora.
 *  - tipoValor / valor: porcentaje (sobre lo que falta pagar) o monto fijo por mes de atraso.
 *  - modoMora: MENSUAL (una mora por cada mes de atraso) o UNICA (solo la primera).
 *  - vigenteDesde: desde cuando rige (YYYY-MM-DD). La regla solo aplica hacia adelante: las
 *    expensas ya generadas conservan la configuracion de su periodo.
 */
async function crear({
  diaGeneracion,
  diaVencimiento,
  diasGracia,
  tipoValor,
  valor,
  modoMora = 'MENSUAL',
  vigenteDesde,
  usuarioId = null,
  ip = null
}) {
  if (!Number.isInteger(diaGeneracion) || diaGeneracion < 1 || diaGeneracion > 28) {
    throw errorValidacion('diaGeneracion debe ser un entero entre 1 y 28')
  }

  if (!Number.isInteger(diasGracia) || diasGracia < 0) {
    throw errorValidacion('diasGracia debe ser un entero mayor o igual a 0')
  }

  if (!['PORCENTAJE', 'MONTO_FIJO'].includes(tipoValor)) {
    throw errorValidacion('tipoValor debe ser PORCENTAJE o MONTO_FIJO')
  }

  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    throw errorValidacion('valor debe ser un numero mayor o igual a 0')
  }

  if (tipoValor === 'PORCENTAJE' && valor > 100) {
    throw errorValidacion('valor no puede superar 100 cuando el tipo es PORCENTAJE')
  }

  if (!MODOS_MORA.includes(modoMora)) {
    throw errorValidacion(`modoMora debe ser uno de: ${MODOS_MORA.join(', ')}`)
  }

  let dia = diaVencimiento
  if (dia === undefined || dia === null) {
    const vigente = await prisma.configuracionMora.findFirst({ orderBy: { vigenteDesde: 'desc' } })
    dia = Math.max(vigente?.diaVencimiento ?? DIA_VENCIMIENTO_POR_DEFECTO, diaGeneracion)
  }

  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw errorValidacion('diaVencimiento debe ser un entero entre 1 y 28')
  }

  if (dia < diaGeneracion) {
    throw errorValidacion('diaVencimiento no puede ser anterior al dia de generacion')
  }

  const desde = resolverVigenteDesde(vigenteDesde)

  const config = await prisma.configuracionMora.create({
    data: { diaGeneracion, diaVencimiento: dia, diasGracia, tipoValor, valor, modoMora, vigenteDesde: desde }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'ConfiguracionMora',
    entidadId: config.id,
    detalle: {
      diaGeneracion,
      diaVencimiento: dia,
      diasGracia,
      tipoValor,
      valor,
      modoMora,
      vigenteDesde: desde.toISOString()
    },
    ip
  })

  return config
}

module.exports = { obtenerVigente, listarHistorial, crear, MODOS_MORA }
