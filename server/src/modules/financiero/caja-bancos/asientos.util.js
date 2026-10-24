const { Decimal, errorHttp, formatearFolio } = require('../expensas/saldo.util')
const { ETIQUETA_TIPO, cuentaPorDefecto, tipoDeCuentaPara } = require('./cuentas.util')
const { periodoDe, periodoDeDia, instanteDeDia, periodoAbierto } = require('./periodos.util')

const MAX_LARGO_ID = 100

// Datos del extracto que dejan de valer si cambia el asiento: hay que volver a conciliarlo.
const CAMPOS_EXTRACTO_VACIOS = {
  montoBanco: null,
  fechaBanco: null,
  tipoBanco: null,
  referenciaBanco: null,
  diferencia: null
}

/** `cuentaId` opcional que llega del cliente: null si no vino, texto limpio si vino. Se valida antes de subir archivos. */
function normalizarCuentaId(valor) {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > MAX_LARGO_ID) {
    throw errorHttp('cuentaId debe ser un texto', 400)
  }
  return valor.trim()
}

/** Concepto del asiento de un cobro: "Cobro REC-000123 - A-101" (el mismo texto que usa el backfill). */
function conceptoRecibo(folioNumero, codigoInmueble) {
  const base = `Cobro ${formatearFolio(folioNumero)}`
  return codigoInmueble ? `${base} - ${codigoInmueble}` : base
}

/**
 * Cuenta que recibe un asiento. Sin `cuentaId` se usa la cuenta por defecto de `tipoPorDefecto`.
 * Con `cuentaId` la cuenta debe existir y estar activa; con `exigirTipo` (cobros) ademas debe ser del
 * tipo que corresponde al metodo de pago. `db` es prisma o una transaccion.
 */
async function resolverCuenta(db, { cuentaId, tipoPorDefecto, exigirTipo = false }) {
  const id = normalizarCuentaId(cuentaId)
  if (!id) return cuentaPorDefecto(tipoPorDefecto, db)

  const cuenta = await db.cuentaBancaria.findUnique({ where: { id } })
  if (!cuenta) throw errorHttp('La cuenta indicada (cuentaId) no existe', 400)
  if (!cuenta.activa) {
    throw errorHttp(`La cuenta "${cuenta.nombre}" esta desactivada`, 409, { codigo: 'CUENTA_INACTIVA' })
  }
  if (exigirTipo && cuenta.tipo !== tipoPorDefecto) {
    throw errorHttp(
      `La cuenta "${cuenta.nombre}" es ${ETIQUETA_TIPO[cuenta.tipo].toLowerCase()}, pero este metodo de pago se registra en ${ETIQUETA_TIPO[tipoPorDefecto].toLowerCase()}`,
      400,
      { codigo: 'CUENTA_INCOMPATIBLE', detalle: { tipoCuenta: cuenta.tipo, tipoEsperado: tipoPorDefecto } }
    )
  }
  return cuenta
}

// ---------------------------------------------------------------------------
// Cobros (Recibo)
// ---------------------------------------------------------------------------

/**
 * Antes de crear el recibo: comprueba que el periodo este abierto y decide la cuenta (efectivo a la
 * caja, el resto al banco; o la indicada). Devuelve el destino para `crearAsientoRecibo`.
 */
async function prepararAsientoRecibo(tx, { metodoPago, fechaPago, cuentaId }) {
  const tipo = tipoDeCuentaPara(metodoPago)
  const periodo = periodoDe(fechaPago)
  await periodoAbierto(tx, periodo)
  const cuenta = await resolverCuenta(tx, { cuentaId, tipoPorDefecto: tipo, exigirTipo: true })
  return { cuenta, periodo }
}

/** Crea el asiento (ingreso, PENDIENTE) de un recibo ya creado, en la misma transaccion. */
async function crearAsientoRecibo(tx, recibo, { cuenta, periodo }) {
  const inmueble = await tx.inmueble.findUnique({ where: { id: recibo.inmuebleId }, select: { codigo: true } })
  return tx.movimientoCaja.create({
    data: {
      cuentaId: cuenta.id,
      tipo: 'INGRESO',
      monto: recibo.montoTotal,
      concepto: conceptoRecibo(recibo.folioNumero, inmueble?.codigo),
      fecha: recibo.fechaPago,
      periodo,
      origen: 'RECIBO',
      reciboId: recibo.id,
      referencia: recibo.referencia ?? null,
      registradoPorId: recibo.registradoPorId ?? null
    }
  })
}

// ---------------------------------------------------------------------------
// Movimientos extraordinarios (MovimientoFinanciero)
// ---------------------------------------------------------------------------

/** Antes de crear el movimiento: periodo abierto y cuenta (la indicada o el banco por defecto). */
async function prepararAsientoMovimiento(tx, { fecha, cuentaId }) {
  const periodo = periodoDeDia(fecha)
  await periodoAbierto(tx, periodo)
  const cuenta = await resolverCuenta(tx, { cuentaId, tipoPorDefecto: 'BANCO' })
  return { cuenta, periodo }
}

