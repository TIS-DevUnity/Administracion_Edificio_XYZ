const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { errorHttp } = require('../expensas/saldo.util')
const { dinero } = require('./cuentas.util')
const { CLAVE_BLOQUEO_PERIODOS, ultimoCierre } = require('./periodos.util')
const { normalizarPeriodo, rangoDePeriodo, rangoDiasDePeriodo, mesTerminado } = require('./calendario.util')
const { registrarEvento } = require('./eventos.util')
const { normalizarObservacion } = require('./conciliacion.util')
const { presentarMovimiento, paginar, armarPaginacion } = require('./movimientos-caja.util')
const { calcularSaldosPeriodo } = require('./saldos.service')
const { entraAlCierre, presentarCuenta, resumenDeConciliacion } = require('./saldos.util')
const {
  MAX_EJEMPLOS,
  periodoEsperado,
  normalizarConfirmaciones,
  desfaseDeAsiento,
  evaluarBloqueos,
  fotoDeCuenta,
  presentarFoto,
  totalizarFotos
} = require('./cierres.util')

const OPCIONES_TX_CIERRE = { timeout: 30000 }
const MAX_DETALLE = 100
const PERSONA = { select: { id: true, nombre: true, apellido: true } }
const SIN_RESOLVER = ['PENDIENTE', 'CON_DIFERENCIA']

/**
 * Reune lo que hay que mirar para decidir si un periodo se puede cerrar. La vista previa y el cierre usan
 * esto mismo, asi lo que se ve es lo que se evalua. `db` es prisma o una transaccion (consultas en serie).
 */
async function reunirHechos(db, periodo, ahora = new Date()) {
  const ultimo = await ultimoCierre(db)
  const primero = await db.movimientoCaja.findFirst({ orderBy: { periodo: 'asc' }, select: { periodo: true } })

  const porEstado = await db.movimientoCaja.groupBy({ by: ['estado'], where: { periodo }, _count: { _all: true } })
  const contar = (estado) => porEstado.find((g) => g.estado === estado)?._count?._all ?? 0
  const sinResolver = await db.movimientoCaja.findMany({
    where: { periodo, estado: { in: SIN_RESOLVER } },
    include: { cuenta: { select: { id: true, nombre: true, tipo: true } }, recibo: { select: { metodoPago: true } } },
    orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    take: MAX_DETALLE
  })

  // C1: todo cobro y todo movimiento del mes debe tener su asiento.
  const instantes = rangoDePeriodo(periodo)
  const dias = rangoDiasDePeriodo(periodo)
  const whereRecibos = { fechaPago: { gte: instantes.inicio, lt: instantes.fin }, metodoPago: { not: 'SALDO_A_FAVOR' } }
  const whereMovimientos = { fecha: { gte: dias.inicio, lt: dias.fin } }
  const recibosSin = await db.recibo.findMany({
    where: { ...whereRecibos, movimientoCaja: { is: null } },
    select: { id: true, folioNumero: true },
    orderBy: { folioNumero: 'asc' },
    take: MAX_EJEMPLOS
  })
  const recibosSinTotal = await db.recibo.count({ where: { ...whereRecibos, movimientoCaja: { is: null } } })
  const movimientosSin = await db.movimientoFinanciero.findMany({
    where: { ...whereMovimientos, movimientoCaja: { is: null } },
    select: { id: true, concepto: true },
    orderBy: { fecha: 'asc' },
    take: MAX_EJEMPLOS
  })
  const movimientosSinTotal = await db.movimientoFinanciero.count({ where: { ...whereMovimientos, movimientoCaja: { is: null } } })

  // C2: los asientos del mes coinciden con su origen, y los origenes del mes no tienen su asiento en otro mes.
  const asientos = await db.movimientoCaja.findMany({
    where: { periodo, origen: { in: ['RECIBO', 'MOVIMIENTO_FINANCIERO'] } },
    select: {
      id: true,
      origen: true,
      monto: true,
      tipo: true,
      periodo: true,
      cuenta: { select: { tipo: true } },
      recibo: { select: { montoTotal: true, fechaPago: true, metodoPago: true } },
      movimientoFinanciero: { select: { monto: true, tipo: true, fecha: true } }
    }
  })
  const desfases = asientos
    .map((a) => ({ asientoId: a.id, origen: a.origen, motivo: desfaseDeAsiento(a) }))
    .filter((d) => d.motivo)
  const recibosEnOtroMes = await db.recibo.findMany({
    where: { ...whereRecibos, movimientoCaja: { is: { periodo: { not: periodo } } } },
    select: { id: true },
    take: MAX_EJEMPLOS
  })
  const movimientosEnOtroMes = await db.movimientoFinanciero.findMany({
    where: { ...whereMovimientos, movimientoCaja: { is: { periodo: { not: periodo } } } },
    select: { id: true },
    take: MAX_EJEMPLOS
  })
  for (const r of recibosEnOtroMes) desfases.push({ origenId: r.id, origen: 'RECIBO', motivo: 'su asiento esta en otro periodo' })
  for (const m of movimientosEnOtroMes) desfases.push({ origenId: m.id, origen: 'MOVIMIENTO_FINANCIERO', motivo: 'su asiento esta en otro periodo' })

  // Saldos de las cuentas que forman parte del cierre.
  const saldos = await calcularSaldosPeriodo(db, periodo)
  const cuentas = saldos
    .filter((i) => entraAlCierre(i.cuenta, i.calculo))
    .map((i) => ({
      cuentaId: i.cuenta.id,
      nombre: i.cuenta.nombre,
      cuenta: i.cuenta,
      calculo: i.calculo,
      saldoReal: i.calculo.saldoReal,
      diferencia: i.calculo.diferencia,
      revisadaVigente: i.revisadaVigente,
      observacion: i.fila?.observacion ?? null
    }))

  return {
    periodo,
    ahora,
    ultimoCierre: ultimo,
    primerPeriodo: primero ? primero.periodo : null,
    pendientes: contar('PENDIENTE'),
    conDiferencia: contar('CON_DIFERENCIA'),
    sinResolver,
    faltantes: {
      recibos: recibosSinTotal,
      movimientos: movimientosSinTotal,
      ejemplos: {
        recibos: recibosSin.map((r) => r.id),
        movimientos: movimientosSin.map((m) => m.id)
      }
    },
    desfases,
    cuentas
  }
}

