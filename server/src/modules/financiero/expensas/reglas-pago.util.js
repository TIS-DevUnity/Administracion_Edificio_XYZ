/**
 * REGLAS DE PAGO (version 2) — todo lo que decide si un pago se acepta vive en este archivo.
 * Si el edificio cambia la politica, se cambia aqui y no en los servicios de pagos.
 *
 * Definiciones
 *  - Expensa ATRASADA: expensa con deuda de un mes anterior, es decir, que ya tiene una expensa
 *    generada de un periodo posterior. La expensa del periodo mas reciente es la ACTUAL.
 *  - Al dia: el inmueble no tiene ninguna expensa atrasada con deuda.
 *
 * Reglas
 *  1. Siempre se paga del mes mas antiguo al mas nuevo: no se puede pagar (ni adelantar) un
 *     mes mientras se deba uno anterior.
 *  2. Una expensa atrasada se paga COMPLETA (mora + monto), un mes a la vez: no admite cuotas.
 *  3. La expensa actual admite cuotas (pagos parciales), aunque tenga mora, hasta que se
 *     genere la del mes siguiente.
 *  4. Solo estando al dia hay pago en cuotas o anticipado: lo que sobra despues de saldar toda
 *     la deuda queda como pago anticipado (saldo a favor).
 *  5. En cada expensa el pago cubre primero la mora y despues el monto (lo hace repartirPago).
 */
const {
  Decimal,
  errorHttp,
  pendientesDe,
  expensasConDeudaOrdenadas,
  periodoMasReciente
} = require('./saldo.util')

function formatearMonto(monto) {
  return new Decimal(monto).toFixed(2)
}

/**
 * Deudas vigentes de un inmueble (la mas antigua primero), ya clasificadas en atrasadas y
 * actual. `db` es prisma o una transaccion.
 */
async function cargarDeudas(db, inmuebleId) {
  const expensas = await expensasConDeudaOrdenadas(db, inmuebleId)
  const reciente = await periodoMasReciente(db, inmuebleId)
  return clasificarDeudas(expensas, reciente)
}

/**
 * Clasifica las expensas con deuda de un inmueble (ya ordenadas de la mas antigua a la mas
 * nueva y con `pagos`). `periodoReciente` es el periodo de la ultima expensa generada.
 */
function clasificarDeudas(expensasConDeuda, periodoReciente) {
  return expensasConDeuda
    .map((expensa) => ({
      expensa,
      pendiente: pendientesDe(expensa),
      atrasada: periodoReciente !== null && expensa.periodo < periodoReciente
    }))
    .filter((deuda) => deuda.pendiente.total.gt(0))
}

/**
 * Resume la situacion del inmueble frente a las reglas: si esta al dia y cual es el primer
 * pago que debe hacer.
 */
function resumirSituacion(deudas) {
  const atrasadas = deudas.filter((d) => d.atrasada)
  const primera = deudas[0] ?? null
  return {
    alDia: atrasadas.length === 0,
    cantidadAtrasadas: atrasadas.length,
    deudaAtrasada: atrasadas.reduce((acc, d) => acc.plus(d.pendiente.total), new Decimal(0)),
    // Lo que hay que pagar primero: la expensa mas antigua con deuda.
    proximoPago: primera
      ? {
          expensaId: primera.expensa.id,
          periodo: primera.expensa.periodo,
          atrasada: primera.atrasada,
          pendiente: primera.pendiente.total,
          // Solo la expensa actual admite pagos parciales.
          montoMinimo: primera.atrasada ? primera.pendiente.total : new Decimal(0)
        }
      : null
  }
}

/**
 * Simula como se repartiria un pago de `monto` y lanza un 409 si incumple las reglas.
 * No toca la base de datos. Devuelve el plan y su clasificacion:
 *  - ANTICIPADO: sobra dinero despues de cubrir toda la deuda (o no habia deuda).
 *  - CUOTA: queda alguna expensa pagada solo en parte.
 *  - PAGO_COMPLETO: cubre meses completos sin sobrante.
 */
