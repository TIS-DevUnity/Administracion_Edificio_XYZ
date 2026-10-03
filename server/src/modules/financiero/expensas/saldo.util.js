const { Prisma } = require('@prisma/client')
const { fechaEnZona } = require('./mora.util')

const Decimal = Prisma.Decimal
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const TOLERANCIA_RELOJ_MS = 60 * 1000 // un pago con hora "de hace un momento" no es futuro

// SALDO_A_FAVOR lo asigna el sistema al usar un saldo previo; nadie lo puede elegir a mano.
const METODOS_PAGO_MANUALES = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']
const MONTO_MAXIMO = new Decimal('99999999.99') // limite de DECIMAL(10,2)
const MAX_LARGO_REFERENCIA = 200

function errorHttp(mensaje, status) {
  return Object.assign(new Error(mensaje), { status })
}

/** Convierte un monto recibido (numero o texto) a Decimal y lo valida. */
function parsearMonto(valor, campo = 'monto') {
  if (valor === undefined || valor === null || valor === '' || typeof valor === 'boolean') {
    throw errorHttp(`${campo} es requerido`, 400)
  }

  let monto
  try {
    monto = new Decimal(valor)
  } catch {
    throw errorHttp(`${campo} debe ser un numero`, 400)
  }

  if (!monto.isFinite()) throw errorHttp(`${campo} debe ser un numero`, 400)
  if (monto.lte(0)) throw errorHttp(`${campo} debe ser mayor que cero`, 400)
  if (monto.decimalPlaces() > 2) throw errorHttp(`${campo} admite como maximo 2 decimales`, 400)
  if (monto.gt(MONTO_MAXIMO)) throw errorHttp(`${campo} supera el maximo permitido`, 400)

  return monto
}

function validarMetodoPago(metodoPago) {
  if (!METODOS_PAGO_MANUALES.includes(metodoPago)) {
    throw errorHttp(`metodoPago invalido. Valores permitidos: ${METODOS_PAGO_MANUALES.join(', ')}`, 400)
  }
}

function normalizarReferencia(referencia) {
  if (referencia === undefined || referencia === null || referencia === '') return null
  if (typeof referencia !== 'string') throw errorHttp('referencia debe ser un texto', 400)
  const texto = referencia.trim()
  if (texto.length > MAX_LARGO_REFERENCIA) {
    throw errorHttp(`referencia no puede superar ${MAX_LARGO_REFERENCIA} caracteres`, 400)
  }
  return texto || null
}

/**
 * Fecha en que se hizo el pago. Acepta YYYY-MM-DD (dia en hora de Bolivia) o un ISO
 * completo con zona. No puede ser futura. Sin valor: `obligatoria` decide entre error
 * y "ahora".
 */
function parsearFechaPago(valor, { obligatoria = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatoria) throw errorHttp('fechaPago es requerida', 400)
    return new Date()
  }
  if (typeof valor !== 'string') {
    throw errorHttp('fechaPago debe ser un texto con formato YYYY-MM-DD', 400)
  }

  const texto = valor.trim()
  const ahora = new Date()
  let fecha

  if (SOLO_FECHA.test(texto)) {
    // Se compara el dia de calendario para no rechazar "hoy" por un tema de horas.
    const dia = new Date(`${texto}T00:00:00Z`)
    if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== texto) {
      throw errorHttp('fechaPago no es una fecha valida', 400)
    }
    if (texto > fechaEnZona(ahora)) throw errorHttp('fechaPago no puede ser futura', 400)
    // Hoy conserva la hora real; un dia anterior se guarda a mediodia de Bolivia.
    fecha = texto === fechaEnZona(ahora) ? ahora : new Date(`${texto}T12:00:00-04:00`)
  } else {
    fecha = new Date(texto)
    if (Number.isNaN(fecha.getTime()) || !/(Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
      throw errorHttp('fechaPago debe tener el formato YYYY-MM-DD', 400)
    }
    if (fecha.getTime() > ahora.getTime() + TOLERANCIA_RELOJ_MS) {
      throw errorHttp('fechaPago no puede ser futura', 400)
    }
  }
  return fecha
}

/** Folio imprimible de un recibo: REC-000123. */
function formatearFolio(folioNumero) {
  return `REC-${String(folioNumero).padStart(6, '0')}`
}

