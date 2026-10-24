const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { periodoDe, periodoDeDia } = require('./periodos.util')
const { siguientePeriodo, mesTerminado } = require('./calendario.util')
const { dinero } = require('./cuentas.util')

const MAX_EJEMPLOS = 20

/**
 * Periodo que toca cerrar: el siguiente al ultimo cierre o, si todavia no hay ninguno, el del asiento mas
 * antiguo. Los cierres son consecutivos y ningun mes se salta. null si no hay nada que cerrar.
 */
function periodoEsperado({ ultimoCierre, primerPeriodo }) {
  return ultimoCierre ? siguientePeriodo(ultimoCierre) : (primerPeriodo ?? null)
}

/** `confirmarDiferencias`: lista de ids de cuenta cuya diferencia el Administrador confirma de forma explicita. */
function normalizarConfirmaciones(valor) {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !v.trim())) {
    throw errorHttp('confirmarDiferencias debe ser una lista de ids de cuenta', 400)
  }
  return [...new Set(valor.map((v) => v.trim()))]
}

/**
 * Control C2: el asiento debe coincidir con su origen (monto, tipo, periodo y, en los cobros, el tipo de
 * cuenta que corresponde al metodo de pago). Devuelve el motivo del desfase o null si esta bien.
 */
function desfaseDeAsiento(asiento) {
  if (asiento.origen === 'RECIBO') {
    const r = asiento.recibo
    if (!r) return 'el recibo de origen no existe'
    if (!new Decimal(asiento.monto).equals(r.montoTotal)) return 'el monto es distinto al del recibo'
    if (asiento.tipo !== 'INGRESO') return 'un cobro debe ser un ingreso'
    if (asiento.periodo !== periodoDe(r.fechaPago)) return 'el periodo es distinto al de la fecha del recibo'
    if ((r.metodoPago === 'EFECTIVO') !== (asiento.cuenta?.tipo === 'CAJA')) return 'la cuenta no corresponde al metodo de pago'
    return null
  }
  if (asiento.origen === 'MOVIMIENTO_FINANCIERO') {
    const m = asiento.movimientoFinanciero
    if (!m) return 'el movimiento de origen no existe'
    if (!new Decimal(asiento.monto).equals(m.monto)) return 'el monto es distinto al del movimiento'
    if (asiento.tipo !== m.tipo) return 'el tipo es distinto al del movimiento'
    if (asiento.periodo !== periodoDeDia(m.fecha)) return 'el periodo es distinto al de la fecha del movimiento'
    return null
  }
  return null // un traspaso no tiene origen que comparar
}

/**
 * Evalua si un periodo se puede cerrar y devuelve TODOS los bloqueos a la vez (CA14). `h` son los hechos:
 *   periodo, ahora, ultimoCierre, primerPeriodo, pendientes, conDiferencia (cantidades),
 *   faltantes { recibos, movimientos }, desfases [{ motivo }], cuentas [{ cuentaId, nombre, saldoReal,
 *   diferencia, revisadaVigente, observacion }].
 * La confirmacion explicita de cada diferencia solo se exige al cerrar (`evaluarConfirmacion`).
 */
