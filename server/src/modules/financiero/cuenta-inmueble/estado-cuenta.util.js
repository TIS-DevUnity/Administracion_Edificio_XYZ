/**
 * Libro de movimientos de un estado de cuenta (HU5).
 *
 * Convierte las expensas, moras, pagos y abonos de saldo a favor de un inmueble en una lista
 * cronologica (los mas antiguos primero) con el saldo corrido, y calcula el saldo anterior al
 * periodo, el saldo final y las deudas que quedan pendientes. Todo sale de los mismos registros
 * que usan los pagos, asi que los importes coinciden con ellos y ningun movimiento se cuenta
 * dos veces.
 *
 * Contabilidad (la misma que el resto del modulo):
 *  - deuda = cargos (expensa + mora) - pagos aplicados a las expensas (en dinero o con saldo a favor).
 *  - saldo a favor = abonos (pago anticipado / exceso) - lo que se uso para cubrir expensas.
 *  - saldo neto = deuda - saldo a favor (positivo = debe, negativo = a favor).
 * Un pago cubierto con saldo a favor baja la deuda y el saldo a favor por igual, asi que no cambia
 * el saldo neto: se muestra como "aplicacion de saldo" sin cargo ni abono.
 */
const { Prisma } = require('@prisma/client')
const { fechaEnZona, fechaCalendario } = require('../expensas/mora.util')

const Decimal = Prisma.Decimal
const CERO = new Decimal(0)

// Orden dentro de un mismo dia: primero se genera el cargo y despues se paga. Entre los cobros
// (pago, uso de saldo a favor y saldo generado) manda la hora; solo si empatan se usa este orden:
// el pago primero y el sobrante que deja como saldo a favor despues.
const ORDEN = { EXPENSA: 1, MORA: 2, PAGO: 3, APLICACION_SALDO: 4, SALDO_A_FAVOR: 5 }
const grupoDe = (evento) => (evento.orden <= 2 ? evento.orden : 3)

const ETIQUETA_CLASE = { DEPARTAMENTO: 'Departamento', BAULERA: 'Baulera', PARQUEO: 'Parqueo' }
const ETIQUETA_METODO = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CHEQUE: 'Cheque',
  SALDO_A_FAVOR: 'Saldo a favor'
}

function dinero(valor) {
  return new Decimal(valor).toFixed(2)
}

/** Una linea por concepto de la expensa: tarifa del departamento, cada baulera/parqueo y el agua. */
function desgloseExpensa(expensa) {
  const lineas = []
  if (expensa.cargos && expensa.cargos.length > 0) {
    for (const cargo of expensa.cargos) {
      lineas.push({
        concepto:
          cargo.clase === 'DEPARTAMENTO'
            ? `Tarifa fija - ${ETIQUETA_CLASE[cargo.clase]} ${cargo.codigo}${expensa.tipoNombre ? ` (tipo ${expensa.tipoNombre})` : ''}`
            : `${ETIQUETA_CLASE[cargo.clase] ?? cargo.clase} ${cargo.codigo}`,
        monto: dinero(cargo.monto)
      })
    }
  } else {
    lineas.push({ concepto: 'Tarifa fija', monto: dinero(expensa.montoBase) })
  }
  lineas.push({ concepto: 'Agua', monto: dinero(expensa.montoAgua) })
  return lineas
}

/**
 * Arma los eventos (sin saldos todavia) de un inmueble.
 *  - `expensas`: con `pagos` (cada uno puede traer `recibo.folioNumero`), `moras` y `cargos`.
 *  - `abonosSaldo`: movimientos de saldo a favor de tipo PAGO_ANTICIPADO / EXCESO_PAGO.
 * Las fechas son dias de calendario: el vencimiento es una fecha sin hora y los pagos se ven en
 * hora de Bolivia.
 */
