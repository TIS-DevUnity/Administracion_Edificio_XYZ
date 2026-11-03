const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  normalizarClaveSolicitud,
  buscarReciboPorClave,
  parsearFechaPago,
  formatearFolio,
  estadoPagoDe,
  resumenRecibo,
  respuestaDuplicada,
  crearRecibo,
  repartirPago,
  sumarPagos,
  sumarCampo,
  pendientesDe,
  periodoMasReciente,
  bloquearInmueble,
  bloquearExpensasConDeuda,
  expensasConDeudaOrdenadas,
  saldoFavorDe,
  deudaEnPlanes
} = require('../expensas/saldo.util')
const campanita = require('../notificaciones/campanita.service')
const planesPagoService = require('../planes-pago/planes-pago.service')
const reglas = require('../expensas/reglas-pago.util')
const { fechaCalendario } = require('../expensas/mora.util')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { construirEventos, armarLibro } = require('./estado-cuenta.util')

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const PERIODO_MES = /^\d{4}-(0[1-9]|1[0-2])$/
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
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

async function registrarPagoAnticipado({ inmuebleId, monto, metodoPago, referencia, fechaPago, cuentaId, claveSolicitud, usuarioId, ip }) {
  const montoAbono = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)
  const clave = normalizarClaveSolicitud(claveSolicitud)

  // Reenvio de una solicitud ya registrada: se devuelve el recibo existente, sin cobrar de nuevo.
  const yaRegistrado = await buscarReciboPorClave(prisma, clave)
  if (yaRegistrado) return respuestaDuplicada(yaRegistrado)

  const inmueble = await obtenerInmueble(inmuebleId)
  exigirDepartamento(inmueble)

  let registrado
  try {
    registrado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, inmuebleId)

    // El pago anticipado solo aplica cuando no se debe nada; con deuda se usa el pago normal.
    reglas.validarPagoAnticipado({ deudas: await reglas.cargarDeudas(tx, inmuebleId) })

    const reciboCreado = await crearRecibo(tx, {
      inmuebleId,
      montoTotal: montoAbono,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId,
      claveSolicitud: clave,
      cuentaId
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
  } catch (err) {
    // Dos solicitudes con la misma clave llegaron a la vez: gana la primera.
    if (err.code === 'P2002' && clave) {
      const yaRegistradoAhora = await buscarReciboPorClave(prisma, clave)
      if (yaRegistradoAhora) return respuestaDuplicada(yaRegistradoAhora)
    }
    throw err
  }

  const { recibo, movimiento, saldoFavor } = registrado
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

  await campanita.avisarPago({ recibo, inmuebleId, aplicaciones: [], saldoFavorGenerado: montoAbono })

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
async function registrarPagoInmueble({ inmuebleId, monto, metodoPago, referencia, fechaPago, cuentaId, claveSolicitud, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago, { obligatoria: true })
  const clave = normalizarClaveSolicitud(claveSolicitud)

  // Reenvio de una solicitud ya registrada: se devuelve el recibo existente, sin cobrar de nuevo.
  const yaRegistrado = await buscarReciboPorClave(prisma, clave)
  if (yaRegistrado) return respuestaDuplicada(yaRegistrado)

  const inmueble = await obtenerInmueble(inmuebleId)
  exigirDepartamento(inmueble)

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
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
      usuarioId,
      claveSolicitud: clave,
      cuentaId
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
  } catch (err) {
    // Dos solicitudes con la misma clave llegaron a la vez: gana la primera.
    if (err.code === 'P2002' && clave) {
      const yaRegistradoAhora = await buscarReciboPorClave(prisma, clave)
      if (yaRegistradoAhora) return respuestaDuplicada(yaRegistradoAhora)
    }
    throw err
  }

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

  // Aviso en la campanita y recordatorios al dia con el nuevo saldo.
  await campanita.avisarPago({
    recibo,
    inmuebleId,
    aplicaciones: conPago.map((a) => ({ expensaId: a.expensa.id, monto: a.aplicado })),
    saldoFavorGenerado: restante
  })

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

  // La deuda que cubre un plan de pagos en cuotas sigue siendo deuda, pero se paga por cuotas.
  const enPlan = await deudaEnPlanes(prisma, inmuebleId)
  const deudaPendiente = deudas
    .reduce((acc, d) => acc.plus(d.pendiente.total), new Decimal(0))
    .plus(enPlan.total)
  const saldoFavor = await saldoFavorDe(prisma, inmuebleId)
  const saldoNeto = deudaPendiente.minus(saldoFavor)
  const proximo = situacionPago.proximoPago

  return {
    inmueble: resumenInmueble(inmueble),
    deudaPendiente: deudaPendiente.toFixed(2),
    deudaEnPlanDePagos: enPlan.total.toFixed(2),
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

/** YYYY-MM-DD valido o undefined si no se envio. */
function validarFechaIso(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return undefined
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor)) {
    throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
  }
  const fecha = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return valor
}