function evaluarBloqueos(h, { evaluarConfirmacion = false, confirmadas = [] } = {}) {
  const bloqueos = []
  const agregar = (codigo, mensaje, detalle) => bloqueos.push({ codigo, mensaje, ...(detalle ? { detalle } : {}) })

  if (h.ultimoCierre && h.periodo <= h.ultimoCierre) {
    agregar('PERIODO_YA_CERRADO', `El periodo ${h.periodo} ya esta cerrado`, { ultimoCierre: h.ultimoCierre })
    return bloqueos
  }

  if (!mesTerminado(h.periodo, h.ahora)) {
    agregar('PERIODO_NO_TERMINADO', `El periodo ${h.periodo} todavia no termino: solo se pueden cerrar meses anteriores al actual`)
  }

  const esperado = periodoEsperado(h)
  if (!esperado) {
    // Sin ningun asiento no hay "mes mas antiguo" para empezar la cadena de cierres.
    agregar('SIN_ASIENTOS', 'No hay movimientos registrados: el primer cierre es el del mes del movimiento mas antiguo')
  } else if (h.periodo !== esperado) {
    agregar('PERIODO_FUERA_DE_ORDEN', `Los cierres son consecutivos: primero hay que cerrar el periodo ${esperado}`, { esperado })
  }

  const sinResolver = h.pendientes + h.conDiferencia
  if (sinResolver > 0) {
    agregar(
      'MOVIMIENTOS_SIN_RESOLVER',
      `Hay ${sinResolver} movimiento(s) sin conciliar en el periodo (${h.pendientes} pendientes y ${h.conDiferencia} con diferencia)`,
      { pendientes: h.pendientes, conDiferencia: h.conDiferencia }
    )
  }

  const faltantes = h.faltantes.recibos + h.faltantes.movimientos
  if (faltantes > 0) {
    agregar(
      'ASIENTOS_FALTANTES',
      `Hay ${faltantes} cobro(s) o movimiento(s) del periodo sin su asiento de caja: hay que completar la carga antes de cerrar`,
      { recibos: h.faltantes.recibos, movimientos: h.faltantes.movimientos }
    )
  }
  if (h.desfases.length > 0) {
    agregar(
      'ASIENTOS_DESFASADOS',
      `Hay ${h.desfases.length} asiento(s) que no coinciden con su cobro o movimiento de origen`,
      { cantidad: h.desfases.length, ejemplos: h.desfases.slice(0, MAX_EJEMPLOS) }
    )
  }

  const refCuenta = (c) => ({ id: c.cuentaId, nombre: c.nombre })
  const sinSaldoReal = h.cuentas.filter((c) => c.saldoReal === null || c.saldoReal === undefined)
  if (sinSaldoReal.length) {
    agregar('SALDO_REAL_FALTANTE', 'Faltan los saldos reales de algunas cuentas', { cuentas: sinSaldoReal.map(refCuenta) })
  }

  const conDiferencia = h.cuentas.filter((c) => c.diferencia && !c.diferencia.isZero())
  const sinRevisar = conDiferencia.filter((c) => !c.revisadaVigente || !c.observacion)
  if (sinRevisar.length) {
    agregar('DIFERENCIA_SIN_REVISAR', 'Hay diferencias de saldo sin revisar (o que cambiaron desde que se revisaron)', {
      cuentas: sinRevisar.map((c) => ({ ...refCuenta(c), diferencia: dinero(c.diferencia) }))
    })
  }
  if (evaluarConfirmacion) {
    const sinConfirmar = conDiferencia.filter((c) => c.revisadaVigente && c.observacion && !confirmadas.includes(c.cuentaId))
    if (sinConfirmar.length) {
      agregar('DIFERENCIA_SIN_CONFIRMAR', 'Hay que confirmar de forma explicita cada diferencia de saldo (confirmarDiferencias)', {
        cuentas: sinConfirmar.map((c) => ({ ...refCuenta(c), diferencia: dinero(c.diferencia) }))
      })
    }
  }
  return bloqueos
}

/** Datos de CierreCajaCuenta para una cuenta: la foto de sus saldos al cerrar. */
function fotoDeCuenta(c, confirmadas = []) {
  const hayDiferencia = Boolean(c.diferencia) && !c.diferencia.isZero()
  return {
    saldoRegistrado: c.calculo.saldoRegistrado,
    saldoConciliado: c.calculo.saldoConciliado,
    saldoReal: c.saldoReal,
    diferencia: c.diferencia,
    observacion: c.observacion ?? null,
    diferenciaConfirmada: hayDiferencia && confirmadas.includes(c.cuentaId)
  }
}

/** Foto de una cuenta tal como se muestra (importes con 2 decimales). */
function presentarFoto(foto, cuenta) {
  return {
    cuenta: cuenta ? { id: cuenta.id, nombre: cuenta.nombre, tipo: cuenta.tipo } : null,
    saldoRegistrado: dinero(foto.saldoRegistrado),
    saldoConciliado: dinero(foto.saldoConciliado),
    saldoReal: dinero(foto.saldoReal),
    diferencia: dinero(foto.diferencia),
    diferenciaConfirmada: Boolean(foto.diferenciaConfirmada),
    observacion: foto.observacion ?? null
  }
}

/** Totales de las fotos de un cierre (en un cierre todas las cuentas tienen saldo real). */
function totalizarFotos(fotos) {
  const sumar = (campo) => fotos.reduce((acc, f) => acc.plus(f[campo] ?? 0), new Decimal(0))
  return {
    saldoRegistrado: sumar('saldoRegistrado').toFixed(2),
    saldoConciliado: sumar('saldoConciliado').toFixed(2),
    saldoReal: sumar('saldoReal').toFixed(2),
    diferencia: sumar('diferencia').toFixed(2),
    cuentasConDiferencia: fotos.filter((f) => !new Decimal(f.diferencia ?? 0).isZero()).length
  }
}

module.exports = {
  MAX_EJEMPLOS,
  periodoEsperado,
  normalizarConfirmaciones,
  desfaseDeAsiento,
  evaluarBloqueos,
  fotoDeCuenta,
  presentarFoto,
  totalizarFotos
}
