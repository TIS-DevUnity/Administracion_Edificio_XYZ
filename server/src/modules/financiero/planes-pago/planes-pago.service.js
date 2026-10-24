/**
 * PLANES DE PAGO EN CUOTAS (HU3 - CA11).
 *
 * El administrador acuerda con un residente dividir su deuda en varias cuotas, cada una con su
 * importe, su fecha de vencimiento, su saldo y su estado (PENDIENTE, PARCIAL, PAGADA o VENCIDA).
 *
 * Reglas
 *  - El plan cubre la deuda (mora incluida) de una o mas expensas del departamento, y el importe
 *    total acordado debe ser igual a esa deuda. La suma de las cuotas debe ser igual al total.
 *  - Mientras el plan esta activo las expensas que cubre se cobran solo a traves de sus cuotas:
 *    no entran en el pago normal, no generan mora nueva y no se les cambia el agua. Una cuota
 *    vencida se marca VENCIDA (no genera mora aparte).
 *  - Un pago al plan se aplica a las cuotas de la mas antigua a la mas nueva y, a la vez, cubre las
 *    expensas del plan (mora primero, la mas antigua primero), con su recibo y su historial.
 *  - Un plan sin pagos se puede cancelar: sus expensas vuelven al cobro normal.
 */
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
  respuestaDuplicada,
  parsearFechaPago,
  formatearFolio,
  resumenRecibo,
  crearRecibo,
  repartirPago,
  pendientesDe,
  bloquearInmueble,
  bloquearExpensasConDeuda,
  expensasConDeudaOrdenadas
} = require('../expensas/saldo.util')
const { fechaEnZona, fechaCalendario, sumarMeses } = require('../expensas/mora.util')
const campanita = require('../notificaciones/campanita.service')

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MIN_CUOTAS = 2
const MAX_CUOTAS = 60
const MAX_OBSERVACION = 300
const OPCIONES_TX = { timeout: 20000 }
const ESTADOS_PLAN = ['ACTIVO', 'COMPLETADO', 'CANCELADO']
const CERO = new Decimal(0)

const INCLUIR_PLAN = {
  inmueble: { select: { id: true, codigo: true } },
  registradoPor: { select: { id: true, nombre: true, apellido: true } },
  expensas: {
    include: { pagos: true },
    orderBy: [{ fechaVencimiento: 'asc' }, { periodo: 'asc' }]
  },
  cuotas: {
    include: { pagos: { include: { recibo: { select: { id: true, folioNumero: true, fechaPago: true } } }, orderBy: { createdAt: 'asc' } } },
    orderBy: { numero: 'asc' }
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function dinero(valor) {
  return new Decimal(valor).toFixed(2)
}

function validarFecha(valor, campo) {
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor.trim())) {
    throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
  }
  const texto = valor.trim()
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return texto
}

/** Estado de una cuota segun lo pagado y la fecha de hoy (YYYY-MM-DD, hora de Bolivia). */
function estadoDeCuota({ monto, montoPagado, fechaVencimiento }, hoy) {
  if (new Decimal(montoPagado).gte(monto)) return 'PAGADA'
  if (fechaCalendario(fechaVencimiento) < hoy) return 'VENCIDA'
  if (new Decimal(montoPagado).gt(0)) return 'PARCIAL'
  return 'PENDIENTE'
}

/**
 * Cuotas del plan a partir de lo que envia el administrador: una lista explicita
 * (`cuotas: [{ monto, fechaVencimiento }]`) o `cantidadCuotas` + `primerVencimiento` para cuotas
 * iguales una por mes. Valida cantidad, importes, fechas y que la suma sea el total acordado.
 */
