const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  sumarPagos,
  bloquearInmueble,
  saldoFavorDe
} = require('../expensas/saldo.util')

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAX_MOVIMIENTOS = 200

async function obtenerInmueble(inmuebleId) {
  const inmueble = await prisma.inmueble.findUnique({
    where: { id: inmuebleId },
    include: { tipoInmueble: true }
  })
  if (!inmueble) {
    throw errorHttp('Inmueble no encontrado', 404)
  }
  return inmueble
}

function resumenInmueble(inmueble) {
  return {
    id: inmueble.id,
    codigo: inmueble.codigo,
    tipo: inmueble.tipoInmueble.nombre,
    activo: inmueble.activo
  }
}

/** Lo que falta pagar de una expensa (nunca negativo). */
function pendienteDe(expensa) {
  const adeudado = new Decimal(expensa.montoTotal).plus(expensa.montoMora)
  return Decimal.max(adeudado.minus(sumarPagos(expensa.pagos)), new Decimal(0))
}

function situacionDe(saldoNeto) {
  if (saldoNeto.gt(0)) return 'DEBE'
  if (saldoNeto.lt(0)) return 'A_FAVOR'
  return 'AL_DIA'
}

/**
 * Convierte un YYYY-MM-DD en un limite de fecha. Las fechas de expensa se guardan sin
 * hora (UTC) y las de movimientos son instantes; Bolivia es UTC-4 todo el anio.
 */
function parsearFecha(valor, campo, { finDeDia, offset }) {
  if (valor === undefined) return undefined
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor)) {
    throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
  }
  const fecha = new Date(`${valor}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}${offset}`)
  if (Number.isNaN(fecha.getTime())) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return fecha
}

async function registrarPagoAnticipado({ inmuebleId, monto, metodoPago, referencia, usuarioId, ip }) {
  const montoAbono = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)

  const inmueble = await obtenerInmueble(inmuebleId)

  const { movimiento, saldoFavor } = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, inmuebleId)

    const creado = await tx.movimientoSaldo.create({
      data: {
        inmuebleId,
        tipo: 'PAGO_ANTICIPADO',
        monto: montoAbono,
        metodoPago,
        referencia: referenciaLimpia,
        registradoPorId: usuarioId
      }
    })
    return { movimiento: creado, saldoFavor: await saldoFavorDe(tx, inmuebleId) }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'MovimientoSaldo',
    entidadId: movimiento.id,
    detalle: {
      tipo: 'PAGO_ANTICIPADO',
      inmueble: inmueble.codigo,
      monto: montoAbono.toFixed(2),
      metodoPago,
      referencia: referenciaLimpia
    },
    ip
  })

  return {
    movimiento,
    saldoFavor: saldoFavor.toFixed(2),
    mensaje:
      'Pago anticipado registrado como saldo a favor. Se descuenta solo en la proxima expensa que se genere, o a mano con POST /api/financiero/expensas/{id}/aplicar-saldo'
  }
}

async function obtenerSaldo(inmuebleId) {
  const inmueble = await obtenerInmueble(inmuebleId)

  const expensas = await prisma.expensa.findMany({
    where: { inmuebleId, estado: { not: 'PAGADA' } },
    include: { pagos: true },
    orderBy: { fechaVencimiento: 'asc' }
  })

  const detalle = expensas
    .map((e) => ({ id: e.id, periodo: e.periodo, estado: e.estado, pendiente: pendienteDe(e) }))
    .filter((e) => e.pendiente.gt(0))

  const deudaPendiente = detalle.reduce((acc, e) => acc.plus(e.pendiente), new Decimal(0))
  const saldoFavor = await saldoFavorDe(prisma, inmuebleId)
  const saldoNeto = deudaPendiente.minus(saldoFavor)

  return {
    inmueble: resumenInmueble(inmueble),
    deudaPendiente: deudaPendiente.toFixed(2),
    saldoFavor: saldoFavor.toFixed(2),
    saldoNeto: saldoNeto.toFixed(2), // positivo = debe, negativo = a favor
    situacion: situacionDe(saldoNeto),
    expensasPendientes: detalle.map((e) => ({ ...e, pendiente: e.pendiente.toFixed(2) }))
  }
}

