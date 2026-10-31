const { randomUUID } = require('node:crypto')
const { Prisma } = require('@prisma/client')
const prisma = require('../../../config/prisma')
const { Decimal, errorHttp } = require('../expensas/saldo.util')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { distribuirAnticipos } = require('../anticipos/anticipos.util')
const personal = require('../caja-bancos/asientos-personal.util')
const { instanteDeDia } = require('../caja-bancos/periodos.util')
const { fechaEnZona } = require('../expensas/mora.util')
const util = require('./nomina.util')
const { construirReporte, resumirPeriodos } = require('./reporte.util')

const OPCIONES_TX = { timeout: 15000 } // la generacion recorre a todos los empleados activos
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200

const INCLUIR_EMPLEADO = { select: { id: true, nombres: true, apellidos: true, cargo: true, documento: true } }
const INCLUIR_DETALLE = {
  empleado: INCLUIR_EMPLEADO,
  conceptos: { orderBy: { createdAt: 'asc' } },
  anticiposAplicados: { include: { anticipo: { select: { id: true, fecha: true, monto: true } } }, orderBy: { createdAt: 'asc' } }
}

function normalizarPagina(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

// ---------------------------------------------------------------------------
// Generacion mensual
// ---------------------------------------------------------------------------

/**
 * Descuento automatico de anticipos en las nominas recien insertadas (`nominas`: { id, empleadoId, sueldoBase }).
 * Por cada empleado se bloquean (FOR UPDATE) sus anticipos PENDIENTE/PARCIAL con fecha hasta el ultimo dia del
 * periodo y se reparten del mas antiguo al mas nuevo hasta el sueldo base (la nomina nace sin conceptos, asi
 * que el neto nunca queda negativo). Lo que no cabe sigue pendiente para la nomina siguiente. Guarda cada
 * AplicacionAnticipo, actualiza montoDescontado y estado del anticipo, y deja totalAnticipos y sueldoNeto de
 * la nomina calculados. Devuelve el detalle de cada aplicacion para auditarlo despues del commit.
 */
async function aplicarAnticipos(tx, nominas, ultimoDia) {
  if (nominas.length === 0) return []
  const empleadoIds = nominas.map((n) => n.empleadoId)
  const hasta = new Date(`${ultimoDia}T00:00:00Z`)

  await tx.$queryRaw`
    SELECT "id" FROM "anticipos_salariales"
    WHERE "empleadoId" IN (${Prisma.join(empleadoIds)})
      AND "estado" IN ('PENDIENTE', 'PARCIAL')
      AND "fecha" <= ${ultimoDia}::date
    ORDER BY "fecha", "createdAt", "id"
    FOR UPDATE`
  const anticipos = await tx.anticipoSalarial.findMany({
    where: { empleadoId: { in: empleadoIds }, estado: { in: ['PENDIENTE', 'PARCIAL'] }, fecha: { lte: hasta } },
    orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  })

  const descuentos = []
  for (const nomina of nominas) {
    const propios = anticipos.filter((a) => a.empleadoId === nomina.empleadoId)
    const { aplicaciones, total } = distribuirAnticipos(propios, nomina.sueldoBase)
    if (aplicaciones.length === 0) continue

    await tx.aplicacionAnticipo.createMany({
      data: aplicaciones.map((a) => ({ anticipoId: a.anticipoId, nominaId: nomina.id, monto: a.monto }))
    })
    for (const a of aplicaciones) {
      const antes = propios.find((p) => p.id === a.anticipoId)
      await tx.anticipoSalarial.update({
        where: { id: a.anticipoId },
        data: { montoDescontado: a.montoDescontado, estado: a.estado }
      })
      descuentos.push({
        anticipoId: a.anticipoId,
        nominaId: nomina.id,
        monto: util.dinero(a.monto),
        descontadoAntes: util.dinero(antes.montoDescontado),
        descontadoDespues: util.dinero(a.montoDescontado),
        estadoAntes: antes.estado,
        estadoDespues: a.estado
      })
    }
    const totales = util.validarNetoNoNegativo(util.calcularTotales([], nomina.sueldoBase, total))
    await tx.nomina.update({ where: { id: nomina.id }, data: util.totalesParaGuardar(totales) })
  }
  return descuentos
}

/**
 * Crea una nomina PENDIENTE por cada empleado ACTIVO que ya habia ingresado a mas tardar el ultimo dia del
 * periodo y que todavia no tiene nomina de ese periodo. Copia el sueldo base actual del empleado. Es
 * idempotente: las que ya existen se omiten (createMany con skipDuplicates, porque un P2002 dentro de una
 * transaccion de Postgres la abortaria si dos generaciones se cruzan).
 * totalAnticipos sale de las aplicaciones de anticipo de la nomina (hoy ninguna: 0).
 */
async function generar({ periodo, usuarioId, ip }) {
  const per = util.validarPeriodoGenerable(periodo)
  const ultimoDia = util.ultimoDiaDelPeriodo(per)

  const { creadas, omitidas, descuentos } = await prisma.$transaction(async (tx) => {
    const empleados = await tx.empleado.findMany({
      where: { estado: 'ACTIVO', fechaIngreso: { lte: new Date(`${ultimoDia}T00:00:00Z`) } },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }]
    })
    const existentes = await tx.nomina.findMany({
      where: { periodo: per, empleadoId: { in: empleados.map((e) => e.id) } },
      select: { empleadoId: true }
    })
    const yaTienen = new Set(existentes.map((n) => n.empleadoId))
    const faltantes = empleados.filter((e) => !yaTienen.has(e.id))

    // Ids propios para saber cuales se insertaron de verdad aunque otra generacion se haya cruzado.
    const filas = faltantes.map((e) => {
      const totales = util.calcularTotales([], e.sueldoBase, 0)
      return {
        id: randomUUID(),
        empleadoId: e.id,
        periodo: per,
        sueldoBase: totales.sueldoBase,
        ...util.totalesParaGuardar(totales),
        estado: 'PENDIENTE',
        registradoPorId: usuarioId ?? null
      }
    })
    if (filas.length) await tx.nomina.createMany({ data: filas, skipDuplicates: true })
    // Solo las que esta llamada inserto de verdad: las que ya existian, o las que creo otra generacion en
    // paralelo, no reciben descuento de anticipos.
    const insertadas = filas.length
      ? await tx.nomina.findMany({
          where: { id: { in: filas.map((f) => f.id) } },
          select: { id: true, empleadoId: true, sueldoBase: true }
        })
      : []
    const descuentos = await aplicarAnticipos(tx, insertadas, ultimoDia)
    const creadas = insertadas.length
      ? await tx.nomina.findMany({
          where: { id: { in: insertadas.map((n) => n.id) } },
          include: { empleado: INCLUIR_EMPLEADO },
          orderBy: [{ empleado: { apellidos: 'asc' } }, { empleado: { nombres: 'asc' } }]
        })
      : []
    return { creadas, omitidas: empleados.length - insertadas.length, descuentos }
  }, OPCIONES_TX)

  for (const nomina of creadas) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'Nomina',
      entidadId: nomina.id,
      detalle: {
        periodo: per,
        empleado: `${nomina.empleado.nombres} ${nomina.empleado.apellidos}`,
        documento: nomina.empleado.documento,
        sueldoBase: util.dinero(nomina.sueldoBase),
        totalAnticipos: util.dinero(nomina.totalAnticipos),
        sueldoNeto: util.dinero(nomina.sueldoNeto)
      },
      ip
    })
  }
  for (const d of descuentos) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'AnticipoSalarial',
      entidadId: d.anticipoId,
      detalle: {
        motivo: 'DESCUENTO_NOMINA',
        nominaId: d.nominaId,
        periodo: per,
        montoAplicado: d.monto,
        montoDescontado: { antes: d.descontadoAntes, despues: d.descontadoDespues },
        estado: { antes: d.estadoAntes, despues: d.estadoDespues }
      },
      ip
    })
  }

  return {
    periodo: per,
    creadas: creadas.length,
    omitidas,
    nominas: creadas.map(util.nominaParaCliente)
  }
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

