const prisma = require('../../../config/prisma')

async function generar({ inmuebleId, periodo, fechaVencimiento }) {
  const inmueble = await prisma.inmueble.findUnique({
    where: { id: inmuebleId },
    include: { tipoInmueble: true }
  })

  if (!inmueble) {
    throw Object.assign(new Error('Inmueble no encontrado'), { status: 404 })
  }

  if (!inmueble.activo) {
    throw Object.assign(new Error('El inmueble esta inactivo, no se puede generar expensa'), {
      status: 409
    })
  }

  try {
    return await prisma.expensa.create({
      data: {
        inmuebleId,
        periodo,
        montoTotal: inmueble.tipoInmueble.montoBase,
        fechaVencimiento: new Date(fechaVencimiento)
      },
      include: { inmueble: { include: { tipoInmueble: true } } }
    })
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(
        new Error(
          `Ya existe una expensa para el inmueble ${inmueble.codigo} en el periodo ${periodo}`
        ),
        { status: 409 }
      )
    }
    throw err
  }
}

async function listar() {
  return prisma.expensa.findMany({
    include: {
      inmueble: { include: { tipoInmueble: true } },
      pagos: true
    },
    orderBy: { fechaVencimiento: 'desc' }
  })
}

async function aplicarMora(expensaId) {
  const expensa = await prisma.expensa.findUnique({
    where: { id: expensaId }
  })

  if (!expensa) {
    throw Object.assign(new Error('Expensa no encontrada'), { status: 404 })
  }

  const config = await prisma.configuracionMora.findFirst({
    orderBy: { vigenteDesde: 'desc' }
  })

  if (!config) {
    throw Object.assign(new Error('No hay una configuracion de mora vigente'), { status: 409 })
  }

  const hoy = new Date()
  const fechaLimiteConGracia = new Date(expensa.fechaVencimiento)
  fechaLimiteConGracia.setDate(fechaLimiteConGracia.getDate() + config.diasGracia)

  if (hoy <= fechaLimiteConGracia) {
    return {
      ...expensa,
      mensaje: 'La expensa aun esta dentro del periodo de gracia, no se aplica mora'
    }
  }

  if (expensa.estado === 'PAGADA') {
    return { ...expensa, mensaje: 'La expensa ya esta pagada, no se aplica mora' }
  }

  let montoMora
  if (config.tipoValor === 'PORCENTAJE') {
    montoMora = (Number(expensa.montoTotal) * Number(config.valor)) / 100
  } else {
    montoMora = Number(config.valor)
  }

  return prisma.expensa.update({
    where: { id: expensaId },
    data: {
      montoMora,
      estado: 'VENCIDA'
    },
    include: { inmueble: { include: { tipoInmueble: true } } }
  })
}

module.exports = { generar, listar, aplicarMora }