function armarCuotas({ cuotas, cantidadCuotas, primerVencimiento, total, hoy }) {
  let items
  if (Array.isArray(cuotas) && cuotas.length > 0) {
    items = cuotas.map((cuota, i) => ({
      monto: parsearMonto(cuota?.monto, `cuotas[${i}].monto`),
      fecha: validarFecha(cuota?.fechaVencimiento, `cuotas[${i}].fechaVencimiento`)
    }))
  } else if (cantidadCuotas !== undefined && cantidadCuotas !== null && cantidadCuotas !== '') {
    const n = Number(cantidadCuotas)
    if (!Number.isInteger(n) || n < MIN_CUOTAS || n > MAX_CUOTAS) {
      throw errorHttp(`cantidadCuotas debe ser un entero entre ${MIN_CUOTAS} y ${MAX_CUOTAS}`, 400)
    }
    const primera = validarFecha(primerVencimiento, 'primerVencimiento')
    const base = total.div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN)
    items = Array.from({ length: n }, (_, i) => ({
      monto: i === n - 1 ? total.minus(base.times(n - 1)) : base,
      fecha: sumarMeses(primera, i)
    }))
  } else {
    throw errorHttp(
      'Indique las cuotas (cuotas: [{ monto, fechaVencimiento }]) o cantidadCuotas y primerVencimiento',
      400,
      { codigo: 'CUOTAS_REQUERIDAS' }
    )
  }

  if (items.length < MIN_CUOTAS || items.length > MAX_CUOTAS) {
    throw errorHttp(`El plan debe tener entre ${MIN_CUOTAS} y ${MAX_CUOTAS} cuotas`, 400, { codigo: 'CANTIDAD_CUOTAS' })
  }

  const suma = items.reduce((acc, item) => acc.plus(item.monto), CERO)
  if (!suma.equals(total)) {
    throw errorHttp(
      `La suma de las cuotas (Bs ${dinero(suma)}) no coincide con el importe total acordado (Bs ${dinero(total)})`,
      400,
      { codigo: 'SUMA_CUOTAS', detalle: { sumaCuotas: dinero(suma), montoTotal: dinero(total) } }
    )
  }

  items.forEach((item, i) => {
    if (i > 0 && item.fecha <= items[i - 1].fecha) {
      throw errorHttp('Las fechas de vencimiento de las cuotas deben ir en orden, una despues de la otra', 400, {
        codigo: 'FECHAS_CUOTAS'
      })
    }
  })
  if (items[0].fecha < hoy) {
    throw errorHttp('La primera cuota no puede vencer antes de hoy', 400, { codigo: 'FECHAS_CUOTAS' })
  }

  return items.map((item, i) => ({ numero: i + 1, monto: item.monto, fechaVencimiento: new Date(`${item.fecha}T00:00:00Z`) }))
}