/** Filtro de periodo: uno exacto y/o un rango (los periodos YYYY-MM se ordenan como texto). */
function filtroPeriodo(periodo, rango) {
  const condiciones = {
    ...(periodo ? { equals: periodo } : {}),
    ...(rango.desde ? { gte: rango.desde } : {}),
    ...(rango.hasta ? { lte: rango.hasta } : {})
  }
  return Object.keys(condiciones).length ? { periodo: condiciones } : {}
}

async function listar({ periodo, estado, q, empleadoId, periodoDesde, periodoHasta, pagina, porPagina } = {}) {
  const per = util.normalizarFiltroPeriodo(periodo)
  const rango = util.normalizarRangoPeriodos(periodoDesde, periodoHasta)
  const empleado = util.normalizarFiltroEmpleadoId(empleadoId)
  const est = util.normalizarFiltroEstado(estado)
  const busqueda = util.normalizarBusqueda(q)
  const { numeroPagina, tamanio } = normalizarPagina(pagina, porPagina)

  const where = {
    ...filtroPeriodo(per, rango),
    ...(empleado ? { empleadoId: empleado } : {}),
    ...(est ? { estado: est } : {}),
    ...(busqueda
      ? {
          empleado: {
            OR: ['nombres', 'apellidos', 'documento'].map((campo) => ({
              [campo]: { contains: busqueda, mode: 'insensitive' }
            }))
          }
        }
      : {})
  }

  const [nominas, total, porEstado] = await Promise.all([
    prisma.nomina.findMany({
      where,
      include: { empleado: INCLUIR_EMPLEADO },
      orderBy: [{ periodo: 'desc' }, { empleado: { apellidos: 'asc' } }, { empleado: { nombres: 'asc' } }, { id: 'asc' }],
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.nomina.count({ where }),
    // El resumen es del filtro completo, no solo de la pagina.
    prisma.nomina.groupBy({ by: ['estado'], where, _count: { _all: true }, _sum: { sueldoNeto: true } })
  ])

  const grupo = (e) => {
    const g = porEstado.find((x) => x.estado === e)
    return { cantidad: g?._count._all ?? 0, total: util.dinero(g?._sum.sueldoNeto) }
  }

  return {
    nominas: nominas.map(util.nominaParaCliente),
    resumen: { cantidad: total, pendientes: grupo('PENDIENTE'), pagadas: grupo('PAGADA') },
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

/** Periodos con nominas, el mas reciente primero: [{ periodo, cantidad, pendientes, pagadas, totalNeto }]. */
async function periodos() {
  const grupos = await prisma.nomina.groupBy({
    by: ['periodo', 'estado'],
    _count: { _all: true },
    _sum: { sueldoNeto: true }
  })
  return {
    periodos: resumirPeriodos(
      grupos.map((g) => ({ periodo: g.periodo, estado: g.estado, cantidad: g._count._all, total: g._sum.sueldoNeto }))
    )
  }
}

/**
 * Reporte mensual de gastos de personal. Consulta las nominas del periodo y los anticipos otorgados dentro del
 * mes (por la fecha del anticipo) y deja la agregacion a reporte.util (funcion pura). Un periodo sin nominas
 * devuelve ceros y listas vacias (no es un error).
 */
async function reporte({ periodo } = {}) {
  const per = util.validarPeriodo(periodo)
  const [nominas, anticipos] = await Promise.all([
    prisma.nomina.findMany({ where: { periodo: per }, include: { empleado: true } }),
    prisma.anticipoSalarial.findMany({
      where: { fecha: { gte: new Date(`${per}-01T00:00:00Z`), lte: new Date(`${util.ultimoDiaDelPeriodo(per)}T00:00:00Z`) } },
      include: { empleado: true }
    })
  ])
  return construirReporte({
    periodo: per,
    nominas: nominas.map((n) => ({
      id: n.id,
      periodo: n.periodo,
      empleado: n.empleado,
      sueldoBase: n.sueldoBase,
      totalBonos: n.totalBonos,
      totalHorasExtra: n.totalHorasExtra,
      totalDescuentos: n.totalDescuentos,
      totalAnticipos: n.totalAnticipos,
      sueldoNeto: n.sueldoNeto,
      estado: n.estado,
      fechaPago: n.fechaPago ? fechaEnZona(new Date(n.fechaPago)) : null
    })),
    anticipos: anticipos.map((a) => ({
      id: a.id,
      empleado: a.empleado,
      fecha: new Date(a.fecha).toISOString().slice(0, 10),
      monto: a.monto,
      metodoPago: a.metodoPago,
      estado: a.estado
    }))
  })
}

/** Datos planos de la boleta de sueldo (para el PDF). 404 si la nomina no existe. */
async function datosBoleta(id) {
  const nomina = await prisma.nomina.findUnique({
    where: { id },
    include: {
      empleado: true,
      conceptos: { orderBy: { createdAt: 'asc' } },
      anticiposAplicados: {
        include: { anticipo: { select: { fecha: true, descripcion: true, monto: true } } },
        orderBy: { createdAt: 'asc' }
      }
    }
  })
  if (!nomina) throw errorHttp('Nomina no encontrada', 404)
  return util.datosParaBoleta(nomina)
}

async function obtener(id) {
  const nomina = await prisma.nomina.findUnique({ where: { id }, include: INCLUIR_DETALLE })
  if (!nomina) throw errorHttp('Nomina no encontrada', 404)
  return { nomina: util.nominaParaCliente(nomina) }
}

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------

/**
 * Ejecuta un cambio de conceptos sobre una nomina PENDIENTE, dentro de una transaccion y con la fila
 * de la nomina bloqueada (dos cambios simultaneos esperan su turno). `cambiar(tx, nomina)` recibe la
 * nomina con sus conceptos y devuelve { conceptos, escribir, afectado }:
 *   - `conceptos`: la lista de conceptos que quedara (para calcular el neto antes de escribir);
 *   - `escribir(tx)`: aplica el cambio a la tabla de conceptos;
 *   - `afectado`: el concepto para la auditoria.
 * Los totales se recalculan siempre aqui, nunca desde el cliente. Si el neto quedaria negativo se rechaza
 * (400 NETO_NEGATIVO) y no se guarda nada.
 */
async function modificarConceptos(nominaId, { cambiar, accion, usuarioId, ip }) {
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "nominas" WHERE "id" = ${nominaId} FOR UPDATE`
    const nomina = await tx.nomina.findUnique({ where: { id: nominaId }, include: { conceptos: true } })
    if (!nomina) throw errorHttp('Nomina no encontrada', 404)
    if (nomina.estado !== 'PENDIENTE') {
      throw errorHttp('La nomina ya esta pagada: sus conceptos no se pueden modificar', 409, {
        codigo: 'NOMINA_PAGADA',
        detalle: { periodo: nomina.periodo }
      })
    }

    const cambio = await cambiar(tx, nomina)
    const aplicaciones = await tx.aplicacionAnticipo.findMany({ where: { nominaId }, select: { monto: true } })
    const totales = util.validarNetoNoNegativo(
      util.calcularTotales(cambio.conceptos, nomina.sueldoBase, util.totalAnticiposAplicados(aplicaciones))
    )

    await cambio.escribir(tx)
    await tx.nomina.update({ where: { id: nominaId }, data: util.totalesParaGuardar(totales) })
    const actualizada = await tx.nomina.findUnique({ where: { id: nominaId }, include: INCLUIR_DETALLE })
    return { nomina: actualizada, netoAntes: util.dinero(nomina.sueldoNeto), afectado: cambio.afectado }
  })

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Nomina',
    entidadId: nominaId,
    detalle: {
      periodo: resultado.nomina.periodo,
      concepto: { accion, ...resultado.afectado },
      sueldoNeto: { antes: resultado.netoAntes, despues: util.dinero(resultado.nomina.sueldoNeto) }
    },
    ip
  })
  return { nomina: util.nominaParaCliente(resultado.nomina) }
}

const resumenConcepto = (c) => ({
  conceptoId: c.id ?? null,
  tipo: c.tipo,
  descripcion: c.descripcion,
  monto: util.dinero(c.monto),
  horas: c.horas === null || c.horas === undefined ? null : new Decimal(c.horas).toFixed(2)
})

function agregarConcepto(nominaId, { datos, usuarioId, ip }) {
  const concepto = util.validarConcepto(datos)
  const id = randomUUID()
  return modificarConceptos(nominaId, {
    accion: 'AGREGAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => ({
      conceptos: [...nomina.conceptos, concepto],
      escribir: (db) => db.conceptoNomina.create({ data: { id, nominaId, ...concepto } }),
      afectado: resumenConcepto({ id, ...concepto })
    })
  })
}

function buscarConcepto(nomina, conceptoId) {
  const concepto = nomina.conceptos.find((c) => c.id === conceptoId)
  if (!concepto) throw errorHttp('Concepto no encontrado en esta nomina', 404)
  return concepto
}

function editarConcepto(nominaId, conceptoId, { datos, usuarioId, ip }) {
  return modificarConceptos(nominaId, {
    accion: 'EDITAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => {
      const actual = buscarConcepto(nomina, conceptoId)
      const nuevo = util.validarEdicionConcepto(actual, datos)
      return {
        conceptos: nomina.conceptos.map((c) => (c.id === conceptoId ? { ...c, ...nuevo } : c)),
        escribir: (db) =>
          db.conceptoNomina.update({
            where: { id: conceptoId },
            data: { descripcion: nuevo.descripcion, monto: nuevo.monto, horas: nuevo.horas }
          }),
        afectado: { ...resumenConcepto({ id: conceptoId, ...nuevo }), antes: resumenConcepto(actual) }
      }
    }
  })
}

function quitarConcepto(nominaId, conceptoId, { usuarioId, ip }) {
  return modificarConceptos(nominaId, {
    accion: 'QUITAR',
    usuarioId,
    ip,
    cambiar: async (tx, nomina) => {
      const actual = buscarConcepto(nomina, conceptoId)
      return {
        conceptos: nomina.conceptos.filter((c) => c.id !== conceptoId),
        escribir: (db) => db.conceptoNomina.delete({ where: { id: conceptoId } }),
        afectado: resumenConcepto(actual)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

/**
 * Confirma el pago de una nomina PENDIENTE, en una transaccion con la fila de la nomina bloqueada: dos
 * solicitudes simultaneas no pagan dos veces (la segunda ve PAGADA y recibe 409 NOMINA_YA_PAGADA).
 *  - El monto debe ser igual al sueldo neto (400 MONTO_NO_COINCIDE); no hay pagos parciales.
 *  - Con CAJA_BANCOS_ASIENTOS activo se registra el egreso en caja o banco (cuenta indicada o la cuenta por
 *    defecto del metodo de pago); si el mes de caja esta cerrado: 409 PERIODO_CERRADO y no se guarda nada.
 *    Con el interruptor apagado no se crea asiento ni se valida el periodo: el pago se confirma igual.
 *  - Si el neto es 0 (los anticipos consumieron el sueldo) se confirma con monto 0, sin movimiento de caja.
 *  - Un empleado inactivo puede cobrar una nomina pendiente que ya existia.
 * Una nomina pagada no se vuelve a modificar: no existe ninguna ruta para editarla, anularla ni borrarla.
 */
async function pagar(nominaId, { datos, usuarioId, ip }) {
  const valores = util.validarDatosPago(datos)
  const cuentaId = personal.normalizarCuentaNomina(datos.cuentaId) // formato, antes de abrir la transaccion

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "nominas" WHERE "id" = ${nominaId} FOR UPDATE`
    const nomina = await tx.nomina.findUnique({ where: { id: nominaId }, include: { empleado: INCLUIR_EMPLEADO } })
    if (!nomina) throw errorHttp('Nomina no encontrada', 404)
    if (nomina.estado === 'PAGADA') {
      throw errorHttp('La nomina ya esta pagada: no se puede registrar el pago otra vez', 409, {
        codigo: 'NOMINA_YA_PAGADA',
        detalle: { periodo: nomina.periodo, fechaPago: nomina.fechaPago }
      })
    }
    const neto = util.validarMontoPago(valores.monto, nomina.sueldoNeto)

    // Sin dinero que mover (neto 0) no hay asiento ni se exige un periodo de caja abierto.
    const destino = neto.gt(0)
      ? await personal.prepararAsientoNomina(tx, {
          metodoPago: valores.metodoPago,
          fecha: valores.fechaPago,
          cuentaId
        })
      : null

    const pagada = await tx.nomina.update({
      where: { id: nominaId },
      data: {
        estado: 'PAGADA',
        fechaPago: instanteDeDia(valores.fechaPago),
        montoPagado: neto,
        metodoPago: valores.metodoPago,
        pagadoPorId: usuarioId ?? null
      }
    })
    const asiento = destino ? await personal.crearAsientoNomina(tx, pagada, nomina.empleado, destino) : null
    const completa = await tx.nomina.findUnique({ where: { id: nominaId }, include: INCLUIR_DETALLE })
    return { nomina: completa, asiento, cuenta: destino?.cuenta ?? null, estadoAntes: nomina.estado }
  }, OPCIONES_TX)

  const { nomina, asiento, cuenta } = resultado
  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Nomina',
    entidadId: nominaId,
    detalle: {
      motivo: 'PAGO',
      periodo: nomina.periodo,
      montoPagado: util.dinero(nomina.montoPagado),
      metodoPago: nomina.metodoPago,
      fechaPago: valores.fechaPago,
      cuenta: cuenta ? { id: cuenta.id, nombre: cuenta.nombre } : null,
      asientoId: asiento?.id ?? null,
      estado: { antes: resultado.estadoAntes, despues: nomina.estado }
    },
    ip
  })

  return {
    nomina: util.nominaParaCliente(nomina),
    asiento: asiento
      ? { id: asiento.id, cuentaId: cuenta.id, cuenta: cuenta.nombre, periodo: asiento.periodo, estado: asiento.estado }
      : null
  }
}

module.exports = { generar, listar, periodos, reporte, datosBoleta, obtener, agregarConcepto, editarConcepto, quitarConcepto, pagar }
