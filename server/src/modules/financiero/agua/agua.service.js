const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  sumarCampo,
  calcularEstado,
  aplicarSaldoAExpensa
} = require('../expensas/saldo.util')

const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/
const OPCIONES_TX = { timeout: 30000 }

function validarPeriodo(periodo) {
  if (typeof periodo !== 'string' || !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }
}

/**
 * Reparte la factura entre las expensas segun el peso de cada una.
 *
 *   unidad  = montoFactura / suma de pesos
 *   a pagar = peso * unidad   (redondeado a 2 decimales)
 *
 * Los centavos que quedan por el redondeo se ajustan en el ultimo item para que la suma sea
 * exactamente la factura. Funcion pura: `items` es [{ id, peso }].
 */
function calcularReparto(montoFactura, items) {
  const monto = new Decimal(montoFactura)
  const totalPesos = items.reduce((acc, item) => acc.plus(item.peso), new Decimal(0))
  if (totalPesos.lte(0)) {
    throw errorHttp('No hay pesos que repartir', 409)
  }

  const valorUnidad = monto.div(totalPesos)
  const partes = items.map((item) => ({
    id: item.id,
    peso: new Decimal(item.peso),
    monto: new Decimal(item.peso).times(valorUnidad).toDecimalPlaces(2)
  }))

  const suma = partes.reduce((acc, parte) => acc.plus(parte.monto), new Decimal(0))
  const diferencia = monto.minus(suma)
  if (!diferencia.isZero()) {
    const ultima = partes[partes.length - 1]
    ultima.monto = ultima.monto.plus(diferencia)
  }

  return { totalPesos, valorUnidad, partes }
}

/** Vista del reparto de un periodo, a partir de lo guardado en las expensas. */
function armarReparto(expensas) {
  return expensas.map((e) => ({
    expensaId: e.id,
    inmuebleId: e.inmuebleId,
    inmuebleCodigo: e.inmueble.codigo,
    tipo: e.tipoNombre,
    peso: new Decimal(e.pesoAgua).toString(),
    montoBase: new Decimal(e.montoBase).toFixed(2),
    montoAgua: new Decimal(e.montoAgua).toFixed(2),
    montoTotal: new Decimal(e.montoTotal).toFixed(2)
  }))
}

function datosFactura(factura) {
  return {
    id: factura.id,
    periodo: factura.periodo,
    montoFactura: new Decimal(factura.montoFactura).toFixed(2),
    totalPesos: new Decimal(factura.totalPesos).toString(),
    valorUnidad: new Decimal(factura.valorUnidad).toFixed(6),
    departamentos: factura.departamentos,
    updatedAt: factura.updatedAt
  }
}

/**
 * Calcula y guarda el agua de cada expensa del periodo a partir del monto de la factura.
 * Debe llamarse dentro de una transaccion. Es repetible: usa el peso guardado en cada expensa
 * (foto del momento en que se genero), asi que correrlo de nuevo con el mismo monto da lo
 * mismo. Rechaza el reparto si dejaria alguna expensa con menos monto que lo que ya pago.
 */