function construirEventos({ expensas, abonosSaldo = [], formatearFolio }) {
  const eventos = []

  for (const expensa of expensas) {
    eventos.push({
      tipo: 'EXPENSA',
      fecha: fechaCalendario(expensa.fechaVencimiento),
      orden: ORDEN.EXPENSA,
      marca: new Date(expensa.createdAt).getTime(),
      descripcion: `Expensa del periodo ${expensa.periodo}`,
      periodo: expensa.periodo,
      expensaId: expensa.id,
      importe: new Decimal(expensa.montoTotal),
      desglose: desgloseExpensa(expensa),
      fechaGeneracion: fechaEnZona(new Date(expensa.createdAt)),
      detalle: {
        tarifaFija: dinero(expensa.montoBase),
        agua: dinero(expensa.montoAgua),
        total: dinero(expensa.montoTotal)
      }
    })

    for (const mora of expensa.moras ?? []) {
      eventos.push({
        tipo: 'MORA',
        fecha: fechaCalendario(mora.fechaCorte),
        orden: ORDEN.MORA,
        marca: new Date(mora.createdAt).getTime(),
        descripcion: `Mora de la expensa ${expensa.periodo} (mes ${mora.mes})`,
        periodo: expensa.periodo,
        expensaId: expensa.id,
        importe: new Decimal(mora.monto),
        detalle: {
          mes: mora.mes,
          base: dinero(mora.base),
          tipoValor: mora.tipoValor,
          valor: new Decimal(mora.valor).toString()
        }
      })
    }

    for (const pago of expensa.pagos ?? []) {
      const conSaldo = pago.metodoPago === 'SALDO_A_FAVOR'
      eventos.push({
        tipo: conSaldo ? 'APLICACION_SALDO' : 'PAGO',
        fecha: fechaEnZona(new Date(pago.fechaPago)),
        orden: conSaldo ? ORDEN.APLICACION_SALDO : ORDEN.PAGO,
        marca: new Date(pago.fechaPago).getTime(),
        descripcion: conSaldo
          ? `Saldo a favor aplicado a la expensa ${expensa.periodo}`
          : `Pago aplicado a la expensa ${expensa.periodo}`,
        periodo: expensa.periodo,
        expensaId: expensa.id,
        importe: new Decimal(pago.monto),
        metodoPago: pago.metodoPago,
        metodoEtiqueta: ETIQUETA_METODO[pago.metodoPago] ?? pago.metodoPago,
        referencia: pago.referencia ?? null,
        folio: pago.recibo && formatearFolio ? formatearFolio(pago.recibo.folioNumero) : null,
        detalle: {
          aMora: dinero(pago.montoMora),
          aExpensa: dinero(pago.montoExpensa)
        },
        // Para armar la situacion de la obligacion despues de este pago.
        importeOriginalObligacion: new Decimal(expensa.montoTotal)
      })
    }
  }

  for (const abono of abonosSaldo) {
    // El saldo a favor nace con el cobro que lo genera: se ubica en la fecha de su recibo.
    const instante = new Date(abono.recibo?.fechaPago ?? abono.createdAt)
    eventos.push({
      tipo: 'SALDO_A_FAVOR',
      fecha: fechaEnZona(instante),
      orden: ORDEN.SALDO_A_FAVOR,
      marca: instante.getTime(),
      descripcion:
        abono.tipo === 'PAGO_ANTICIPADO'
          ? 'Saldo a favor por pago anticipado'
          : 'Saldo a favor por pago en exceso',
      periodo: null,
      expensaId: abono.expensaId ?? null,
      importe: new Decimal(abono.monto),
      metodoPago: abono.metodoPago ?? null,
      metodoEtiqueta: abono.metodoPago ? (ETIQUETA_METODO[abono.metodoPago] ?? abono.metodoPago) : null,
      referencia: abono.referencia ?? null,
      folio: abono.recibo && formatearFolio ? formatearFolio(abono.recibo.folioNumero) : null,
      detalle: { origen: abono.tipo }
    })
  }

  return eventos.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || grupoDe(a) - grupoDe(b) || a.marca - b.marca || a.orden - b.orden
  )
}

function instantanea(estado) {
  const neto = estado.deuda.minus(estado.favor)
  return {
    deuda: dinero(estado.deuda),
    saldoFavor: dinero(estado.favor),
    saldoNeto: dinero(neto),
    // Nunca se muestra una deuda inexistente: si el saldo a favor la supera, lo adeudado es 0.
    saldoAdeudado: dinero(neto.gt(0) ? neto : CERO),
    saldoAFavorRestante: dinero(neto.lt(0) ? neto.negated() : CERO),
    situacion: neto.gt(0) ? 'DEBE' : neto.lt(0) ? 'A_FAVOR' : 'AL_DIA'
  }
}

/**
 * Recorre los eventos en orden cronologico y devuelve lo que ocurre entre `desde` y `hasta`
 * (YYYY-MM-DD, ambos opcionales e inclusivos), con el saldo corrido despues de cada uno.
 */
