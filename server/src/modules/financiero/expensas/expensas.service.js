const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { calcularMora } = require('./mora.util')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  parsearFechaPago,
  formatearFolio,
  resumenRecibo,
  crearRecibo,
  repartirPago,
  bloquearInmueble,
  bloquearExpensa,
  aplicarSaldoAExpensa
} = require('./saldo.util')

const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/
const ESTADOS_VALIDOS = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA']
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const OPCIONES_TX = { timeout: 15000 }

const INCLUIR_INMUEBLE = { inmueble: { include: { tipoInmueble: true } } }

async function generar({
  inmuebleId,
  periodo,
  fechaVencimiento,
  usuarioId = null,
  ip = null,
  origen = 'MANUAL'
}) {
  if (typeof periodo !== 'string' || !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }
  const vencimiento = new Date(fechaVencimiento)
  if (Number.isNaN(vencimiento.getTime())) {
    throw errorHttp('fechaVencimiento no es una fecha valida', 400)
  }

  const inmueble = await prisma.inmueble.findUnique({
    where: { id: inmuebleId },
    include: { tipoInmueble: true }
  })

  if (!inmueble) {
    throw errorHttp('Inmueble no encontrado', 404)
  }

  if (!inmueble.activo) {
    throw errorHttp('El inmueble esta inactivo, no se puede generar expensa', 409)
  }

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearInmueble(tx, inmuebleId)

      const creada = await tx.expensa.create({
        data: {
          inmuebleId,
          periodo,
          montoTotal: inmueble.tipoInmueble.montoBase,
          fechaVencimiento: vencimiento
        }
      })

      // Si el inmueble tiene saldo a favor (pagos anticipados / excesos), se usa de inmediato.
      const saldo = await aplicarSaldoAExpensa(tx, { ...creada, pagos: [] }, usuarioId)

      const expensa = await tx.expensa.findUnique({
        where: { id: creada.id },
        include: { ...INCLUIR_INMUEBLE, pagos: true }
      })
      return { expensa, saldo }
    }, OPCIONES_TX)
  } catch (err) {
    if (err.code === 'P2002') {
      throw errorHttp(
        `Ya existe una expensa para el inmueble ${inmueble.codigo} en el periodo ${periodo}`,
        409
      )
    }
    throw err
  }

  const { expensa, saldo } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Expensa',
    entidadId: expensa.id,
    detalle: {
      origen,
      inmueble: inmueble.codigo,
      periodo,
      montoTotal: expensa.montoTotal.toString(),
      fechaVencimiento: vencimiento.toISOString().slice(0, 10)
    },
    ip
  })

  if (saldo.aplicado.gt(0)) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MovimientoSaldo',
      entidadId: saldo.movimiento.id,
      detalle: {
        origen,
        tipo: 'APLICACION_EXPENSA',
        expensaId: expensa.id,
        monto: saldo.movimiento.monto.toString()
      },
      ip
    })
  }

  return { ...expensa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
}

/**
 * Lista expensas. Filtros opcionales: periodo, estado, inmuebleId. Sin `pagina`
 * devuelve el arreglo completo (compatibilidad con quien ya lo consume); con
 * `pagina` devuelve { expensas, paginacion }.
 */
async function listar({ periodo, estado, inmuebleId, pagina, porPagina } = {}) {
  if (periodo !== undefined && !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }
  if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400)
  }

  const where = {
    ...(periodo ? { periodo } : {}),
    ...(estado ? { estado } : {}),
    ...(inmuebleId ? { inmuebleId } : {})
  }
  const consulta = {
    where,
    include: { ...INCLUIR_INMUEBLE, pagos: true },
    orderBy: { fechaVencimiento: 'desc' }
  }

  if (pagina === undefined) {
    return prisma.expensa.findMany(consulta)
  }

  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(
    POR_PAGINA_MAXIMO,
    Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO)
  )

  const [expensas, total] = await Promise.all([
    prisma.expensa.findMany({ ...consulta, skip: (numeroPagina - 1) * tamanio, take: tamanio }),
    prisma.expensa.count({ where })
  ])

  return {
    expensas,
    paginacion: {
      pagina: numeroPagina,
      porPagina: tamanio,
      total,
      totalPaginas: Math.ceil(total / tamanio)
    }
  }
}

/**
 * Calcula y aplica la mora de una expensa vencida segun la configuracion vigente.
 * `moraActualizada` indica si el monto de mora cambio (el cron solo notifica en ese caso).
 */
async function aplicarMora(expensaId, { usuarioId = null, ip = null, origen = 'MANUAL' } = {}) {
  const expensa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    include: { ...INCLUIR_INMUEBLE, pagos: true }
  })

  if (!expensa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const config = await prisma.configuracionMora.findFirst({
    orderBy: { vigenteDesde: 'desc' }
  })

  if (!config) {
    throw errorHttp('No hay una configuracion de mora vigente', 409)
  }

  if (expensa.estado === 'PAGADA') {
    return { ...expensa, moraActualizada: false, mensaje: 'La expensa ya esta pagada, no se aplica mora' }
  }

  const calculo = calcularMora({
    fechaVencimiento: expensa.fechaVencimiento,
    montoTotal: expensa.montoTotal,
    config
  })

  if (!calculo.aplica) {
    return {
      ...expensa,
      moraActualizada: false,
      mensaje: 'La expensa aun esta dentro del periodo de gracia, no se aplica mora'
    }
  }

  const moraAnterior = new Decimal(expensa.montoMora)
  const hayCambioDeMonto = !calculo.montoMora.equals(moraAnterior)
  if (!hayCambioDeMonto && expensa.estado === 'VENCIDA') {
    return { ...expensa, moraActualizada: false, mensaje: 'La mora ya estaba aplicada' }
  }

  const actualizada = await prisma.$transaction(async (tx) => {
    await bloquearExpensa(tx, expensaId)

    // Se vuelve a leer ya con el bloqueo: un pago simultaneo pudo haberla saldado.
    const actual = await tx.expensa.findUnique({ where: { id: expensaId } })
    if (!actual || actual.estado === 'PAGADA') return null

    return tx.expensa.update({
      where: { id: expensaId },
      data: { montoMora: calculo.montoMora, estado: 'VENCIDA' },
      include: { ...INCLUIR_INMUEBLE, pagos: true }
    })
  }, OPCIONES_TX)

  if (!actualizada) {
    return { ...expensa, moraActualizada: false, mensaje: 'La expensa ya esta pagada, no se aplica mora' }
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensaId,
    detalle: {
      origen,
      motivo: 'MORA',
      montoMora: { antes: moraAnterior.toFixed(2), despues: calculo.montoMora.toFixed(2) },
      estado: { antes: expensa.estado, despues: 'VENCIDA' },
      diasAtraso: calculo.diasAtraso,
      mesesAtraso: calculo.mesesAtraso
    },
    ip
  })

  return { ...actualizada, moraActualizada: hayCambioDeMonto }
}

