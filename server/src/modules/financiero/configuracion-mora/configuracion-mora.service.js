const prisma = require('../../../config/prisma')

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

async function crear({ diaGeneracion, diasGracia, tipoValor, valor }) {
  if (diaGeneracion < 1 || diaGeneracion > 28) {
    throw Object.assign(new Error('diaGeneracion debe estar entre 1 y 28'), { status: 400 })
  }

  if (diasGracia < 0) {
    throw Object.assign(new Error('diasGracia no puede ser negativo'), { status: 400 })
  }

  if (!['PORCENTAJE', 'MONTO_FIJO'].includes(tipoValor)) {
    throw Object.assign(new Error('tipoValor debe ser PORCENTAJE o MONTO_FIJO'), { status: 400 })
  }

  if (valor < 0) {
    throw Object.assign(new Error('valor no puede ser negativo'), { status: 400 })
  }

  return prisma.configuracionMora.create({
    data: { diaGeneracion, diasGracia, tipoValor, valor }
  })
}

module.exports = { obtenerVigente, listarHistorial, crear }
