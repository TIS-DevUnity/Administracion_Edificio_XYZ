const { Prisma } = require('@prisma/client')

const Decimal = Prisma.Decimal

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
  sumarPagos,
  calcularEstado,
  bloquearInmueble,
  bloquearExpensa,
  saldoFavorDe,
  aplicarSaldoAExpensa
}