async function registrarPago({ expensaId, monto, metodoPago, referencia, fechaPago, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)

  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previa.inmuebleId)
    await bloquearExpensa(tx, expensaId)

    const expensa = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.estado === 'PAGADA') {
      throw errorHttp('La expensa ya esta pagada, no se pueden registrar mas pagos', 409)
    }

    const recibo = await crearRecibo(tx, {
      inmuebleId: expensa.inmuebleId,
      montoTotal: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })

    // Lo que alcanza la expensa se aplica como pago; el sobrante pasa a saldo a favor.
    const { aplicaciones, restante: exceso } = await repartirPago(tx, {
      reciboId: recibo.id,
      expensas: [expensa],
      monto: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })
    const aplicacion = aplicaciones[0] ?? null
    const aplicado = aplicacion ? aplicacion.aplicado : new Decimal(0)

    const movimiento = exceso.gt(0)
      ? await tx.movimientoSaldo.create({
          data: {
            inmuebleId: expensa.inmuebleId,
            tipo: 'EXCESO_PAGO',
            monto: exceso,
            expensaId,
            reciboId: recibo.id,
            metodoPago,
            referencia: referenciaLimpia,
            registradoPorId: usuarioId
          }
        })
      : null

    const expensaActualizada = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true, ...INCLUIR_INMUEBLE }
    })

    return {
      recibo,
      pago: aplicacion ? aplicacion.pago : null,
      movimiento,
      expensa: expensaActualizada,
      estadoAnterior: expensa.estado,
      aplicado,
      exceso
    }
  }, OPCIONES_TX)

  const { recibo, pago, movimiento, expensa, estadoAnterior, aplicado, exceso } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Recibo',
    entidadId: recibo.id,
    detalle: {
      folio: formatearFolio(recibo.folioNumero),
      inmuebleId: expensa.inmuebleId,
      montoRecibido: montoRecibido.toFixed(2),
      fechaPago: recibo.fechaPago.toISOString(),
      metodoPago,
      referencia: referenciaLimpia
    },
    ip
  })

  if (pago) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'Pago',
      entidadId: pago.id,
      detalle: {
        expensaId,
        folio: formatearFolio(recibo.folioNumero),
        montoRecibido: montoRecibido.toFixed(2),
        montoAplicado: aplicado.toFixed(2),
        excesoASaldoFavor: exceso.toFixed(2),
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  if (movimiento) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MovimientoSaldo',
      entidadId: movimiento.id,
      detalle: {
        tipo: 'EXCESO_PAGO',
        folio: formatearFolio(recibo.folioNumero),
        expensaId,
        monto: exceso.toFixed(2),
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  if (estadoAnterior !== expensa.estado) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Expensa',
      entidadId: expensaId,
      detalle: { motivo: 'PAGO', estado: { antes: estadoAnterior, despues: expensa.estado } },
      ip
    })
  }

  return {
    pago,
    expensa,
    recibo: resumenRecibo(recibo),
    montoRecibido: montoRecibido.toFixed(2),
    montoAplicado: aplicado.toFixed(2),
    saldoFavorGenerado: exceso.toFixed(2)
  }
}

/** Cubre una expensa ya existente con el saldo a favor del inmueble. */
async function aplicarSaldoFavor(expensaId, { usuarioId, ip }) {
  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previa.inmuebleId)
    await bloquearExpensa(tx, expensaId)

    const expensa = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.estado === 'PAGADA') {
      throw errorHttp('La expensa ya esta pagada', 409)
    }

    const saldo = await aplicarSaldoAExpensa(tx, expensa, usuarioId)
    if (saldo.aplicado.lte(0)) {
      throw errorHttp('El inmueble no tiene saldo a favor disponible', 409)
    }

    const actualizada = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true, ...INCLUIR_INMUEBLE }
    })
    return { saldo, expensa: actualizada, estadoAnterior: expensa.estado }
  }, OPCIONES_TX)

  const { saldo, expensa, estadoAnterior } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'MovimientoSaldo',
    entidadId: saldo.movimiento.id,
    detalle: {
      tipo: 'APLICACION_EXPENSA',
      expensaId,
      monto: saldo.movimiento.monto.toString()
    },
    ip
  })

  if (estadoAnterior !== expensa.estado) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Expensa',
      entidadId: expensaId,
      detalle: { motivo: 'SALDO_A_FAVOR', estado: { antes: estadoAnterior, despues: expensa.estado } },
      ip
    })
  }

  return { expensa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
}

module.exports = { generar, listar, aplicarMora, registrarPago, aplicarSaldoFavor }