/** Forma publica de un plan, con el estado de cada cuota calculado a hoy. */
function presentar(plan, hoy = fechaEnZona()) {
  const cuotas = plan.cuotas.map((cuota) => {
    const saldo = new Decimal(cuota.monto).minus(cuota.montoPagado)
    return {
      id: cuota.id,
      numero: cuota.numero,
      monto: dinero(cuota.monto),
      montoPagado: dinero(cuota.montoPagado),
      saldoPendiente: dinero(saldo.gt(0) ? saldo : CERO),
      fechaVencimiento: fechaCalendario(cuota.fechaVencimiento),
      estado: plan.estado === 'CANCELADO' ? cuota.estado : estadoDeCuota(cuota, hoy),
      pagos: (cuota.pagos ?? []).map((p) => ({
        reciboId: p.reciboId,
        folio: p.recibo ? formatearFolio(p.recibo.folioNumero) : null,
        monto: dinero(p.monto),
        fecha: p.recibo?.fechaPago ?? p.createdAt
      }))
    }
  })

  const pagado = plan.cuotas.reduce((acc, c) => acc.plus(c.montoPagado), CERO)
  const saldo = new Decimal(plan.montoTotal).minus(pagado)
  const siguiente = cuotas.find((c) => c.estado !== 'PAGADA')

  return {
    id: plan.id,
    inmueble: plan.inmueble,
    estado: plan.estado,
    observacion: plan.observacion,
    montoTotal: dinero(plan.montoTotal),
    cantidadCuotas: plan.cantidadCuotas,
    totalPagado: dinero(pagado),
    // Saldo total del acuerdo: lo que falta pagar entre todas las cuotas.
    saldoPendiente: dinero(plan.estado === 'CANCELADO' ? CERO : saldo.gt(0) ? saldo : CERO),
    cuotasVencidas: cuotas.filter((c) => c.estado === 'VENCIDA').length,
    proximaCuota: plan.estado === 'ACTIVO' && siguiente ? { numero: siguiente.numero, saldoPendiente: siguiente.saldoPendiente, fechaVencimiento: siguiente.fechaVencimiento, estado: siguiente.estado } : null,
    expensas: (plan.expensas ?? []).map((e) => ({
      id: e.id,
      periodo: e.periodo,
      estado: e.estado,
      montoTotal: dinero(e.montoTotal),
      montoMora: dinero(e.montoMora),
      pendiente: dinero(pendientesDe(e).total)
    })),
    cuotas,
    registradoPor: plan.registradoPor ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  }
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/**
 * Crea un plan de pagos para un departamento. Cubre las expensas indicadas (`expensaIds`) o, si no
 * se indican, toda su deuda pendiente que no este ya en otro plan.
 */
async function crear({ inmuebleId, expensaIds, montoTotal, cuotas, cantidadCuotas, primerVencimiento, observacion, usuarioId, ip }) {
  if (typeof inmuebleId !== 'string' || !inmuebleId.trim()) {
    throw errorHttp('inmuebleId es requerido', 400)
  }
  let observacionLimpia = null
  if (observacion !== undefined && observacion !== null && observacion !== '') {
    if (typeof observacion !== 'string' || observacion.trim().length > MAX_OBSERVACION) {
      throw errorHttp(`observacion debe ser un texto de hasta ${MAX_OBSERVACION} caracteres`, 400)
    }
    observacionLimpia = observacion.trim() || null
  }
  const hoy = fechaEnZona()

  const inmueble = await prisma.inmueble.findUnique({ where: { id: inmuebleId.trim() } })
  if (!inmueble) {
    throw errorHttp('Inmueble no encontrado', 404)
  }
  if (inmueble.clase !== 'DEPARTAMENTO') {
    throw errorHttp(`El inmueble ${inmueble.codigo} no es un departamento: solo los departamentos pagan expensa`, 409)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, inmueble.id)
    await bloquearExpensasConDeuda(tx, inmueble.id)
    const conDeuda = await expensasConDeudaOrdenadas(tx, inmueble.id)
    if (conDeuda.length === 0) {
      throw errorHttp(`El departamento ${inmueble.codigo} no tiene deuda pendiente para financiar`, 409, { codigo: 'SIN_DEUDA' })
    }

    let elegidas = conDeuda
    if (expensaIds !== undefined && expensaIds !== null) {
      if (!Array.isArray(expensaIds) || expensaIds.length === 0) {
        throw errorHttp('expensaIds debe ser una lista con al menos una expensa', 400)
      }
      const pedidas = new Set(expensaIds)
      const noDisponibles = [...pedidas].filter((id) => !conDeuda.some((e) => e.id === id))
      if (noDisponibles.length > 0) {
        throw errorHttp(
          'Algunas expensas no se pueden incluir: no son de este departamento, ya estan pagadas o ya estan en otro plan de pagos',
          409,
          { codigo: 'EXPENSAS_NO_DISPONIBLES', detalle: { expensaIds: noDisponibles } }
        )
      }
      elegidas = conDeuda.filter((e) => pedidas.has(e.id))
    }

    const deuda = elegidas.reduce((acc, e) => acc.plus(pendientesDe(e).total), CERO)
    const total = montoTotal === undefined || montoTotal === null || montoTotal === '' ? deuda : parsearMonto(montoTotal, 'montoTotal')
    if (!total.equals(deuda)) {
      throw errorHttp(
        `El importe total acordado (Bs ${dinero(total)}) debe coincidir con la deuda de las expensas incluidas (Bs ${dinero(deuda)})`,
        400,
        { codigo: 'MONTO_TOTAL', detalle: { montoTotal: dinero(total), deuda: dinero(deuda) } }
      )
    }

    const items = armarCuotas({ cuotas, cantidadCuotas, primerVencimiento, total, hoy })

    const plan = await tx.planPago.create({
      data: {
        inmuebleId: inmueble.id,
        montoTotal: total,
        cantidadCuotas: items.length,
        observacion: observacionLimpia,
        registradoPorId: usuarioId ?? null,
        cuotas: { create: items }
      }
    })
    await tx.expensa.updateMany({ where: { id: { in: elegidas.map((e) => e.id) } }, data: { planPagoId: plan.id } })
    return { plan, elegidas, items, total }
  }, OPCIONES_TX)

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'PlanPago',
    entidadId: resultado.plan.id,
    detalle: {
      inmueble: inmueble.codigo,
      montoTotal: dinero(resultado.total),
      expensas: resultado.elegidas.map((e) => e.periodo),
      cuotas: resultado.items.map((c) => ({
        numero: c.numero,
        monto: dinero(c.monto),
        fechaVencimiento: fechaCalendario(c.fechaVencimiento)
      })),
      observacion: observacionLimpia
    },
    ip
  })

  // Los recordatorios de esas expensas ya no aplican: ahora se cobran por cuotas.
  for (const expensa of resultado.elegidas) {
    await campanita.sincronizarExpensa(expensa.id)
  }

  return obtener(resultado.plan.id)
}