/** Crea el asiento (PENDIENTE) de un movimiento ya creado, en la misma transaccion. */
function crearAsientoMovimiento(tx, movimiento, { cuenta, periodo }) {
  return tx.movimientoCaja.create({
    data: {
      cuentaId: cuenta.id,
      tipo: movimiento.tipo,
      monto: movimiento.monto,
      concepto: movimiento.concepto,
      fecha: instanteDeDia(movimiento.fecha),
      periodo,
      origen: 'MOVIMIENTO_FINANCIERO',
      movimientoFinancieroId: movimiento.id,
      registradoPorId: movimiento.registradoPorId ?? null
    }
  })
}

/**
 * Compara el asiento con el movimiento ya editado y devuelve lo que hay que cambiar:
 *  - `data`: campos del asiento a actualizar.
 *  - `financiero`: cambio de tipo, monto, fecha o cuenta (lo que afecta a la conciliacion).
 * El concepto solo se copia; no cuenta como cambio financiero.
 */
function calcularCambiosAsiento(asiento, movimiento, cuentaId = null) {
  const data = {}
  let financiero = false

  if (movimiento.tipo !== asiento.tipo) {
    data.tipo = movimiento.tipo
    financiero = true
  }
  if (!new Decimal(movimiento.monto).equals(asiento.monto)) {
    data.monto = movimiento.monto
    financiero = true
  }
  const instante = instanteDeDia(movimiento.fecha)
  if (instante.getTime() !== new Date(asiento.fecha).getTime()) {
    data.fecha = instante
    data.periodo = periodoDeDia(movimiento.fecha)
    financiero = true
  }
  if (cuentaId && cuentaId !== asiento.cuentaId) {
    data.cuentaId = cuentaId
    financiero = true
  }
  if (movimiento.concepto !== asiento.concepto) {
    data.concepto = movimiento.concepto
  }
  return { data, financiero }
}

/**
 * Mantiene el asiento de un movimiento que se edita. Se llama dentro de la transaccion, con el
 * movimiento ya bloqueado y solo cuando se cambio algun dato (no al adjuntar un comprobante):
 *  - el periodo del asiento y el nuevo (si la fecha cambia de mes) deben estar abiertos;
 *  - un asiento CONCILIADO no admite cambios de tipo, monto, fecha ni cuenta (409);
 *  - uno CON_DIFERENCIA que cambia vuelve a PENDIENTE y pierde los datos del extracto (conserva la observacion);
 *  - si el movimiento aun no tiene asiento (anterior al backfill), se crea.
 * `antes` es el movimiento antes de editar; `despues`, ya editado; `cuentaId` es la nueva cuenta (opcional).
 * Devuelve { asiento, cuentaAnteriorId }: `cuentaAnteriorId` solo viene cuando el asiento cambio de cuenta
 * (para auditarlo); en cualquier otro caso es null.
 */
async function sincronizarAsientoMovimiento(tx, { antes, despues, cuentaId = null }) {
  await tx.$queryRaw`SELECT "id" FROM "movimientos_caja" WHERE "movimientoFinancieroId" = ${antes.id} FOR UPDATE`
  const asiento = await tx.movimientoCaja.findUnique({ where: { movimientoFinancieroId: antes.id } })

  if (!asiento) {
    const destino = await prepararAsientoMovimiento(tx, { fecha: despues.fecha, cuentaId })
    return { asiento: await crearAsientoMovimiento(tx, despues, destino), cuentaAnteriorId: null }
  }

  await periodoAbierto(tx, asiento.periodo)
  const { data, financiero } = calcularCambiosAsiento(asiento, despues, cuentaId)
  if (data.periodo && data.periodo !== asiento.periodo) await periodoAbierto(tx, data.periodo)

  if (financiero && asiento.estado === 'CONCILIADO') {
    throw errorHttp(
      'El movimiento ya esta conciliado: no se puede cambiar su tipo, monto, fecha ni cuenta',
      409,
      { codigo: 'ASIENTO_CONCILIADO' }
    )
  }
  if (data.cuentaId) await resolverCuenta(tx, { cuentaId: data.cuentaId })
  if (financiero && asiento.estado === 'CON_DIFERENCIA') {
    Object.assign(data, { estado: 'PENDIENTE', ...CAMPOS_EXTRACTO_VACIOS })
  }

  const cuentaAnteriorId = data.cuentaId ? asiento.cuentaId : null
  if (Object.keys(data).length === 0) return { asiento, cuentaAnteriorId }
  return { asiento: await tx.movimientoCaja.update({ where: { id: asiento.id }, data }), cuentaAnteriorId }
}

module.exports = {
  normalizarCuentaId,
  conceptoRecibo,
  resolverCuenta,
  prepararAsientoRecibo,
  crearAsientoRecibo,
  prepararAsientoMovimiento,
  crearAsientoMovimiento,
  calcularCambiosAsiento,
  sincronizarAsientoMovimiento
}
