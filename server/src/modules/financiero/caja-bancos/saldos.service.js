const prisma = require('../../../config/prisma')
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { dinero, parsearSaldo } = require('./cuentas.util')
const { periodoDe, periodoAbierto, ultimoCierre, estaCerrado } = require('./periodos.util')
const { normalizarPeriodo } = require('./calendario.util')
const { registrarEvento } = require('./eventos.util')
const { normalizarObservacion } = require('./conciliacion.util')
const {
  netoDeGrupos,
  calcularSaldoCuenta,
  seMuestra,
  revisionVigente,
  presentarSaldo,
  presentarSnapshot,
  totalizar,
  resumenDeConciliacion
} = require('./saldos.util')

const OPCIONES_TX = { timeout: 15000 }
const PERSONA = { select: { id: true, nombre: true, apellido: true } }
const ORDEN_CUENTAS = [{ tipo: 'asc' }, { esPorDefecto: 'desc' }, { nombre: 'asc' }]

/** Saldo conciliado de una cuenta al cierre de `periodo`: saldo inicial mas los asientos CONCILIADO. */
async function saldoConciliadoDe(db, cuentaId, periodo) {
  const cuenta = await db.cuentaBancaria.findUnique({ where: { id: cuentaId }, select: { saldoInicial: true } })
  const grupos = await db.movimientoCaja.groupBy({
    by: ['tipo'],
    where: { cuentaId, estado: 'CONCILIADO', periodo: { lte: periodo } },
    _sum: { monto: true }
  })
  return netoDeGrupos(cuenta?.saldoInicial ?? 0, grupos)
}

/**
 * Calcula los saldos de todas las cuentas (o de una) para un periodo. Cada elemento trae la cuenta, el
 * calculo, la fila de saldo real (si existe) y si su revision de diferencia sigue vigente. `db` es prisma o
 * una transaccion (las consultas van una tras otra para no mezclarlas dentro de la transaccion).
 */
async function calcularSaldosPeriodo(db, periodo, { cuentaId = null } = {}) {
  const propia = cuentaId ? { cuentaId } : {}
  const cuentas = await db.cuentaBancaria.findMany({
    where: cuentaId ? { id: cuentaId } : {},
    orderBy: ORDEN_CUENTAS
  })
  if (cuentaId && cuentas.length === 0) throw errorHttp('Cuenta no encontrada', 404)

  const agrupar = (periodoWhere) =>
    db.movimientoCaja.groupBy({
      by: ['cuentaId', 'tipo', 'estado'],
      where: { ...propia, periodo: periodoWhere },
      _sum: { monto: true },
      _count: { _all: true }
    })
  const gruposHasta = await agrupar({ lte: periodo })
  const gruposPeriodo = await agrupar(periodo)
  const filas = await db.saldoRealPeriodo.findMany({ where: { periodo, ...propia } })
  const eventos = await db.conciliacionEvento.findMany({
    where: { periodo, operacion: 'REVISAR_DIFERENCIA', resultado: 'EXITOSO', ...propia },
    orderBy: { createdAt: 'desc' }
  })

  return cuentas.map((cuenta) => {
    const fila = filas.find((f) => f.cuentaId === cuenta.id) ?? null
    const calculo = calcularSaldoCuenta({ cuenta, gruposHasta, gruposPeriodo, saldoReal: fila?.saldoReal ?? null })
    const evento = eventos.find((e) => e.cuentaId === cuenta.id) ?? null
    return { cuenta, fila, calculo, revisadaVigente: revisionVigente(fila, evento, calculo) }
  })
}

/**
 * Saldos por cuenta de un periodo: registrado, conciliado, real y diferencia (CA11, CA12, CA13). Si el
 * periodo ya se cerro, devuelve la foto del cierre (CA19) en vez de recalcular.
 */
async function obtenerSaldos(periodo, { cuentaId } = {}) {
  const per = normalizarPeriodo(periodo)
  const [cierre, ultimo] = await Promise.all([
    prisma.cierreCaja.findUnique({
      where: { periodo: per },
      include: { cerradoPor: PERSONA, cuentas: { include: { cuenta: { select: { id: true, nombre: true, tipo: true, activa: true } } } } }
    }),
    ultimoCierre(prisma)
  ])

  if (cierre) {
    const cuentas = cierre.cuentas.filter((c) => !cuentaId || c.cuentaId === cuentaId).map(presentarSnapshot)
    if (cuentaId && cuentas.length === 0) throw errorHttp('Cuenta no encontrada en el cierre de ese periodo', 404)
    return {
      periodo: per,
      origen: 'CIERRE',
      periodoCerrado: true,
      cierre: { id: cierre.id, cerradoEn: cierre.cerradoEn, cerradoPor: cierre.cerradoPor ?? null },
      cuentas,
      totales: totalizar(cuentas)
    }
  }

  const items = (await calcularSaldosPeriodo(prisma, per, { cuentaId })).filter(
    (i) => cuentaId || seMuestra(i.cuenta, i.calculo, i.fila)
  )
  const cuentas = items.map(presentarSaldo)
  return {
    periodo: per,
    origen: 'CALCULADO',
    periodoCerrado: estaCerrado(per, ultimo),
    cuentas,
    totales: totalizar(cuentas)
  }
}

/**
 * Guarda (o corrige) el saldo real de una cuenta en un periodo abierto (CA12): lo que dice el extracto o el
 * arqueo. Si el valor cambia, la revision de la diferencia se pierde. Deja un evento SALDO_REAL.
 */