function presentarCuentaDeCierre(c) {
  const hayDiferencia = Boolean(c.diferencia) && !c.diferencia.isZero()
  return {
    cuenta: presentarCuenta(c.cuenta),
    saldoRegistrado: dinero(c.calculo.saldoRegistrado),
    saldoConciliado: dinero(c.calculo.saldoConciliado),
    saldoReal: c.saldoReal ? dinero(c.saldoReal) : null,
    diferencia: c.diferencia ? dinero(c.diferencia) : null,
    diferenciaRevisada: Boolean(c.revisadaVigente),
    observacion: c.observacion,
    requiereConfirmacion: hayDiferencia
  }
}

/**
 * Vista previa del cierre (CA14): dice si el periodo se puede cerrar y, si no, TODOS los motivos, con el detalle
 * de los movimientos pendientes o con diferencia y de las diferencias de saldo. No escribe nada.
 */
async function vistaPrevia(periodo) {
  const per = normalizarPeriodo(periodo)
  const h = await reunirHechos(prisma, per)
  const bloqueos = evaluarBloqueos(h, { evaluarConfirmacion: false })
  return {
    periodo: per,
    puedeCerrar: bloqueos.length === 0,
    periodoEsperado: periodoEsperado(h),
    mesTerminado: mesTerminado(per, h.ahora),
    bloqueos,
    sinResolver: {
      cantidad: h.pendientes + h.conDiferencia,
      pendientes: h.pendientes,
      conDiferencia: h.conDiferencia,
      movimientos: h.sinResolver.map((m) => presentarMovimiento(m, h.ultimoCierre)),
      hayMas: h.pendientes + h.conDiferencia > h.sinResolver.length
    },
    asientosFaltantes: h.faltantes,
    desfases: { cantidad: h.desfases.length, ejemplos: h.desfases.slice(0, MAX_EJEMPLOS) },
    cuentas: h.cuentas.map(presentarCuentaDeCierre)
  }
}

/** Un cierre rechazado queda en el historial (un evento por cuenta, porque el evento exige cuenta). */
async function registrarRechazosCierre(err, periodo, usuarioId) {
  try {
    for (const cuentaId of err.cuentasIds ?? []) {
      await registrarEvento(prisma, {
        cuentaId,
        periodo,
        operacion: 'CIERRE',
        resultado: 'RECHAZADO',
        usuarioId,
        detalle: { bloqueos: (err.detalle?.bloqueos ?? []).map((b) => ({ codigo: b.codigo, mensaje: b.mensaje })) }
      })
    }
  } catch (errEvento) {
    console.error(`[caja-bancos] No se pudo registrar el cierre rechazado: ${errEvento.message}`)
  }
}

/**
 * Cierra un periodo (CA14, CA15). En una sola transaccion con el lock exclusivo de periodos (espera a los cobros
 * en curso y frena a los nuevos) se vuelven a evaluar todas las reglas; si hay algun bloqueo responde 409
 * CIERRE_BLOQUEADO con la lista completa. Si todo esta bien guarda el cierre y la foto de saldos de cada cuenta.
 * `confirmarDiferencias` debe incluir cada cuenta con diferencia: la confirmacion es explicita.
 */
