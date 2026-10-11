const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  parsearFechaPago,
  formatearFolio,
  estadoPagoDe,
  resumenRecibo,
  crearRecibo,
  repartirPago,
  sumarPagos,
  sumarCampo,
  pendientesDe,
  periodoMasReciente,
  bloquearInmueble,
  bloquearExpensasConDeuda,
  expensasConDeudaOrdenadas,
  saldoFavorDe
} = require('../expensas/saldo.util')
const reglas = require('../expensas/reglas-pago.util')

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAX_MOVIMIENTOS = 200
const OPCIONES_TX = { timeout: 15000 }
const ETIQUETA_CLASE = { DEPARTAMENTO: 'Departamento', BAULERA: 'Baulera', PARQUEO: 'Parqueo' }

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
    clase: inmueble.clase,
    // Baulera y parqueo no tienen tipo (A, B, C...): se muestra su clase.
    tipo: inmueble.tipoInmueble?.nombre ?? ETIQUETA_CLASE[inmueble.clase] ?? inmueble.clase,
    activo: inmueble.activo
  }
}

/** Solo los departamentos pagan expensa y tienen cuenta que cobrar. */
function exigirDepartamento(inmueble) {
  if (inmueble.clase !== 'DEPARTAMENTO') {
    throw errorHttp(
      `El inmueble ${inmueble.codigo} es ${inmueble.clase === 'BAULERA' ? 'una baulera' : 'un parqueo'}: solo los departamentos pagan expensa`,
      409
    )
  }
}

/** Lo que falta pagar de una expensa, mora y monto juntos (nunca negativo). */
function pendienteDe(expensa) {
  return pendientesDe(expensa).total
}

/** Reparte lo pagado de mora entre las lineas de mora, de la mas antigua a la mas nueva. */
function detalleMoras(lineas = [], pagadoMora) {
  let restante = new Decimal(pagadoMora)
  return lineas.map((linea) => {
    const monto = new Decimal(linea.monto)
    const pagado = Decimal.min(restante, monto)
    restante = restante.minus(pagado)
    return {
      numero: linea.numero,
      mes: linea.mes,
      fechaCorte: new Date(linea.fechaCorte).toISOString().slice(0, 10),
      base: new Decimal(linea.base).toFixed(2),
      tipoValor: linea.tipoValor,
      valor: new Decimal(linea.valor).toString(),
      monto: monto.toFixed(2),
      pagado: pagado.toFixed(2),
      pendiente: monto.minus(pagado).toFixed(2)
    }
  })
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

async function registrarPagoAnticipado({ inmuebleId, monto, metodoPago, referencia, fechaPago, usuarioId, ip }) {
  const montoAbono = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)

  const inmueble = await obtenerInmueble(inmuebleId)
  exigirDepartamento(inmueble)

  const { recibo, movimiento, saldoFavor } = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, inmuebleId)

    // El pago anticipado solo aplica cuando no se debe nada; con deuda se usa el pago normal.
    reglas.validarPagoAnticipado({ deudas: await reglas.cargarDeudas(tx, inmuebleId) })

    const reciboCreado = await crearRecibo(tx, {
      inmuebleId,
      montoTotal: montoAbono,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })
    const creado = await tx.movimientoSaldo.create({
      data: {
        inmuebleId,
        tipo: 'PAGO_ANTICIPADO',
        monto: montoAbono,
        reciboId: reciboCreado.id,
        metodoPago,
        referencia: referenciaLimpia,
        registradoPorId: usuarioId
      }
    })
    return { recibo: reciboCreado, movimiento: creado, saldoFavor: await saldoFavorDe(tx, inmuebleId) }
  })

  const folio = formatearFolio(recibo.folioNumero)

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Recibo',
    entidadId: recibo.id,
    detalle: {
      folio,
      inmueble: inmueble.codigo,
      montoRecibido: montoAbono.toFixed(2),
      fechaPago: recibo.fechaPago.toISOString(),
      metodoPago,
      referencia: referenciaLimpia
    },
    ip
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'MovimientoSaldo',
    entidadId: movimiento.id,
    detalle: {
      tipo: 'PAGO_ANTICIPADO',
      folio,
      inmueble: inmueble.codigo,
      monto: montoAbono.toFixed(2),
      metodoPago,
      referencia: referenciaLimpia
    },
    ip
  })

  return {
    movimiento,
    recibo: resumenRecibo(recibo),
    saldoFavor: saldoFavor.toFixed(2),
    tipoPago: 'ANTICIPADO',
    mensaje:
      'Pago anticipado registrado como saldo a favor. Se descuenta solo en la proxima expensa que se genere, o a mano con POST /api/financiero/expensas/{id}/aplicar-saldo'
  }
}