async function obtenerEstadoCuenta(inmuebleId, { desde, hasta } = {}) {
  const inicioExpensas = parsearFecha(desde, 'desde', { finDeDia: false, offset: 'Z' })
  const finExpensas = parsearFecha(hasta, 'hasta', { finDeDia: true, offset: 'Z' })
  const inicioMov = parsearFecha(desde, 'desde', { finDeDia: false, offset: '-04:00' })
  const finMov = parsearFecha(hasta, 'hasta', { finDeDia: true, offset: '-04:00' })
  if (inicioExpensas && finExpensas && inicioExpensas > finExpensas) {
    throw errorHttp('desde no puede ser posterior a hasta', 400)
  }

  const inmueble = await obtenerInmueble(inmuebleId)

  const filtroVencimiento = {
    ...(inicioExpensas ? { gte: inicioExpensas } : {}),
    ...(finExpensas ? { lte: finExpensas } : {})
  }
  const filtroMovimientos = {
    ...(inicioMov ? { gte: inicioMov } : {}),
    ...(finMov ? { lte: finMov } : {})
  }

  const [expensas, movimientos, saldoFavor] = await Promise.all([
    prisma.expensa.findMany({
      where: {
        inmuebleId,
        ...(Object.keys(filtroVencimiento).length ? { fechaVencimiento: filtroVencimiento } : {})
      },
      include: { pagos: { orderBy: { fechaPago: 'asc' } } },
      orderBy: { periodo: 'asc' }
    }),
    prisma.movimientoSaldo.findMany({
      where: {
        inmuebleId,
        ...(Object.keys(filtroMovimientos).length ? { createdAt: filtroMovimientos } : {})
      },
      orderBy: { createdAt: 'asc' }
    }),
    saldoFavorDe(prisma, inmuebleId)
  ])

  let totalFacturado = new Decimal(0)
  let totalMora = new Decimal(0)
  let totalPagado = new Decimal(0)
  let deudaPendiente = new Decimal(0)

  const filas = expensas.map((e) => {
    const pagado = sumarPagos(e.pagos)
    const pendiente = e.estado === 'PAGADA' ? new Decimal(0) : pendienteDe(e)
    totalFacturado = totalFacturado.plus(e.montoTotal)
    totalMora = totalMora.plus(e.montoMora)
    totalPagado = totalPagado.plus(pagado)
    deudaPendiente = deudaPendiente.plus(pendiente)
    return {
      id: e.id,
      periodo: e.periodo,
      fechaVencimiento: e.fechaVencimiento,
      estado: e.estado,
      montoTotal: e.montoTotal,
      montoMora: e.montoMora,
      pagado: pagado.toFixed(2),
      pendiente: pendiente.toFixed(2),
      pagos: e.pagos
    }
  })

  const saldoNeto = deudaPendiente.minus(saldoFavor)

  return {
    inmueble: resumenInmueble(inmueble),
    rango: { desde: desde ?? null, hasta: hasta ?? null },
    expensas: filas,
    movimientosSaldo: movimientos,
    resumen: {
      totalFacturado: totalFacturado.toFixed(2),
      totalMora: totalMora.toFixed(2),
      totalPagado: totalPagado.toFixed(2),
      deudaPendiente: deudaPendiente.toFixed(2),
      saldoFavor: saldoFavor.toFixed(2), // saldo vigente hoy, no depende del rango
      saldoNeto: saldoNeto.toFixed(2),
      situacion: situacionDe(saldoNeto)
    }
  }
}

async function listarMovimientosSaldo(inmuebleId) {
  const inmueble = await obtenerInmueble(inmuebleId)

  const [movimientos, saldoFavor] = await Promise.all([
    prisma.movimientoSaldo.findMany({
      where: { inmuebleId },
      include: { registradoPor: { select: { id: true, nombre: true, apellido: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_MOVIMIENTOS
    }),
    saldoFavorDe(prisma, inmuebleId)
  ])

  return {
    inmueble: resumenInmueble(inmueble),
    saldoFavor: saldoFavor.toFixed(2),
    movimientos
  }
}

module.exports = {
  registrarPagoAnticipado,
  obtenerSaldo,
  obtenerEstadoCuenta,
  listarMovimientosSaldo
}