async function buscar(id, db = prisma) {
  const plan = await db.planPago.findUnique({ where: { id }, include: INCLUIR_PLAN })
  if (!plan) {
    throw errorHttp('Plan de pagos no encontrado', 404)
  }
  return plan
}

async function obtener(id) {
  return presentar(await buscar(id))
}

async function listar({ inmuebleId, estado } = {}) {
  if (estado !== undefined && estado !== '' && !ESTADOS_PLAN.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_PLAN.join(', ')}`, 400)
  }
  const planes = await prisma.planPago.findMany({
    where: { ...(inmuebleId ? { inmuebleId } : {}), ...(estado ? { estado } : {}) },
    include: INCLUIR_PLAN,
    orderBy: { createdAt: 'desc' }
  })
  const hoy = fechaEnZona()
  return { planes: planes.map((plan) => presentar(plan, hoy)) }
}

/**
 * Registra un pago al plan. Se aplica a las cuotas (la mas antigua primero) y cubre las expensas
 * del plan. No puede superar el saldo del plan. Con la misma `claveSolicitud` un reenvio no cobra
 * dos veces.
 */
async function registrarPago({ planId, monto, metodoPago, referencia, fechaPago, cuentaId, claveSolicitud, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)
  const clave = normalizarClaveSolicitud(claveSolicitud)

  const yaRegistrado = await buscarReciboPorClave(prisma, clave)
  if (yaRegistrado) return respuestaDuplicada(yaRegistrado)

  const previo = await prisma.planPago.findUnique({ where: { id: planId }, select: { inmuebleId: true } })
  if (!previo) {
    throw errorHttp('Plan de pagos no encontrado', 404)
  }
  const hoy = fechaEnZona()

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearInmueble(tx, previo.inmuebleId)
      await tx.$queryRaw`SELECT "id" FROM "expensas" WHERE "planPagoId" = ${planId} ORDER BY "periodo" FOR UPDATE`

      const plan = await buscar(planId, tx)
      if (plan.estado !== 'ACTIVO') {
        throw errorHttp(
          plan.estado === 'COMPLETADO' ? 'El plan de pagos ya esta completado' : 'El plan de pagos esta cancelado',
          409,
          { codigo: 'PLAN_NO_ACTIVO' }
        )
      }

      const saldoPlan = plan.cuotas.reduce((acc, c) => acc.plus(new Decimal(c.monto).minus(c.montoPagado)), CERO)
      if (montoRecibido.gt(saldoPlan)) {
        throw errorHttp(
          `El monto (Bs ${dinero(montoRecibido)}) supera el saldo pendiente del plan (Bs ${dinero(saldoPlan)})`,
          409,
          { codigo: 'MONTO_SUPERA_PLAN', detalle: { saldoPlan: dinero(saldoPlan), montoRecibido: dinero(montoRecibido) } }
        )
      }

      const recibo = await crearRecibo(tx, {
        inmuebleId: plan.inmuebleId,
        montoTotal: montoRecibido,
        metodoPago,
        referencia: referenciaLimpia,
        fechaPago: fecha,
        usuarioId,
        claveSolicitud: clave,
        cuentaId
      })

      // Cubre las expensas del plan: la mas antigua primero y, en cada una, primero la mora.
      const { aplicaciones, restante } = await repartirPago(tx, {
        reciboId: recibo.id,
        expensas: plan.expensas,
        monto: montoRecibido,
        metodoPago,
        referencia: referenciaLimpia,
        fechaPago: fecha,
        usuarioId
      })
      if (restante.gt(0)) {
        throw errorHttp('El plan no coincide con la deuda de sus expensas: revise el plan antes de cobrar', 409, {
          codigo: 'PLAN_DESAJUSTADO'
        })
      }

      // Reparte el pago entre las cuotas, de la mas antigua a la mas nueva.
      let porAplicar = montoRecibido
      const aplicacionesCuotas = []
      const cuotasActualizadas = []
      for (const cuota of plan.cuotas) {
        const pendiente = new Decimal(cuota.monto).minus(cuota.montoPagado)
        let montoPagado = new Decimal(cuota.montoPagado)
        if (pendiente.gt(0) && porAplicar.gt(0)) {
          const aplicado = Decimal.min(porAplicar, pendiente)
          montoPagado = montoPagado.plus(aplicado)
          porAplicar = porAplicar.minus(aplicado)
          const estado = estadoDeCuota({ monto: cuota.monto, montoPagado, fechaVencimiento: cuota.fechaVencimiento }, hoy)
          await tx.cuotaPlan.update({ where: { id: cuota.id }, data: { montoPagado, estado } })
          await tx.pagoCuota.create({ data: { cuotaId: cuota.id, reciboId: recibo.id, monto: aplicado } })
          aplicacionesCuotas.push({ numero: cuota.numero, montoAplicado: aplicado, estado })
        }
        cuotasActualizadas.push({ numero: cuota.numero, monto: cuota.monto, montoPagado })
      }

      const completo = cuotasActualizadas.every((c) => new Decimal(c.montoPagado).gte(c.monto))
      if (completo) {
        await tx.planPago.update({ where: { id: planId }, data: { estado: 'COMPLETADO' } })
      }

      return { plan, recibo, aplicaciones, aplicacionesCuotas, completo }
    }, OPCIONES_TX)
  } catch (err) {
    if (err.code === 'P2002' && clave) {
      const yaRegistradoAhora = await buscarReciboPorClave(prisma, clave)
      if (yaRegistradoAhora) return respuestaDuplicada(yaRegistradoAhora)
    }
    throw err
  }

  const { plan, recibo, aplicaciones, aplicacionesCuotas, completo } = resultado
  const folio = formatearFolio(recibo.folioNumero)
  const conPago = aplicaciones.filter((a) => a.pago)

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Recibo',
    entidadId: recibo.id,
    detalle: {
      folio,
      inmueble: plan.inmueble.codigo,
      planPagoId: plan.id,
      montoRecibido: montoRecibido.toFixed(2),
      fechaPago: recibo.fechaPago.toISOString(),
      metodoPago,
      referencia: referenciaLimpia,
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
        planPagoId: plan.id,
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
  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'PlanPago',
    entidadId: plan.id,
    detalle: {
      motivo: 'PAGO',
      folio,
      monto: montoRecibido.toFixed(2),
      cuotas: aplicacionesCuotas.map((c) => ({ numero: c.numero, montoAplicado: c.montoAplicado.toFixed(2), estado: c.estado })),
      ...(completo ? { estado: { antes: 'ACTIVO', despues: 'COMPLETADO' } } : {})
    },
    ip
  })

  await campanita.avisarPago({
    recibo,
    inmuebleId: plan.inmuebleId,
    aplicaciones: conPago.map((a) => ({ expensaId: a.expensa.id, monto: a.aplicado })),
    saldoFavorGenerado: null
  })

  return {
    recibo: resumenRecibo(recibo),
    montoRecibido: montoRecibido.toFixed(2),
    aplicacionesCuotas: aplicacionesCuotas.map((c) => ({ numero: c.numero, montoAplicado: c.montoAplicado.toFixed(2), estado: c.estado })),
    aplicacionesExpensas: conPago.map((a) => ({
      expensaId: a.expensa.id,
      periodo: a.expensa.periodo,
      montoAplicado: a.aplicado.toFixed(2),
      montoMora: a.aplicadoMora.toFixed(2),
      montoExpensa: a.aplicadoExpensa.toFixed(2),
      estado: a.estado
    })),
    plan: await obtener(planId),
    mensaje: completo ? 'Pago registrado: el plan de pagos quedo completado' : 'Pago registrado exitosamente'
  }
}

/** Cancela un plan que todavia no recibio pagos: sus expensas vuelven al cobro normal. */
async function cancelar(planId, { usuarioId, ip }) {
  const previo = await prisma.planPago.findUnique({ where: { id: planId }, select: { inmuebleId: true } })
  if (!previo) {
    throw errorHttp('Plan de pagos no encontrado', 404)
  }

  const liberadas = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previo.inmuebleId)
    await tx.$queryRaw`SELECT "id" FROM "expensas" WHERE "planPagoId" = ${planId} ORDER BY "periodo" FOR UPDATE`
    const plan = await buscar(planId, tx)
    if (plan.estado !== 'ACTIVO') {
      throw errorHttp('Solo se puede cancelar un plan activo', 409, { codigo: 'PLAN_NO_ACTIVO' })
    }
    if (plan.cuotas.some((c) => new Decimal(c.montoPagado).gt(0))) {
      throw errorHttp('El plan ya tiene pagos registrados: no se puede cancelar', 409, { codigo: 'PLAN_CON_PAGOS' })
    }
    await tx.planPago.update({ where: { id: planId }, data: { estado: 'CANCELADO' } })
    await tx.expensa.updateMany({ where: { planPagoId: planId }, data: { planPagoId: null } })
    return plan.expensas
  }, OPCIONES_TX)

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'PlanPago',
    entidadId: planId,
    detalle: { motivo: 'CANCELACION', estado: { antes: 'ACTIVO', despues: 'CANCELADO' }, expensas: liberadas.map((e) => e.periodo) },
    ip
  })
  for (const expensa of liberadas) {
    await campanita.sincronizarExpensa(expensa.id)
  }
  return obtener(planId)
}

/** Marca como VENCIDAS las cuotas impagas cuya fecha ya paso (lo corre el proceso diario). */
async function marcarCuotasVencidas(hoy = fechaEnZona()) {
  const { count } = await prisma.cuotaPlan.updateMany({
    where: {
      estado: { in: ['PENDIENTE', 'PARCIAL'] },
      fechaVencimiento: { lt: new Date(`${hoy}T00:00:00Z`) },
      plan: { estado: 'ACTIVO' }
    },
    data: { estado: 'VENCIDA' }
  })
  return count
}

module.exports = { estadoDeCuota, crear, obtener, listar, registrarPago, cancelar, marcarCuotasVencidas }