function planificarPago({ deudas, monto }) {
  let restante = new Decimal(monto)
  const aplicaciones = []
  let saldadoAtrasado = new Decimal(0)

  for (const deuda of deudas) {
    if (restante.lte(0)) break
    const total = deuda.pendiente.total

    if (deuda.atrasada && restante.lt(total)) {
      const periodo = deuda.expensa.periodo
      if (aplicaciones.length === 0) {
        throw errorHttp(
          `Tiene deuda del periodo ${periodo} (Bs ${formatearMonto(total)}): debe pagarla completa antes de ` +
            'pagar en cuotas o por adelantado. Los meses anteriores no admiten pagos parciales.',
          409,
          {
            codigo: 'DEUDA_ATRASADA',
            detalle: { periodo, montoRequerido: formatearMonto(total), montoRecibido: formatearMonto(monto) }
          }
        )
      }
      throw errorHttp(
        `El monto no completa el periodo atrasado ${periodo}. Con Bs ${formatearMonto(saldadoAtrasado)} salda ` +
          `los meses anteriores y con Bs ${formatearMonto(saldadoAtrasado.plus(total))} salda tambien ${periodo}. ` +
          'Los meses anteriores no admiten pagos parciales.',
        409,
        {
          codigo: 'DEUDA_ATRASADA_INCOMPLETA',
          detalle: {
            periodo,
            montoRecibido: formatearMonto(monto),
            montoHastaAnterior: formatearMonto(saldadoAtrasado),
            montoHastaEste: formatearMonto(saldadoAtrasado.plus(total))
          }
        }
      )
    }

    const aplicado = Decimal.min(restante, total)
    aplicaciones.push({
      expensaId: deuda.expensa.id,
      periodo: deuda.expensa.periodo,
      atrasada: deuda.atrasada,
      pendiente: total,
      aplicado,
      completa: aplicado.gte(total)
    })
    if (deuda.atrasada) saldadoAtrasado = saldadoAtrasado.plus(aplicado)
    restante = restante.minus(aplicado)
  }

  let tipoPago = 'PAGO_COMPLETO'
  if (restante.gt(0)) tipoPago = 'ANTICIPADO'
  else if (aplicaciones.some((a) => !a.completa)) tipoPago = 'CUOTA'

  return { aplicaciones, restante, tipoPago }
}

/**
 * Pago sobre una expensa concreta: debe ser la deuda mas antigua del inmueble y el monto
 * tiene que cumplir las reglas del pago completo. Devuelve el plan.
 */
function validarPagoSobreExpensa({ deudas, expensaId, monto }) {
  const primera = deudas[0]
  if (primera && primera.expensa.id !== expensaId) {
    const periodo = primera.expensa.periodo
    throw errorHttp(
      `Debe pagar primero el periodo ${periodo} (Bs ${formatearMonto(primera.pendiente.total)}): ` +
        'los pagos se aplican siempre del mes mas antiguo al mas nuevo.',
      409,
      {
        codigo: 'ORDEN_DE_PAGO',
        detalle: { periodoPendiente: periodo, expensaId: primera.expensa.id, pendiente: formatearMonto(primera.pendiente.total) }
      }
    )
  }
  return planificarPago({ deudas, monto })
}

/** El pago anticipado solo aplica cuando no se debe nada. */
function validarPagoAnticipado({ deudas }) {
  const primera = deudas[0]
  if (primera) {
    throw errorHttp(
      `El inmueble tiene deuda pendiente (periodo ${primera.expensa.periodo}, Bs ${formatearMonto(primera.pendiente.total)}). ` +
        'Registre un pago normal: se aplica primero a la deuda mas antigua y lo que sobre queda como pago anticipado.',
      409,
      { codigo: 'DEUDA_PENDIENTE', detalle: { periodo: primera.expensa.periodo, pendiente: formatearMonto(primera.pendiente.total) } }
    )
  }
}

/** Usar el saldo a favor sobre una expensa: tambien en orden y sin pagar parcial un mes atrasado. */
function validarAplicacionSaldo({ deudas, expensaId, saldo }) {
  const primera = deudas[0]
  if (primera && primera.expensa.id !== expensaId) {
    throw errorHttp(
      `Debe cubrir primero el periodo ${primera.expensa.periodo}: el saldo a favor se aplica del mes mas antiguo al mas nuevo.`,
      409,
      { codigo: 'ORDEN_DE_PAGO', detalle: { periodoPendiente: primera.expensa.periodo, expensaId: primera.expensa.id } }
    )
  }
  if (primera && primera.atrasada && new Decimal(saldo).lt(primera.pendiente.total)) {
    throw errorHttp(
      `El saldo a favor (Bs ${formatearMonto(saldo)}) no alcanza para completar el periodo atrasado ` +
        `${primera.expensa.periodo} (Bs ${formatearMonto(primera.pendiente.total)}). Los meses anteriores no admiten pagos parciales.`,
      409,
      {
        codigo: 'DEUDA_ATRASADA',
        detalle: { periodo: primera.expensa.periodo, montoRequerido: formatearMonto(primera.pendiente.total), saldoFavor: formatearMonto(saldo) }
      }
    )
  }
}

module.exports = {
  cargarDeudas,
  clasificarDeudas,
  resumirSituacion,
  planificarPago,
  validarPagoSobreExpensa,
  validarPagoAnticipado,
  validarAplicacionSaldo
}