/**
 * Registra un pago a nivel de inmueble: el monto se reparte entre sus expensas con deuda,
 * de la mas antigua a la mas nueva (en cada una, primero la mora y luego el monto; cada una
 * se cubre completa antes de pasar a la siguiente). Si sobra, la diferencia queda como saldo
 * a favor; si el inmueble no debe nada, todo es saldo a favor.
 * Los meses atrasados solo se aceptan completos (ver reglas-pago.util.js).
 */
async function registrarPagoInmueble({ inmuebleId, monto, metodoPago, referencia, fechaPago, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago, { obligatoria: true })

  const inmueble = await obtenerInmueble(inmuebleId)
  exigirDepartamento(inmueble)

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, inmuebleId)
    await bloquearExpensasConDeuda(tx, inmuebleId)
    const expensas = await expensasConDeudaOrdenadas(tx, inmuebleId)

    // Reglas de pago: orden de meses, meses atrasados completos, cuotas solo estando al dia.
    const deudas = reglas.clasificarDeudas(expensas, await periodoMasReciente(tx, inmuebleId))
    const plan = reglas.planificarPago({ deudas, monto: montoRecibido })

    const recibo = await crearRecibo(tx, {
      inmuebleId,
      montoTotal: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })

    const { aplicaciones, restante } = await repartirPago(tx, {
      reciboId: recibo.id,
      expensas,
      monto: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })

    const conPago = aplicaciones.filter((a) => a.pago)
    let movimiento = null
    if (restante.gt(0)) {
      const ultima = conPago[conPago.length - 1]
      movimiento = await tx.movimientoSaldo.create({
        data: {
          inmuebleId,
          // Sin deuda que cubrir es un pago anticipado; con deuda, un exceso sobre lo adeudado.
          tipo: ultima ? 'EXCESO_PAGO' : 'PAGO_ANTICIPADO',
          monto: restante,
          expensaId: ultima ? ultima.expensa.id : null,
          reciboId: recibo.id,
          metodoPago,
          referencia: referenciaLimpia,
          registradoPorId: usuarioId
        }
      })
    }

    return {
      recibo,
      aplicaciones,
      conPago,
      restante,
      movimiento,
      tipoPago: plan.tipoPago,
      saldoFavor: await saldoFavorDe(tx, inmuebleId)
    }
  }, OPCIONES_TX)

  const { recibo, aplicaciones, conPago, restante, movimiento, saldoFavor } = resultado
  const folio = formatearFolio(recibo.folioNumero)
  const montoAplicado = montoRecibido.minus(restante)

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Recibo',
    entidadId: recibo.id,
    detalle: {
      folio,
      inmueble: inmueble.codigo,
      montoRecibido: montoRecibido.toFixed(2),
      montoAplicado: montoAplicado.toFixed(2),
      saldoFavorGenerado: restante.toFixed(2),
      fechaPago: recibo.fechaPago.toISOString(),
      metodoPago,
      referencia: referenciaLimpia,
      tipoPago: resultado.tipoPago,
      expensas: conPago.map((a) => ({
        periodo: a.expensa.periodo,
        monto: a.aplicado.toFixed(2),
        aMora: a.aplicadoMora.toFixed(2),
        aExpensa: a.aplicadoExpensa.toFixed(2)
      }))
    },
    ip
  })

  for (const a of conPago) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'Pago',
      entidadId: a.pago.id,
      detalle: {
        folio,
        expensaId: a.expensa.id,
        periodo: a.expensa.periodo,
        montoAplicado: a.aplicado.toFixed(2),
        aMora: a.aplicadoMora.toFixed(2),
        aExpensa: a.aplicadoExpensa.toFixed(2),
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  for (const a of aplicaciones) {
    if (a.estadoAnterior === a.estado) continue
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Expensa',
      entidadId: a.expensa.id,
      detalle: { motivo: 'PAGO', folio, estado: { antes: a.estadoAnterior, despues: a.estado } },
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
        tipo: movimiento.tipo,
        folio,
        inmueble: inmueble.codigo,
        monto: restante.toFixed(2),
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  return {
    recibo: resumenRecibo(recibo),
    estadoPago: estadoPagoDe(conPago.map((a) => a.estado)),
    tipoPago: resultado.tipoPago,
    montoRecibido: montoRecibido.toFixed(2),
    montoAplicado: montoAplicado.toFixed(2),
    saldoFavorGenerado: restante.toFixed(2),
    saldoFavor: saldoFavor.toFixed(2),
    aplicaciones: conPago.map((a) => ({
      expensaId: a.expensa.id,
      periodo: a.expensa.periodo,
      pagoId: a.pago.id,
      montoAplicado: a.aplicado.toFixed(2),
      montoMora: a.aplicadoMora.toFixed(2),
      montoExpensa: a.aplicadoExpensa.toFixed(2),
      estado: a.estado
    })),
    mensaje: 'Pago registrado exitosamente'
  }
}

/** Historial de pagos de un inmueble (mas reciente primero), con su folio y estado. */
async function listarPagos(inmuebleId, { desde, hasta } = {}) {
  const inicio = parsearFecha(desde, 'desde', { finDeDia: false, offset: '-04:00' })
  const fin = parsearFecha(hasta, 'hasta', { finDeDia: true, offset: '-04:00' })
  if (inicio && fin && inicio > fin) {
    throw errorHttp('desde no puede ser posterior a hasta', 400)
  }

  const inmueble = await obtenerInmueble(inmuebleId)

  const pagos = await prisma.pago.findMany({
    where: {
      expensa: { inmuebleId },
      ...(inicio || fin
        ? { fechaPago: { ...(inicio ? { gte: inicio } : {}), ...(fin ? { lte: fin } : {}) } }
        : {})
    },
    include: {
      expensa: { select: { id: true, periodo: true, estado: true } },
      recibo: { select: { id: true, folioNumero: true, comprobantePath: true } },
      registradoPor: { select: { id: true, nombre: true, apellido: true } }
    },
    orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
    take: MAX_MOVIMIENTOS
  })

  return {
    inmueble: resumenInmueble(inmueble),
    rango: { desde: desde ?? null, hasta: hasta ?? null },
    pagos: pagos.map((p) => ({
      id: p.id,
      folio: p.recibo ? formatearFolio(p.recibo.folioNumero) : null,
      reciboId: p.reciboId,
      tieneComprobante: Boolean(p.recibo?.comprobantePath),
      monto: new Decimal(p.monto).toFixed(2),
      montoMora: new Decimal(p.montoMora).toFixed(2),
      montoExpensa: new Decimal(p.montoExpensa).toFixed(2),
      metodoPago: p.metodoPago,
      referencia: p.referencia,
      fechaPago: p.fechaPago,
      expensa: p.expensa, // periodo y estado actual de la expensa que cubrio
      registradoPor: p.registradoPor
    }))
  }
}

async function obtenerSaldo(inmuebleId) {
  const inmueble = await obtenerInmueble(inmuebleId)

  const expensas = await expensasConDeudaOrdenadas(prisma, inmuebleId)
  const deudas = reglas.clasificarDeudas(expensas, await periodoMasReciente(prisma, inmuebleId))
  const situacionPago = reglas.resumirSituacion(deudas)

  const deudaPendiente = deudas.reduce((acc, d) => acc.plus(d.pendiente.total), new Decimal(0))
  const saldoFavor = await saldoFavorDe(prisma, inmuebleId)
  const saldoNeto = deudaPendiente.minus(saldoFavor)
  const proximo = situacionPago.proximoPago

  return {
    inmueble: resumenInmueble(inmueble),
    deudaPendiente: deudaPendiente.toFixed(2),
    saldoFavor: saldoFavor.toFixed(2),
    saldoNeto: saldoNeto.toFixed(2), // positivo = debe, negativo = a favor
    situacion: situacionDe(saldoNeto),
    // Reglas de pago: al dia = sin deuda de meses anteriores. Con deuda atrasada hay que
    // pagar completo el mes mas antiguo antes de pagar en cuotas o por adelantado.
    alDia: situacionPago.alDia,
    deudaAtrasada: situacionPago.deudaAtrasada.toFixed(2),
    proximoPago: proximo
      ? {
          expensaId: proximo.expensaId,
          periodo: proximo.periodo,
          atrasada: proximo.atrasada,
          pendiente: proximo.pendiente.toFixed(2),
          montoMinimo: proximo.montoMinimo.toFixed(2)
        }
      : null,
    expensasPendientes: deudas.map((d) => ({
      id: d.expensa.id,
      periodo: d.expensa.periodo,
      estado: d.expensa.estado,
      tipo: d.expensa.tipoNombre,
      atrasada: d.atrasada,
      pendiente: d.pendiente.total.toFixed(2),
      pendienteMora: d.pendiente.mora.toFixed(2),
      pendienteExpensa: d.pendiente.expensa.toFixed(2)
    }))
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

  const [expensas, movimientos, saldoFavor, periodoReciente] = await Promise.all([
    prisma.expensa.findMany({
      where: {
        inmuebleId,
        ...(Object.keys(filtroVencimiento).length ? { fechaVencimiento: filtroVencimiento } : {})
      },
      include: {
        pagos: { orderBy: { fechaPago: 'asc' } },
        moras: { orderBy: { numero: 'asc' } },
        cambiosVencimiento: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { periodo: 'asc' }
    }),
    prisma.movimientoSaldo.findMany({
      where: {
        inmuebleId,
        ...(Object.keys(filtroMovimientos).length ? { createdAt: filtroMovimientos } : {})
      },
      orderBy: { createdAt: 'asc' }
    }),
    saldoFavorDe(prisma, inmuebleId),
    periodoMasReciente(prisma, inmuebleId)
  ])

  let totalFacturado = new Decimal(0)
  let totalAgua = new Decimal(0)
  let totalMora = new Decimal(0)
  let totalPagado = new Decimal(0)
  let deudaPendiente = new Decimal(0)

  const filas = expensas.map((e) => {
    const pagado = sumarPagos(e.pagos)
    const pendientes = pendientesDe(e)
    totalFacturado = totalFacturado.plus(e.montoTotal)
    totalAgua = totalAgua.plus(e.montoAgua)
    totalMora = totalMora.plus(e.montoMora)
    totalPagado = totalPagado.plus(pagado)
    deudaPendiente = deudaPendiente.plus(pendientes.total)
    return {
      id: e.id,
      periodo: e.periodo,
      tipo: e.tipoNombre,
      fechaGeneracion: e.createdAt,
      // Persona responsable cuando se genero (propietario vigente; si no, el inquilino).
      responsable: e.responsableNombre
        ? { id: e.responsableId, nombre: e.responsableNombre, rol: e.responsableRol }
        : null,
      fechaVencimiento: e.fechaVencimiento,
      cambiosVencimiento: e.cambiosVencimiento,
      estado: e.estado,
      atrasada: periodoReciente !== null && e.periodo < periodoReciente && pendientes.total.gt(0),
      montoBase: e.montoBase,
      montoAgua: e.montoAgua,
      montoTotal: e.montoTotal, // expensa fija + agua (sin mora)
      montoMora: e.montoMora,
      pagado: pagado.toFixed(2),
      pagadoMora: sumarCampo(e.pagos, 'montoMora').toFixed(2),
      pagadoExpensa: sumarCampo(e.pagos, 'montoExpensa').toFixed(2),
      pendiente: pendientes.total.toFixed(2),
      pendienteMora: pendientes.mora.toFixed(2),
      pendienteExpensa: pendientes.expensa.toFixed(2),
      moras: detalleMoras(e.moras, sumarCampo(e.pagos, 'montoMora')),
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
      totalAgua: totalAgua.toFixed(2),
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
  registrarPagoInmueble,
  listarPagos,
  obtenerSaldo,
  obtenerEstadoCuenta,
  listarMovimientosSaldo
}
