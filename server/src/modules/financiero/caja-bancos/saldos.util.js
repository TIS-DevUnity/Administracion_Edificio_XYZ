const { Decimal } = require('../expensas/saldo.util')
const { ETIQUETA_TIPO, dinero } = require('./cuentas.util')
const { resumirGrupos } = require('./movimientos-caja.util')

const CERO = new Decimal(0)

const montoDe = (grupo) => new Decimal(grupo._sum?.monto ?? 0)
const cantidadDe = (grupo) => grupo._count?._all ?? 0
const esConciliado = (grupo) => grupo.estado === 'CONCILIADO'

/** Ingresos menos egresos de un groupBy por tipo (con _sum.monto), partiendo de `base`. */
function netoDeGrupos(base, grupos) {
  return grupos.reduce((acc, g) => (g.tipo === 'INGRESO' ? acc.plus(montoDe(g)) : acc.minus(montoDe(g))), new Decimal(base ?? 0))
}

/**
 * Saldos de una cuenta al cierre de un periodo (formulas de NOTAS.md, D4). Los saldos no se guardan: salen
 * de sumas agrupadas de los asientos.
 *  - Registrado = saldo inicial + ingresos - egresos de todos los asientos hasta el periodo.
 *  - Conciliado = lo mismo, solo con los asientos CONCILIADO.
 *  - Real = lo que introduce el Administrador (puede ser null si aun no lo ha guardado).
 *  - Diferencia = real - registrado.
 * `gruposHasta` agrupa los asientos con periodo <= P y `gruposPeriodo` los de P, ambos por
 * [cuentaId, tipo, estado] con _sum.monto y _count._all.
 */
function calcularSaldoCuenta({ cuenta, gruposHasta = [], gruposPeriodo = [], saldoReal = null }) {
  const propios = (g) => g.cuentaId === cuenta.id
  const hasta = gruposHasta.filter(propios)
  const delPeriodo = gruposPeriodo.filter(propios)
  const inicial = new Decimal(cuenta.saldoInicial ?? 0)

  const saldoRegistrado = inicial.plus(netoDeGrupos(0, hasta))
  const saldoConciliado = inicial.plus(netoDeGrupos(0, hasta.filter(esConciliado)))
  const sumar = (tipo) => delPeriodo.filter((g) => g.tipo === tipo).reduce((acc, g) => acc.plus(montoDe(g)), CERO)
  const contar = (estado) => delPeriodo.filter((g) => g.estado === estado).reduce((acc, g) => acc + cantidadDe(g), 0)
  const real = saldoReal === null || saldoReal === undefined ? null : new Decimal(saldoReal)

  return {
    cuentaId: cuenta.id,
    saldoInicial: inicial,
    // Saldos con los que arranca el periodo (todo lo anterior).
    apertura: {
      registrado: saldoRegistrado.minus(netoDeGrupos(0, delPeriodo)),
      conciliado: saldoConciliado.minus(netoDeGrupos(0, delPeriodo.filter(esConciliado)))
    },
    movimientos: {
      ingresos: sumar('INGRESO'),
      egresos: sumar('EGRESO'),
      cantidad: delPeriodo.reduce((acc, g) => acc + cantidadDe(g), 0)
    },
    saldoRegistrado,
    saldoConciliado,
    pendientes: contar('PENDIENTE'),
    conDiferencia: contar('CON_DIFERENCIA'),
    saldoReal: real,
    diferencia: real ? real.minus(saldoRegistrado) : null,
    tieneAsientos: hasta.length > 0
  }
}

/** Cuentas que entran al cierre: las activas, o con asientos en el periodo, o con saldo registrado distinto de cero. */
function entraAlCierre(cuenta, calculo) {
  return Boolean(cuenta.activa) || calculo.movimientos.cantidad > 0 || !calculo.saldoRegistrado.isZero()
}

/** Cuentas que se muestran en la consulta de saldos: ademas de las del cierre, las que tienen historial o saldo real. */
function seMuestra(cuenta, calculo, fila) {
  return (
    entraAlCierre(cuenta, calculo) ||
    calculo.tieneAsientos ||
    !new Decimal(cuenta.saldoInicial ?? 0).isZero() ||
    Boolean(fila)
  )
}

/**
 * Una diferencia revisada solo sigue vigente si el saldo registrado y el real son los mismos de cuando se
 * reviso (se comparan con la foto que dejo el evento REVISAR_DIFERENCIA). Si entro o cambio un asiento, o
 * se cambio el saldo real, hay que revisarla de nuevo.
 */