async function aplicarReparto(tx, periodo, montoFactura, { usuarioId = null } = {}) {
  // Se bloquean primero los inmuebles y luego las expensas del periodo, en orden fijo y con el
  // mismo orden que los pagos (inmueble -> expensa), para no cruzarse con pagos simultaneos.
  await tx.$queryRaw`
    SELECT "id" FROM "inmuebles"
    WHERE "id" IN (SELECT "inmuebleId" FROM "expensas" WHERE "periodo" = ${periodo})
    ORDER BY "id" FOR UPDATE`
  await tx.$queryRaw`SELECT "id" FROM "expensas" WHERE "periodo" = ${periodo} ORDER BY "id" FOR UPDATE`

  const expensas = await tx.expensa.findMany({
    where: { periodo },
    include: { pagos: true, inmueble: { select: { codigo: true } } },
    orderBy: { inmueble: { codigo: 'asc' } }
  })

  if (expensas.length === 0) {
    throw errorHttp(`No hay expensas generadas para el periodo ${periodo}: genere primero las expensas`, 409)
  }

  const { totalPesos, valorUnidad, partes } = calcularReparto(
    montoFactura,
    expensas.map((e) => ({ id: e.id, peso: e.pesoAgua }))
  )

  const montoPorExpensa = new Map(partes.map((parte) => [parte.id, parte.monto]))

  // Ninguna expensa puede quedar con menos monto que lo ya pagado.
  for (const e of expensas) {
    const nuevoTotal = new Decimal(e.montoBase).plus(montoPorExpensa.get(e.id))
    const pagadoExpensa = sumarCampo(e.pagos, 'montoExpensa')
    if (nuevoTotal.lt(pagadoExpensa)) {
      throw errorHttp(
        `No se puede aplicar ese monto: la expensa de ${e.inmueble.codigo} quedaria en Bs ${nuevoTotal.toFixed(2)} ` +
          `y ya pago Bs ${pagadoExpensa.toFixed(2)}`,
        409,
        { codigo: 'AGUA_MENOR_A_LO_PAGADO', detalle: { inmueble: e.inmueble.codigo } }
      )
    }
  }

  const actualizadas = []
  for (const e of expensas) {
    const montoAgua = montoPorExpensa.get(e.id)
    const montoTotal = new Decimal(e.montoBase).plus(montoAgua)
    const estado = calcularEstado({ montoTotal, montoMora: e.montoMora, pagos: e.pagos })
    await tx.expensa.update({ where: { id: e.id }, data: { montoAgua, montoTotal, estado } })
    actualizadas.push({ ...e, montoAguaAnterior: e.montoAgua, montoAgua, montoTotal })
  }

  // Si el agua subio y al inmueble le sobra saldo a favor, se usa para cubrir ese aumento.
  // Solo cuando esta es su deuda mas antigua: los pagos van del mes mas antiguo al mas nuevo.
  const saldosAplicados = []
  for (const e of actualizadas) {
    if (!new Decimal(e.montoAgua).gt(e.montoAguaAnterior)) continue

    const anteriores = await tx.expensa.count({
      where: { inmuebleId: e.inmuebleId, id: { not: e.id }, estado: { not: 'PAGADA' }, periodo: { lt: periodo } }
    })
    if (anteriores > 0) continue

    const saldo = await aplicarSaldoAExpensa(tx, e, usuarioId)
    if (saldo.aplicado.gt(0)) {
      saldosAplicados.push({ expensaId: e.id, inmuebleCodigo: e.inmueble.codigo, ...saldo })
    }
  }

  return { totalPesos, valorUnidad, departamentos: expensas.length, expensas: actualizadas, saldosAplicados }
}

/** Deja en la auditoria el saldo a favor que se uso para cubrir el aumento del agua. */
async function auditarSaldosAplicados(saldosAplicados, { periodo, usuarioId, ip }) {
  for (const s of saldosAplicados) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MovimientoSaldo',
      entidadId: s.movimiento.id,
      detalle: {
        tipo: 'APLICACION_EXPENSA',
        motivo: 'AGUA',
        periodo,
        inmueble: s.inmuebleCodigo,
        expensaId: s.expensaId,
        monto: new Decimal(s.movimiento.monto).toString()
      },
      ip
    })
  }
}

/**
 * Registra (o corrige) la factura de agua del periodo y reparte el monto entre las expensas
 * generadas de ese periodo.
 */