/**
 * Estado de un cobro segun las expensas que toco: PAGADO si todas quedaron saldadas,
 * PAGO_PARCIAL si alguna sigue con deuda, SALDO_A_FAVOR si no cubrio ninguna expensa
 * (todo el dinero quedo como saldo a favor).
 */
function estadoPagoDe(estadosExpensas) {
  if (estadosExpensas.length === 0) return 'SALDO_A_FAVOR'
  return estadosExpensas.every((estado) => estado === 'PAGADA') ? 'PAGADO' : 'PAGO_PARCIAL'
}

/** Datos del recibo que se devuelven al cliente (con el folio ya formateado). */
function resumenRecibo(recibo) {
  return {
    id: recibo.id,
    folio: formatearFolio(recibo.folioNumero),
    montoTotal: new Decimal(recibo.montoTotal).toFixed(2),
    metodoPago: recibo.metodoPago,
    referencia: recibo.referencia,
    fechaPago: recibo.fechaPago,
    tieneComprobante: Boolean(recibo.comprobantePath),
    urlPdf: `/api/financiero/recibos/${recibo.id}/pdf`
  }
}

function sumarPagos(pagos = []) {
  return pagos.reduce((acc, p) => acc.plus(p.monto), new Decimal(0))
}

/**
 * Estado que le corresponde a una expensa segun lo pagado. Una expensa con mora
 * aplicada se mantiene VENCIDA hasta pagarse completa: asi un pago parcial no la
 * devuelve a PARCIAL (lo que hacia que el cron la re-procesara y re-notificara).
 */
function calcularEstado({ montoTotal, montoMora, totalPagado }) {
  const adeudado = new Decimal(montoTotal).plus(montoMora)
  if (new Decimal(totalPagado).gte(adeudado)) return 'PAGADA'
  if (new Decimal(montoMora).gt(0)) return 'VENCIDA'
  if (new Decimal(totalPagado).gt(0)) return 'PARCIAL'
  return 'PENDIENTE'
}

// Bloqueos de fila para que dos operaciones simultaneas sobre el mismo inmueble o la
// misma expensa se ejecuten una tras otra. Orden fijo (inmueble -> expensa) para
// evitar deadlocks.
async function bloquearInmueble(tx, inmuebleId) {
  await tx.$queryRaw`SELECT "id" FROM "inmuebles" WHERE "id" = ${inmuebleId} FOR UPDATE`
}

async function bloquearExpensa(tx, expensaId) {
  await tx.$queryRaw`SELECT "id" FROM "expensas" WHERE "id" = ${expensaId} FOR UPDATE`
}

/**
 * Bloquea todas las expensas con deuda de un inmueble, de la mas antigua a la mas nueva.
 * Se usa despues de `bloquearInmueble`; asi una mora aplicada en paralelo no cambia lo
 * adeudado mientras se reparte un pago.
 */
async function bloquearExpensasConDeuda(tx, inmuebleId) {
  await tx.$queryRaw`
    SELECT "id" FROM "expensas"
    WHERE "inmuebleId" = ${inmuebleId} AND "estado" <> 'PAGADA'
    ORDER BY "fechaVencimiento" ASC, "periodo" ASC
    FOR UPDATE`
}

/** Expensas con deuda de un inmueble, la mas antigua primero (ya con `pagos`). */
function expensasConDeudaOrdenadas(tx, inmuebleId) {
  return tx.expensa.findMany({
    where: { inmuebleId, estado: { not: 'PAGADA' } },
    include: { pagos: true },
    orderBy: [{ fechaVencimiento: 'asc' }, { periodo: 'asc' }]
  })
}

/** Crea el recibo (folio) de una operacion de cobro. Debe llamarse dentro de la transaccion. */
function crearRecibo(tx, { inmuebleId, montoTotal, metodoPago, referencia, fechaPago, usuarioId }) {
  return tx.recibo.create({
    data: {
      inmuebleId,
      montoTotal,
      metodoPago,
      referencia,
      fechaPago,
      registradoPorId: usuarioId
    }
  })
}

/**
 * Reparte `monto` entre las expensas recibidas, en el orden en que llegan (la mas antigua
 * primero): cada una se cubre completa antes de pasar a la siguiente. Crea un `Pago` por
 * expensa tocada y actualiza su estado. Devuelve lo que sobro. Debe llamarse dentro de una
 * transaccion con inmueble y expensas ya bloqueados; cada expensa debe traer `pagos`.
 */