/**
 * Periodo del estado de cuenta: un mes especifico (`mes=YYYY-MM`) o un rango de fechas
 * (`desde` / `hasta`, ambos opcionales e inclusivos). Un rango con el inicio posterior al fin se
 * rechaza.
 */
function resolverPeriodo({ desde, hasta, mes }) {
  const hayMes = mes !== undefined && mes !== null && mes !== ''
  const inicio = validarFechaIso(desde, 'desde')
  const fin = validarFechaIso(hasta, 'hasta')

  if (hayMes) {
    if (inicio || fin) {
      throw errorHttp('Indique un mes o un rango de fechas (desde/hasta), no ambos', 400)
    }
    if (typeof mes !== 'string' || !PERIODO_MES.test(mes)) {
      throw errorHttp('mes debe tener el formato YYYY-MM (ej. 2026-10)', 400)
    }
    const [anio, numeroMes] = mes.split('-').map(Number)
    const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()
    return {
      desde: `${mes}-01`,
      hasta: `${mes}-${String(ultimoDia).padStart(2, '0')}`,
      mes,
      etiqueta: `${NOMBRE_MES[numeroMes - 1]} de ${anio}`
    }
  }

  if (inicio && fin && inicio > fin) {
    throw errorHttp(
      'El rango de fechas no es valido: la fecha de inicio (desde) es posterior a la fecha de fin (hasta)',
      400,
      { codigo: 'RANGO_INVALIDO' }
    )
  }
  let etiqueta = 'Todos los movimientos'
  if (inicio && fin) etiqueta = `Del ${inicio} al ${fin}`
  else if (inicio) etiqueta = `Desde el ${inicio}`
  else if (fin) etiqueta = `Hasta el ${fin}`
  return { desde: inicio ?? null, hasta: fin ?? null, mes: null, etiqueta }
}

/**
 * Estado de cuenta de un inmueble en un periodo (mes o rango de fechas).
 *
 * - `movimientos`: lo ocurrido en el periodo, en orden cronologico (los mas antiguos primero), con
 *   su saldo corrido: expensas (con tarifa y agua por separado), moras, pagos (con la obligacion a
 *   la que se aplicaron y lo que queda de ella), saldo a favor generado y su aplicacion.
 * - `saldoAnterior` / `resumenPeriodo.saldoFinal`: de donde se parte y a donde se llega, sin contar
 *   dos veces ningun movimiento. Si lo adeudado esta cubierto, `saldoAdeudado` es 0, y si el saldo
 *   a favor supera la deuda se muestra el saldo a favor restante, no una deuda inexistente.
 * - `deudasPendientes`: obligaciones que no se pagaron completas al cierre del periodo.
 * - `expensas`, `movimientosSaldo` y `resumen` conservan el formato anterior.
 */