async function cerrar(periodo, { confirmarDiferencias, observacion }, { usuarioId, ip }) {
  const per = normalizarPeriodo(periodo)
  const confirmadas = normalizarConfirmaciones(confirmarDiferencias)
  const texto = observacion === undefined ? null : normalizarObservacion(observacion)

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLAVE_BLOQUEO_PERIODOS}))`

      const h = await reunirHechos(tx, per)
      const bloqueos = evaluarBloqueos(h, { evaluarConfirmacion: true, confirmadas })
      if (bloqueos.length > 0) {
        throw errorHttp('El periodo no se puede cerrar: resuelva los bloqueos indicados', 409, {
          codigo: 'CIERRE_BLOQUEADO',
          detalle: { periodo: per, bloqueos },
          cuentasIds: h.cuentas.map((c) => c.cuentaId)
        })
      }

      const cierre = await tx.cierreCaja.create({ data: { periodo: per, observacion: texto, cerradoPorId: usuarioId } })
      const fotos = []
      for (const c of h.cuentas) {
        const foto = fotoDeCuenta(c, confirmadas)
        await tx.cierreCajaCuenta.create({ data: { cierreId: cierre.id, cuentaId: c.cuentaId, ...foto } })
        await registrarEvento(tx, {
          cuentaId: c.cuentaId,
          periodo: per,
          operacion: 'CIERRE',
          resultado: 'EXITOSO',
          usuarioId,
          detalle: {
            saldoRegistrado: dinero(foto.saldoRegistrado),
            saldoConciliado: dinero(foto.saldoConciliado),
            saldoReal: dinero(foto.saldoReal),
            diferencia: dinero(foto.diferencia),
            diferenciaConfirmada: foto.diferenciaConfirmada
          }
        })
        fotos.push({ foto, cuenta: c.cuenta })
      }
      return { cierre, fotos }
    }, OPCIONES_TX_CIERRE)
  } catch (err) {
    if (err.codigo === 'CIERRE_BLOQUEADO') await registrarRechazosCierre(err, per, usuarioId)
    // Dos cierres del mismo periodo a la vez: el segundo ya no puede (lo frena el lock; esto es por si acaso).
    if (err.code === 'P2002') throw errorHttp(`El periodo ${per} ya esta cerrado`, 409, { codigo: 'PERIODO_YA_CERRADO' })
    throw err
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'CierreCaja',
    entidadId: resultado.cierre.id,
    detalle: { periodo: per, cuentas: resultado.fotos.length, observacion: texto },
    ip
  })

  const fotos = resultado.fotos.map(({ foto, cuenta }) => presentarFoto(foto, cuenta))
  return {
    cierre: {
      id: resultado.cierre.id,
      periodo: per,
      cerradoEn: resultado.cierre.cerradoEn,
      observacion: texto
    },
    cuentas: fotos,
    totales: totalizarFotos(resultado.fotos.map((f) => f.foto))
  }
}

/** Historial de periodos cerrados (CA17): solo lectura, del mas reciente al mas antiguo. */
async function listarCierres(query = {}) {
  const { numeroPagina, tamanio } = paginar(query.pagina, query.porPagina)
  const [cierres, total] = await Promise.all([
    prisma.cierreCaja.findMany({
      orderBy: { periodo: 'desc' },
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio,
      include: {
        cerradoPor: PERSONA,
        cuentas: { select: { saldoRegistrado: true, saldoConciliado: true, saldoReal: true, diferencia: true } }
      }
    }),
    prisma.cierreCaja.count()
  ])
  return {
    cierres: cierres.map((c) => ({
      id: c.id,
      periodo: c.periodo,
      cerradoEn: c.cerradoEn,
      cerradoPor: c.cerradoPor ?? null,
      observacion: c.observacion ?? null,
      cuentas: c.cuentas.length,
      totales: totalizarFotos(c.cuentas)
    })),
    paginacion: armarPaginacion(numeroPagina, tamanio, total)
  }
}

/** Resultado mensual de un periodo cerrado (CA19): los saldos de cada cuenta al momento del cierre. */
async function obtenerCierre(periodo) {
  const per = normalizarPeriodo(periodo)
  const cierre = await prisma.cierreCaja.findUnique({
    where: { periodo: per },
    include: { cerradoPor: PERSONA, cuentas: { include: { cuenta: { select: { id: true, nombre: true, tipo: true } } } } }
  })
  if (!cierre) throw errorHttp('Ese periodo no esta cerrado', 404)

  const grupos = await prisma.movimientoCaja.groupBy({
    by: ['tipo', 'estado'],
    where: { periodo: per },
    _sum: { monto: true },
    _count: { _all: true }
  })
  return {
    cierre: {
      id: cierre.id,
      periodo: cierre.periodo,
      cerradoEn: cierre.cerradoEn,
      cerradoPor: cierre.cerradoPor ?? null,
      observacion: cierre.observacion ?? null
    },
    cuentas: cierre.cuentas.map((c) => presentarFoto(c, c.cuenta)),
    totales: totalizarFotos(cierre.cuentas),
    resumen: resumenDeConciliacion(grupos)
  }
}

module.exports = { reunirHechos, vistaPrevia, cerrar, listarCierres, obtenerCierre }