async function repartirPago(tx, { reciboId, expensas, monto, metodoPago, referencia, fechaPago, usuarioId }) {
  let restante = new Decimal(monto)
  const aplicaciones = []

  for (const expensa of expensas) {
    const adeudado = new Decimal(expensa.montoTotal).plus(expensa.montoMora)
    const pagado = sumarPagos(expensa.pagos)
    const pendiente = Decimal.max(adeudado.minus(pagado), new Decimal(0))

    if (pendiente.lte(0)) {
      // Nada que cobrar: solo se corrige el estado si estaba desactualizado.
      const estado = calcularEstado({ montoTotal: expensa.montoTotal, montoMora: expensa.montoMora, totalPagado: pagado })
      if (estado !== expensa.estado) {
        await tx.expensa.update({ where: { id: expensa.id }, data: { estado } })
        aplicaciones.push({ expensa, pago: null, aplicado: new Decimal(0), estadoAnterior: expensa.estado, estado })
      }
      continue
    }
    if (restante.lte(0)) break

    const aplicado = Decimal.min(restante, pendiente)
    const pago = await tx.pago.create({
      data: {
        expensaId: expensa.id,
        reciboId,
        monto: aplicado,
        metodoPago,
        referencia,
        fechaPago,
        registradoPorId: usuarioId
      }
    })
    const estado = calcularEstado({
      montoTotal: expensa.montoTotal,
      montoMora: expensa.montoMora,
      totalPagado: pagado.plus(aplicado)
    })
    await tx.expensa.update({ where: { id: expensa.id }, data: { estado } })

    aplicaciones.push({ expensa, pago, aplicado, estadoAnterior: expensa.estado, estado })
    restante = restante.minus(aplicado)
  }

  return { aplicaciones, restante }
}

/** Saldo a favor vigente de un inmueble: suma de abonos (+) y usos (-). */
async function saldoFavorDe(db, inmuebleId) {
  const { _sum } = await db.movimientoSaldo.aggregate({
    where: { inmuebleId },
    _sum: { monto: true }
  })
  return new Decimal(_sum.monto ?? 0)
}

/**
 * Usa el saldo a favor del inmueble para cubrir lo que falte de una expensa.
 * Debe llamarse dentro de una transaccion con el inmueble ya bloqueado.
 * `expensa` debe traer `pagos`.
 */
async function aplicarSaldoAExpensa(tx, expensa, usuarioId = null) {
  const adeudado = new Decimal(expensa.montoTotal).plus(expensa.montoMora)
  const pagado = sumarPagos(expensa.pagos)
  const pendiente = adeudado.minus(pagado)
  if (pendiente.lte(0)) return { aplicado: new Decimal(0) }

  const saldo = await saldoFavorDe(tx, expensa.inmuebleId)
  if (saldo.lte(0)) return { aplicado: new Decimal(0) }

  const aplicado = Decimal.min(saldo, pendiente)

  const pago = await tx.pago.create({
    data: {
      expensaId: expensa.id,
      monto: aplicado,
      metodoPago: 'SALDO_A_FAVOR',
      referencia: 'Aplicacion de saldo a favor',
      registradoPorId: usuarioId
    }
  })

  const movimiento = await tx.movimientoSaldo.create({
    data: {
      inmuebleId: expensa.inmuebleId,
      tipo: 'APLICACION_EXPENSA',
      monto: aplicado.negated(),
      expensaId: expensa.id,
      registradoPorId: usuarioId
    }
  })

  const estado = calcularEstado({
    montoTotal: expensa.montoTotal,
    montoMora: expensa.montoMora,
    totalPagado: pagado.plus(aplicado)
  })
  await tx.expensa.update({ where: { id: expensa.id }, data: { estado } })

  return { aplicado, pago, movimiento, estado }
}

module.exports = {
  Decimal,
  errorHttp,
  METODOS_PAGO_MANUALES,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  parsearFechaPago,
  formatearFolio,
  estadoPagoDe,
  resumenRecibo,
  sumarPagos,
  calcularEstado,
  bloquearInmueble,
  bloquearExpensa,
  bloquearExpensasConDeuda,
  expensasConDeudaOrdenadas,
  crearRecibo,
  repartirPago,
  saldoFavorDe,
  aplicarSaldoAExpensa
}
