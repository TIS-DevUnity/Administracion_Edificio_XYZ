const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')

const MODOS_MORA = ['UNICA', 'MENSUAL']

async function obtenerVigente() {
  const config = await prisma.configuracionMora.findFirst({
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

async function crear({
  diaGeneracion,
  diasGracia,
  tipoValor,
  valor,
  modoMora = 'UNICA',
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

  const config = await prisma.configuracionMora.create({
    data: { diaGeneracion, diasGracia, tipoValor, valor, modoMora }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'ConfiguracionMora',
    entidadId: config.id,
    detalle: { diaGeneracion, diasGracia, tipoValor, valor, modoMora },
    ip
  })

  return config
}

module.exports = { obtenerVigente, listarHistorial, crear, MODOS_MORA }