async function guardarSaldoReal(periodo, cuentaId, { saldoReal, observacion }, { usuarioId }) {
  const per = normalizarPeriodo(periodo)
  if (per > periodoDe(new Date())) {
    throw errorHttp('No se puede registrar el saldo real de un mes que todavia no empieza', 400, { codigo: 'PERIODO_FUTURO' })
  }
  const real = parsearSaldo(saldoReal, 'saldoReal')
  const texto = observacion === undefined ? undefined : normalizarObservacion(observacion)

  const actual = await prisma.$transaction(async (tx) => {
    await periodoAbierto(tx, per)
    const [antes] = await calcularSaldosPeriodo(tx, per, { cuentaId })
    const cambia = !antes.fila || !new Decimal(antes.fila.saldoReal).equals(real)

    await tx.saldoRealPeriodo.upsert({
      where: { cuentaId_periodo: { cuentaId, periodo: per } },
      create: { cuentaId, periodo: per, saldoReal: real, observacion: texto ?? null, registradoPorId: usuarioId },
      update: {
        saldoReal: real,
        registradoPorId: usuarioId,
        ...(texto !== undefined ? { observacion: texto } : {}),
        ...(cambia ? { diferenciaRevisada: false, revisadaPorId: null, revisadaEn: null } : {})
      }
    })
    await registrarEvento(tx, {
      cuentaId,
      periodo: per,
      operacion: 'SALDO_REAL',
      resultado: 'EXITOSO',
      usuarioId,
      detalle: {
        antes: antes.fila ? dinero(antes.fila.saldoReal) : null,
        despues: dinero(real),
        saldoRegistrado: dinero(antes.calculo.saldoRegistrado),
        diferencia: dinero(real.minus(antes.calculo.saldoRegistrado))
      }
    })
    const [despues] = await calcularSaldosPeriodo(tx, per, { cuentaId })
    return despues
  }, OPCIONES_TX)

  return presentarSaldo(actual)
}

/**
 * Revisa la diferencia entre el saldo real y el registrado (CA13): el Administrador la explica y queda
 * registrada. Sin revision vigente el periodo no se puede cerrar. Deja un evento REVISAR_DIFERENCIA con una
 * foto de ambos saldos.
 */
async function revisarDiferencia(periodo, cuentaId, { observacion }, { usuarioId }) {
  const per = normalizarPeriodo(periodo)
  const texto = normalizarObservacion(observacion)
  if (!texto) {
    throw errorHttp('Faltan campos obligatorios: observacion', 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: ['observacion'] }
    })
  }

  const actual = await prisma.$transaction(async (tx) => {
    await periodoAbierto(tx, per)
    const [item] = await calcularSaldosPeriodo(tx, per, { cuentaId })
    if (!item.fila) {
      throw errorHttp('Primero guarde el saldo real de esta cuenta en este periodo', 409, { codigo: 'SALDO_REAL_FALTANTE' })
    }
    if (item.calculo.diferencia.isZero()) {
      throw errorHttp('No hay diferencia que revisar: el saldo real coincide con el registrado', 409, { codigo: 'SIN_DIFERENCIA' })
    }

    await tx.saldoRealPeriodo.update({
      where: { cuentaId_periodo: { cuentaId, periodo: per } },
      data: { diferenciaRevisada: true, revisadaPorId: usuarioId, revisadaEn: new Date(), observacion: texto }
    })
    await registrarEvento(tx, {
      cuentaId,
      periodo: per,
      operacion: 'REVISAR_DIFERENCIA',
      resultado: 'EXITOSO',
      usuarioId,
      detalle: {
        saldoRegistrado: dinero(item.calculo.saldoRegistrado),
        saldoReal: dinero(item.fila.saldoReal),
        diferencia: dinero(item.calculo.diferencia),
        observacion: texto
      }
    })
    const [despues] = await calcularSaldosPeriodo(tx, per, { cuentaId })
    return despues
  }, OPCIONES_TX)

  return presentarSaldo(actual)
}

/**
 * Resumen de conciliacion de un periodo (CA18): total de ingresos y egresos, cuantos movimientos estan
 * conciliados, pendientes o con diferencia, y las diferencias de saldo por cuenta.
 */
async function resumenPeriodo(periodo, { cuentaId } = {}) {
  const per = normalizarPeriodo(periodo)
  const grupos = await prisma.movimientoCaja.groupBy({
    by: ['tipo', 'estado'],
    where: { periodo: per, ...(cuentaId ? { cuentaId } : {}) },
    _sum: { monto: true },
    _count: { _all: true }
  })
  const items = await calcularSaldosPeriodo(prisma, per, { cuentaId })
  const ultimo = await ultimoCierre(prisma)

  return {
    periodo: per,
    periodoCerrado: estaCerrado(per, ultimo),
    ...resumenDeConciliacion(grupos),
    diferenciasDeSaldo: items
      .filter((i) => i.calculo.diferencia && !i.calculo.diferencia.isZero())
      .map((i) => ({
        cuenta: { id: i.cuenta.id, nombre: i.cuenta.nombre },
        saldoRegistrado: dinero(i.calculo.saldoRegistrado),
        saldoReal: dinero(i.calculo.saldoReal),
        diferencia: dinero(i.calculo.diferencia),
        revisada: i.revisadaVigente
      })),
    cuentasSinSaldoReal: items.filter((i) => seMuestra(i.cuenta, i.calculo, i.fila) && !i.fila).map((i) => ({ id: i.cuenta.id, nombre: i.cuenta.nombre }))
  }
}

module.exports = {
  saldoConciliadoDe,
  calcularSaldosPeriodo,
  obtenerSaldos,
  guardarSaldoReal,
  revisarDiferencia,
  resumenPeriodo
}