async function obtenerEstadoCuenta(inmuebleId, { desde, hasta, mes } = {}) {
  const periodo = resolverPeriodo({ desde, hasta, mes })
  const inmueble = await obtenerInmueble(inmuebleId)

  const [expensas, movimientosSaldo, ocupantes, saldoFavor, periodoReciente, { planes: planesPago }] = await Promise.all([
    prisma.expensa.findMany({
      where: { inmuebleId },
      include: {
        pagos: { include: { recibo: { select: { folioNumero: true } } }, orderBy: { fechaPago: 'asc' } },
        moras: { orderBy: { numero: 'asc' } },
        cargos: { orderBy: [{ clase: 'asc' }, { codigo: 'asc' }] },
        cambiosVencimiento: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { periodo: 'asc' }
    }),
    prisma.movimientoSaldo.findMany({
      where: { inmuebleId },
      include: { recibo: { select: { folioNumero: true, fechaPago: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.ocupanteInmueble.findMany({
      where: { inmuebleId, ...filtroOcupanteVigente() },
      include: { copropietario: { select: { id: true, nombre: true, apellido: true, ci: true, email: true, telefono: true } } },
      orderBy: [{ esPropietario: 'desc' }, { fechaInicio: 'asc' }]
    }),
    saldoFavorDe(prisma, inmuebleId),
    periodoMasReciente(prisma, inmuebleId),
    planesPagoService.listar({ inmuebleId })
  ])

  const dentroDelPeriodo = (fechaIso) =>
    (!periodo.desde || fechaIso >= periodo.desde) && (!periodo.hasta || fechaIso <= periodo.hasta)

  const libro = armarLibro(
    construirEventos({
      expensas,
      abonosSaldo: movimientosSaldo.filter((m) => m.tipo === 'PAGO_ANTICIPADO' || m.tipo === 'EXCESO_PAGO'),
      formatearFolio
    }),
    { desde: periodo.desde, hasta: periodo.hasta }
  )

  let totalFacturado = new Decimal(0)
  let totalAgua = new Decimal(0)
  let totalMora = new Decimal(0)
  let totalPagado = new Decimal(0)
  let deudaPendiente = new Decimal(0)

  const filas = expensas
    .filter((e) => dentroDelPeriodo(fechaCalendario(e.fechaVencimiento)))
    .map((e) => {
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
        montoBase: e.montoBase, // suma de los cargos (departamento + baulera/parqueo)
        // Una linea por concepto: la cuota del departamento y la de cada baulera o parqueo.
        cargos: e.cargos.map((cargo) => ({
          id: cargo.id,
          clase: cargo.clase,
          codigo: cargo.codigo,
          inmuebleId: cargo.inmuebleId,
          monto: new Decimal(cargo.monto).toFixed(2)
        })),
        montoAgua: e.montoAgua,
        aguaRegistradaEn: e.aguaRegistradaEn,
        montoTotal: e.montoTotal, // expensa fija + agua (sin mora)
        montoMora: e.montoMora,
        planPagoId: e.planPagoId,
        pagado: pagado.toFixed(2),
        pagadoMora: sumarCampo(e.pagos, 'montoMora').toFixed(2),
        pagadoExpensa: sumarCampo(e.pagos, 'montoExpensa').toFixed(2),
        pendiente: pendientes.total.toFixed(2),
        pendienteMora: pendientes.mora.toFixed(2),
        pendienteExpensa: pendientes.expensa.toFixed(2),
        moras: detalleMoras(e.moras, sumarCampo(e.pagos, 'montoMora')),
        pagos: e.pagos.map(({ recibo, ...pago }) => pago)
      }
    })

  const saldoNeto = deudaPendiente.minus(saldoFavor)
  const movimientosSaldoPeriodo = movimientosSaldo
    .filter((m) => dentroDelPeriodo(new Date(m.createdAt).toISOString().slice(0, 10)))
    .map(({ recibo, ...movimiento }) => movimiento)

  const sinMovimientos = libro.movimientos.length === 0

  return {
    inmueble: resumenInmueble(inmueble),
    // Quien ocupa hoy el inmueble; el responsable es el propietario vigente (si no hay, el inquilino).
    ocupantes: ocupantes.map((o) => ({
      id: o.copropietario.id,
      nombre: o.copropietario.nombre,
      apellido: o.copropietario.apellido,
      ci: o.copropietario.ci,
      email: o.copropietario.email,
      telefono: o.copropietario.telefono,
      rol: o.esPropietario ? 'PROPIETARIO' : 'INQUILINO'
    })),
    responsable: ocupantes[0]
      ? {
          id: ocupantes[0].copropietario.id,
          nombre: `${ocupantes[0].copropietario.nombre} ${ocupantes[0].copropietario.apellido}`,
          rol: ocupantes[0].esPropietario ? 'PROPIETARIO' : 'INQUILINO'
        }
      : null,
    periodo: { desde: periodo.desde, hasta: periodo.hasta, mes: periodo.mes, etiqueta: periodo.etiqueta },
    rango: { desde: periodo.desde, hasta: periodo.hasta },
    generadoEn: new Date().toISOString(),
    sinMovimientos,
    mensaje: sinMovimientos ? 'No existen movimientos para el periodo seleccionado' : null,
    saldoAnterior: libro.saldoAnterior,
    movimientos: libro.movimientos,
    deudasPendientes: libro.deudasPendientes,
    resumenPeriodo: {
      saldoAnterior: libro.saldoAnterior.saldoNeto,
      totalCargos: libro.totalCargos,
      totalAbonos: libro.totalAbonos,
      saldoFinal: libro.saldoFinal
    },
    expensas: filas,
    // Planes de pago del inmueble (todos los estados, sin filtrar por periodo), tal como los presenta
    // GET /planes-pago: cada cuota con su estado, lo pagado y su saldo.
    planesPago,
    movimientosSaldo: movimientosSaldoPeriodo,
    resumen: {
      totalFacturado: totalFacturado.toFixed(2),
      totalAgua: totalAgua.toFixed(2),
      totalMora: totalMora.toFixed(2),
      totalPagado: totalPagado.toFixed(2),
      deudaPendiente: deudaPendiente.toFixed(2),
      saldoFavor: saldoFavor.toFixed(2), // saldo a favor vigente hoy, no depende del rango
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