async function registrar({ periodo, montoFactura, usuarioId = null, ip = null }) {
  validarPeriodo(periodo)
  const monto = parsearMonto(montoFactura, 'montoFactura')

  const resultado = await prisma.$transaction(async (tx) => {
    const previa = await tx.facturaAgua.findUnique({ where: { periodo } })
    const reparto = await aplicarReparto(tx, periodo, monto, { usuarioId })

    const datos = {
      montoFactura: monto,
      totalPesos: reparto.totalPesos,
      valorUnidad: reparto.valorUnidad,
      departamentos: reparto.departamentos,
      registradoPorId: usuarioId
    }
    const factura = previa
      ? await tx.facturaAgua.update({ where: { periodo }, data: datos })
      : await tx.facturaAgua.create({ data: { periodo, ...datos } })

    return { factura, reparto, previa }
  }, OPCIONES_TX)

  const { factura, reparto, previa } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: previa ? 'UPDATE' : 'CREATE',
    entidad: 'FacturaAgua',
    entidadId: factura.id,
    detalle: {
      periodo,
      montoFactura: previa
        ? { antes: new Decimal(previa.montoFactura).toFixed(2), despues: monto.toFixed(2) }
        : monto.toFixed(2),
      totalPesos: reparto.totalPesos.toString(),
      valorUnidad: reparto.valorUnidad.toFixed(6),
      departamentos: reparto.departamentos
    },
    ip
  })

  await auditarSaldosAplicados(reparto.saldosAplicados, { periodo, usuarioId, ip })

  return {
    factura: datosFactura(factura),
    reparto: armarReparto(reparto.expensas),
    // Saldo a favor que se uso para cubrir el aumento del agua (si lo habia).
    saldoFavorAplicado: reparto.saldosAplicados.map((s) => ({
      inmuebleCodigo: s.inmuebleCodigo,
      monto: s.aplicado.toFixed(2)
    })),
    mensaje: previa ? 'Factura de agua corregida y repartida de nuevo' : 'Factura de agua registrada y repartida'
  }
}

/**
 * Vuelve a repartir la factura de un periodo (si existe). Se usa despues de generar
 * expensas, para que las nuevas entren en el reparto. No hace nada si el periodo no tiene
 * factura registrada.
 */
async function recalcularPeriodo(periodo, { usuarioId = null, ip = null, motivo = 'EXPENSAS_GENERADAS' } = {}) {
  const factura = await prisma.facturaAgua.findUnique({ where: { periodo } })
  if (!factura) return null

  const reparto = await prisma.$transaction(
    (tx) => aplicarReparto(tx, periodo, factura.montoFactura, { usuarioId }),
    OPCIONES_TX
  )
  await auditarSaldosAplicados(reparto.saldosAplicados, { periodo, usuarioId, ip })

  await prisma.facturaAgua.update({
    where: { periodo },
    data: {
      totalPesos: reparto.totalPesos,
      valorUnidad: reparto.valorUnidad,
      departamentos: reparto.departamentos
    }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'FacturaAgua',
    entidadId: factura.id,
    detalle: {
      periodo,
      motivo,
      totalPesos: reparto.totalPesos.toString(),
      valorUnidad: reparto.valorUnidad.toFixed(6),
      departamentos: reparto.departamentos
    },
    ip
  })

  return reparto
}

async function obtenerPorPeriodo(periodo) {
  validarPeriodo(periodo)

  const factura = await prisma.facturaAgua.findUnique({ where: { periodo } })
  if (!factura) {
    throw errorHttp(`No hay factura de agua registrada para el periodo ${periodo}`, 404)
  }

  const expensas = await prisma.expensa.findMany({
    where: { periodo },
    include: { inmueble: { select: { codigo: true } } },
    orderBy: { inmueble: { codigo: 'asc' } }
  })

  return { factura: datosFactura(factura), reparto: armarReparto(expensas) }
}

async function listar() {
  const facturas = await prisma.facturaAgua.findMany({ orderBy: { periodo: 'desc' } })
  return facturas.map(datosFactura)
}

module.exports = { calcularReparto, registrar, recalcularPeriodo, obtenerPorPeriodo, listar }