function revisionVigente(fila, evento, calculo) {
  if (!fila || !fila.diferenciaRevisada || !evento || !evento.detalle) return false
  return (
    evento.detalle.saldoRegistrado === dinero(calculo.saldoRegistrado) &&
    evento.detalle.saldoReal === dinero(fila.saldoReal)
  )
}

const mostrar = (valor) => (valor === null || valor === undefined ? null : dinero(valor))

function presentarCuenta(cuenta) {
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    tipoEtiqueta: ETIQUETA_TIPO[cuenta.tipo],
    activa: cuenta.activa
  }
}

/** Saldos de una cuenta y periodo abierto (calculados al momento). */
function presentarSaldo({ cuenta, calculo, fila, revisadaVigente }) {
  return {
    cuenta: presentarCuenta(cuenta),
    origen: 'CALCULADO',
    saldoInicial: dinero(calculo.saldoInicial),
    apertura: { registrado: dinero(calculo.apertura.registrado), conciliado: dinero(calculo.apertura.conciliado) },
    movimientos: {
      ingresos: dinero(calculo.movimientos.ingresos),
      egresos: dinero(calculo.movimientos.egresos),
      cantidad: calculo.movimientos.cantidad
    },
    pendientes: calculo.pendientes,
    conDiferencia: calculo.conDiferencia,
    saldoRegistrado: dinero(calculo.saldoRegistrado),
    saldoConciliado: dinero(calculo.saldoConciliado),
    saldoReal: mostrar(calculo.saldoReal),
    diferencia: mostrar(calculo.diferencia),
    diferenciaRevisada: Boolean(revisadaVigente),
    observacion: fila?.observacion ?? null,
    revisadaEn: revisadaVigente ? (fila?.revisadaEn ?? null) : null,
    entraAlCierre: entraAlCierre(cuenta, calculo)
  }
}

/** Saldos de una cuenta en un periodo ya cerrado: la foto que quedo al cerrar (CA19). */
function presentarSnapshot(cierreCuenta) {
  return {
    cuenta: cierreCuenta.cuenta ? presentarCuenta(cierreCuenta.cuenta) : { id: cierreCuenta.cuentaId },
    origen: 'CIERRE',
    saldoRegistrado: dinero(cierreCuenta.saldoRegistrado),
    saldoConciliado: dinero(cierreCuenta.saldoConciliado),
    saldoReal: dinero(cierreCuenta.saldoReal),
    diferencia: dinero(cierreCuenta.diferencia),
    diferenciaConfirmada: Boolean(cierreCuenta.diferenciaConfirmada),
    observacion: cierreCuenta.observacion ?? null
  }
}

/** Totales de todas las cuentas mostradas (el real y la diferencia solo suman las cuentas que tienen saldo real). */
function totalizar(items) {
  const sumar = (campo) =>
    items.reduce((acc, i) => (i[campo] === null || i[campo] === undefined ? acc : acc.plus(i[campo])), CERO)
  const conReal = items.filter((i) => i.saldoReal !== null && i.saldoReal !== undefined)
  return {
    saldoRegistrado: sumar('saldoRegistrado').toFixed(2),
    saldoConciliado: sumar('saldoConciliado').toFixed(2),
    saldoReal: conReal.length ? sumar('saldoReal').toFixed(2) : null,
    diferencia: conReal.length ? sumar('diferencia').toFixed(2) : null,
    cuentasSinSaldoReal: items.length - conReal.length
  }
}

/** Resumen de conciliacion de un periodo (CA18) a partir de un groupBy por [tipo, estado]. */
function resumenDeConciliacion(grupos) {
  const r = resumirGrupos(grupos)
  return {
    totalIngresos: r.ingresos,
    totalEgresos: r.egresos,
    balance: r.balance,
    cantidad: r.cantidad,
    conciliados: r.porEstado.CONCILIADO,
    pendientes: r.porEstado.PENDIENTE,
    conDiferencia: r.porEstado.CON_DIFERENCIA
  }
}

module.exports = {
  netoDeGrupos,
  calcularSaldoCuenta,
  entraAlCierre,
  seMuestra,
  revisionVigente,
  presentarCuenta,
  presentarSaldo,
  presentarSnapshot,
  totalizar,
  resumenDeConciliacion
}