function armarLibro(eventos, { desde = null, hasta = null } = {}) {
  const estado = { deuda: CERO, favor: CERO }
  const porExpensa = new Map() // expensaId -> { periodo, cargo, pagado }
  const obligacion = (e) => {
    if (!porExpensa.has(e.expensaId)) {
      porExpensa.set(e.expensaId, { expensaId: e.expensaId, periodo: e.periodo, cargo: CERO, pagado: CERO })
    }
    return porExpensa.get(e.expensaId)
  }

  let saldoAnterior = null
  const movimientos = []
  let totalCargos = CERO
  let totalAbonos = CERO

  for (const e of eventos) {
    if (hasta && e.fecha > hasta) break

    // El saldo anterior es el estado justo antes del primer movimiento del periodo.
    if (saldoAnterior === null && (!desde || e.fecha >= desde)) {
      saldoAnterior = instantanea(estado)
    }

    let cargo = CERO
    let abono = CERO
    let aplicadoDeSaldo = null
    const ob = e.expensaId ? obligacion(e) : null

    if (e.tipo === 'EXPENSA' || e.tipo === 'MORA') {
      cargo = e.importe
      estado.deuda = estado.deuda.plus(e.importe)
      ob.cargo = ob.cargo.plus(e.importe)
    } else if (e.tipo === 'PAGO') {
      abono = e.importe
      estado.deuda = estado.deuda.minus(e.importe)
      ob.pagado = ob.pagado.plus(e.importe)
    } else if (e.tipo === 'APLICACION_SALDO') {
      aplicadoDeSaldo = e.importe
      estado.deuda = estado.deuda.minus(e.importe)
      estado.favor = estado.favor.minus(e.importe)
      ob.pagado = ob.pagado.plus(e.importe)
    } else if (e.tipo === 'SALDO_A_FAVOR') {
      abono = e.importe
      estado.favor = estado.favor.plus(e.importe)
    }

    if (!desde || e.fecha >= desde) {
      const movimiento = {
        fecha: e.fecha,
        tipo: e.tipo,
        descripcion: e.descripcion,
        periodo: e.periodo,
        expensaId: e.expensaId,
        cargo: dinero(cargo),
        abono: dinero(abono),
        ...(aplicadoDeSaldo ? { aplicadoDeSaldoAFavor: dinero(aplicadoDeSaldo) } : {}),
        ...(e.metodoPago ? { metodoPago: e.metodoPago, metodoEtiqueta: e.metodoEtiqueta } : {}),
        ...(e.referencia ? { referencia: e.referencia } : {}),
        ...(e.folio ? { folio: e.folio } : {}),
        ...(e.desglose ? { desglose: e.desglose, fechaGeneracion: e.fechaGeneracion } : {}),
        detalle: e.detalle
      }
      // Pagos: importe original de la obligacion, lo pagado hasta ese momento y lo que queda.
      if (e.tipo === 'PAGO' || e.tipo === 'APLICACION_SALDO') {
        const pendiente = ob.cargo.minus(ob.pagado)
        movimiento.obligacion = {
          expensaId: e.expensaId,
          periodo: e.periodo,
          importeOriginal: dinero(e.importeOriginalObligacion),
          pagadoHastaAqui: dinero(ob.pagado),
          saldoPendiente: dinero(pendiente.gt(0) ? pendiente : CERO)
        }
      }
      Object.assign(movimiento, { saldoCorrido: instantanea(estado) })
      movimientos.push(movimiento)

      totalCargos = totalCargos.plus(cargo)
      totalAbonos = totalAbonos.plus(abono)
    }
  }

  if (saldoAnterior === null) {
    saldoAnterior = instantanea(estado)
  }

  const deudasPendientes = [...porExpensa.values()]
    .map((o) => ({ ...o, pendiente: o.cargo.minus(o.pagado) }))
    .filter((o) => o.pendiente.gt(0))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((o) => ({
      expensaId: o.expensaId,
      periodo: o.periodo,
      importeCargado: dinero(o.cargo),
      pagado: dinero(o.pagado),
      pendiente: dinero(o.pendiente)
    }))

  return {
    saldoAnterior,
    movimientos,
    saldoFinal: instantanea(estado),
    deudasPendientes,
    totalCargos: dinero(totalCargos),
    totalAbonos: dinero(totalAbonos)
  }
}

module.exports = { construirEventos, armarLibro, desgloseExpensa, ETIQUETA_METODO }
