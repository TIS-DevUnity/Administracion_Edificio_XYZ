const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const configuracionMoraService = require('../configuracion-mora/configuracion-mora.service')
const aguaService = require('../agua/agua.service')
const { calcularLineasMora, fechaEnZona, fechaCalendario, sumarDias, vencimientoDelPeriodo } = require('./mora.util')
const reglas = require('./reglas-pago.util')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  parsearFechaPago,
  formatearFolio,
  resumenRecibo,
  crearRecibo,
  repartirPago,
  bloquearInmueble,
  bloquearExpensa,
  aplicarSaldoAExpensa,
  calcularEstado,
  saldoFavorDe
} = require('./saldo.util')

const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/
const ESTADOS_VALIDOS = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA']
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const OPCIONES_TX = { timeout: 15000 }

const INCLUIR_INMUEBLE = { inmueble: { include: { tipoInmueble: true } } }
const INCLUIR_MORAS = { moras: { orderBy: { numero: 'asc' } } }
const INCLUIR_CAMBIOS = { cambiosVencimiento: { orderBy: { createdAt: 'desc' } } }
const INCLUIR_COMPLETO = { ...INCLUIR_INMUEBLE, pagos: true, ...INCLUIR_MORAS, ...INCLUIR_CAMBIOS }

/**
 * Fecha de vencimiento de una expensa: la que se indique a mano, o si no el dia de
 * vencimiento configurado (ConfiguracionMora.diaVencimiento) dentro del periodo.
 */
async function resolverVencimiento(periodo, fechaVencimiento, config) {
  if (fechaVencimiento !== undefined && fechaVencimiento !== null && fechaVencimiento !== '') {
    const vencimiento = new Date(fechaVencimiento)
    if (Number.isNaN(vencimiento.getTime())) {
      throw errorHttp('fechaVencimiento no es una fecha valida', 400)
    }
    return vencimiento
  }

  if (!config) {
    throw errorHttp(
      'No hay configuracion de mora vigente: configure el dia de vencimiento o envie fechaVencimiento',
      409
    )
  }
  return vencimientoDelPeriodo(periodo, config.diaVencimiento)
}

/**
 * Genera la expensa de un departamento para un periodo.
 *
 * Solo pagan expensa los departamentos activos que tienen a alguien asignado (propietario o
 * inquilino); baulera y parqueo no. El monto es la expensa fija del tipo; el agua se suma
 * despues, cuando se registra la factura del mes.
 *
 * Cada expensa guarda la configuracion de mora vigente al generarla (la de su periodo) y la
 * persona responsable en ese momento (propietario vigente; si no hay, el inquilino).
 *
 * `recalcularAgua: false` y `configuracion` los usa la generacion masiva, que reparte el agua
 * una sola vez al final y evita leer la configuracion en cada inmueble.
 */
async function generar({
  inmuebleId,
  periodo,
  fechaVencimiento,
  usuarioId = null,
  ip = null,
  origen = 'MANUAL',
  recalcularAgua = true,
  configuracion = null
}) {
  if (typeof periodo !== 'string' || !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }

  const inmueble = await prisma.inmueble.findUnique({
    where: { id: inmuebleId },
    include: { tipoInmueble: true }
  })

  if (!inmueble) {
    throw errorHttp('Inmueble no encontrado', 404)
  }

  if (!inmueble.activo) {
    throw errorHttp('El inmueble esta inactivo, no se puede generar expensa', 409, {
      codigo: 'INMUEBLE_INACTIVO'
    })
  }

  if (inmueble.clase !== 'DEPARTAMENTO') {
    throw errorHttp(
      `El inmueble ${inmueble.codigo} es ${inmueble.clase === 'BAULERA' ? 'una baulera' : 'un parqueo'}: solo los departamentos pagan expensa`,
      409,
      { codigo: 'NO_ES_DEPARTAMENTO' }
    )
  }

  if (!inmueble.tipoInmueble) {
    throw errorHttp(`El departamento ${inmueble.codigo} no tiene tipo asignado`, 409, { codigo: 'SIN_TIPO' })
  }

  const configVigente =
    configuracion ?? (await configuracionMoraService.obtenerVigente().catch(() => null))
  const vencimiento = await resolverVencimiento(periodo, fechaVencimiento, configVigente)
  const tipo = inmueble.tipoInmueble

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearInmueble(tx, inmuebleId)

      // Quien esta asignado hoy: el propietario vigente; si no hay, el inquilino.
      const ocupantes = await tx.ocupanteInmueble.findMany({
        where: { inmuebleId, ...filtroOcupanteVigente() },
        include: { copropietario: { select: { id: true, nombre: true, apellido: true } } },
        orderBy: [{ esPropietario: 'desc' }, { fechaInicio: 'asc' }]
      })
      if (ocupantes.length === 0) {
        throw errorHttp(
          `El departamento ${inmueble.codigo} no tiene a nadie asignado, no genera expensa`,
          409,
          { codigo: 'SIN_ASIGNAR' }
        )
      }
      const responsable = ocupantes[0]

      const creada = await tx.expensa.create({
        data: {
          inmuebleId,
          periodo,
          montoBase: tipo.montoBase,
          montoAgua: 0,
          montoTotal: tipo.montoBase,
          tipoNombre: tipo.nombre,
          pesoAgua: tipo.pesoAgua,
          fechaVencimiento: vencimiento,
          configuracionMoraId: configVigente ? configVigente.id : null,
          responsableId: responsable.copropietario.id,
          responsableNombre: `${responsable.copropietario.nombre} ${responsable.copropietario.apellido}`,
          responsableRol: responsable.esPropietario ? 'PROPIETARIO' : 'INQUILINO'
        }
      })

      // El saldo a favor (pagos anticipados / excesos) se usa de inmediato, pero solo si esta
      // es la deuda mas antigua del inmueble: los pagos siempre van del mes mas antiguo al mas nuevo.
      const anteriores = await tx.expensa.count({
        where: { inmuebleId, id: { not: creada.id }, estado: { not: 'PAGADA' }, periodo: { lt: periodo } }
      })
      const saldo =
        anteriores === 0
          ? await aplicarSaldoAExpensa(tx, { ...creada, pagos: [] }, usuarioId)
          : { aplicado: new Decimal(0) }

      return { creada, saldo }
    }, OPCIONES_TX)
  } catch (err) {
    if (err.code === 'P2002') {
      throw errorHttp(
        `Ya existe una expensa para el inmueble ${inmueble.codigo} en el periodo ${periodo}`,
        409,
        { codigo: 'EXPENSA_DUPLICADA' }
      )
    }
    throw err
  }

  const { creada, saldo } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Expensa',
    entidadId: creada.id,
    detalle: {
      origen,
      inmueble: inmueble.codigo,
      periodo,
      tipo: tipo.nombre,
      responsable: creada.responsableNombre,
      montoBase: new Decimal(tipo.montoBase).toFixed(2),
      montoTotal: new Decimal(creada.montoTotal).toFixed(2),
      fechaVencimiento: fechaCalendario(vencimiento)
    },
    ip
  })

  if (saldo.aplicado.gt(0)) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MovimientoSaldo',
      entidadId: saldo.movimiento.id,
      detalle: {
        origen,
        tipo: 'APLICACION_EXPENSA',
        expensaId: creada.id,
        monto: saldo.movimiento.monto.toString()
      },
      ip
    })
  }

  // Si el periodo ya tiene factura de agua, la nueva expensa entra en el reparto.
  let avisoAgua = null
  if (recalcularAgua) {
    try {
      await aguaService.recalcularPeriodo(periodo, { usuarioId, ip })
    } catch (err) {
      avisoAgua = `La expensa se genero, pero no se pudo repartir el agua: ${err.message}`
      console.warn(`[agua] ${avisoAgua}`)
    }
  }

  const expensa = await prisma.expensa.findUnique({ where: { id: creada.id }, include: INCLUIR_COMPLETO })

  return {
    ...expensa,
    saldoFavorAplicado: saldo.aplicado.toFixed(2),
    ...(avisoAgua ? { avisoAgua } : {})
  }
}

/**
 * Lista expensas. Filtros opcionales: periodo, estado, inmuebleId. Sin `pagina`
 * devuelve el arreglo completo (compatibilidad con quien ya lo consume); con
 * `pagina` devuelve { expensas, paginacion }.
 */
async function listar({ periodo, estado, inmuebleId, pagina, porPagina } = {}) {
  if (periodo !== undefined && !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }
  if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400)
  }

  const where = {
    ...(periodo ? { periodo } : {}),
    ...(estado ? { estado } : {}),
    ...(inmuebleId ? { inmuebleId } : {})
  }
  const consulta = {
    where,
    include: INCLUIR_COMPLETO,
    orderBy: { fechaVencimiento: 'desc' }
  }

  if (pagina === undefined) {
    return prisma.expensa.findMany(consulta)
  }

  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(
    POR_PAGINA_MAXIMO,
    Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO)
  )

  const [expensas, total] = await Promise.all([
    prisma.expensa.findMany({ ...consulta, skip: (numeroPagina - 1) * tamanio, take: tamanio }),
    prisma.expensa.count({ where })
  ])

  return {
    expensas,
    paginacion: {
      pagina: numeroPagina,
      porPagina: tamanio,
      total,
      totalPaginas: Math.ceil(total / tamanio)
    }
  }
}

/**
 * Configuracion de mora que rige para una expensa: la que guardo al generarse. Las expensas
 * anteriores a ese campo usan la que regia en su fecha de creacion (o, en ultimo caso, la mas
 * reciente).
 */
async function configuracionDeLaExpensa(db, expensa) {
  if (expensa.configuracionMoraId) {
    const guardada = await db.configuracionMora.findUnique({ where: { id: expensa.configuracionMoraId } })
    if (guardada) return guardada
  }
  const delMomento = await db.configuracionMora.findFirst({
    where: { vigenteDesde: { lte: expensa.createdAt } },
    orderBy: { vigenteDesde: 'desc' }
  })
  if (delMomento) return delMomento
  return db.configuracionMora.findFirst({ orderBy: { vigenteDesde: 'desc' } })
}

/**
 * Genera las lineas de mora que correspondan a una expensa segun la configuracion de su periodo:
 * una por cada mes de atraso, calculada sobre lo que falta pagar. `moraActualizada` indica
 * si se agrego alguna linea (el cron solo notifica en ese caso).
 */
async function aplicarMora(expensaId, { usuarioId = null, ip = null, origen = 'MANUAL' } = {}) {
  const expensa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    include: INCLUIR_COMPLETO
  })

  if (!expensa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  // La mora de una expensa sigue la configuracion de su periodo (la vigente al generarla),
  // no la mas reciente: un cambio posterior solo aplica a las expensas que se generen despues.
  const config = await configuracionDeLaExpensa(prisma, expensa)

  if (!config) {
    throw errorHttp('No hay una configuracion de mora vigente', 409)
  }

  if (expensa.estado === 'PAGADA') {
    return { ...expensa, moraActualizada: false, mensaje: 'La expensa ya esta pagada, no se aplica mora' }
  }

  const pendientes = calcularLineasMora({
    expensa,
    pagos: expensa.pagos,
    config,
    existentes: expensa.moras
  })

  if (pendientes.length === 0) {
    const ultimoDiaSinMora = sumarDias(fechaCalendario(expensa.fechaVencimiento), config.diasGracia)
    const dentroDeGracia = fechaEnZona() <= ultimoDiaSinMora && expensa.moras.length === 0
    return {
      ...expensa,
      moraActualizada: false,
      mensaje: dentroDeGracia
        ? 'La expensa aun esta dentro del periodo de gracia, no se aplica mora'
        : 'La mora ya estaba al dia'
    }
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearExpensa(tx, expensaId)

    // Se vuelve a leer ya con el bloqueo: un pago simultaneo pudo haberla saldado.
    const actual = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true, moras: true }
    })
    if (!actual || actual.estado === 'PAGADA') return null

    const lineas = calcularLineasMora({
      expensa: actual,
      pagos: actual.pagos,
      config,
      existentes: actual.moras
    })
    if (lineas.length === 0) return null

    const creadas = []
    for (const linea of lineas) {
      creadas.push(
        await tx.moraExpensa.create({
          data: {
            expensaId,
            numero: linea.numero,
            mes: linea.mes,
            fechaCorte: new Date(`${linea.fechaCorte}T00:00:00Z`),
            base: linea.base,
            tipoValor: linea.tipoValor,
            valor: linea.valor,
            monto: linea.monto
          }
        })
      )
    }

    const moraAnterior = new Decimal(actual.montoMora)
    const montoMora = actual.moras
      .concat(creadas)
      .reduce((acc, linea) => acc.plus(linea.monto), new Decimal(0))
    const estado = calcularEstado({ montoTotal: actual.montoTotal, montoMora, pagos: actual.pagos })

    const actualizada = await tx.expensa.update({
      where: { id: expensaId },
      data: { montoMora, estado },
      include: INCLUIR_COMPLETO
    })

    return { actualizada, creadas, moraAnterior, estadoAnterior: actual.estado }
  }, OPCIONES_TX)

  if (!resultado) {
    return { ...expensa, moraActualizada: false, mensaje: 'La expensa ya esta pagada, no se aplica mora' }
  }

  const { actualizada, creadas, moraAnterior, estadoAnterior } = resultado

  for (const linea of creadas) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MoraExpensa',
      entidadId: linea.id,
      detalle: {
        origen,
        expensaId,
        periodo: expensa.periodo,
        inmueble: expensa.inmueble.codigo,
        numero: linea.numero,
        mes: linea.mes,
        base: new Decimal(linea.base).toFixed(2),
        regla: { tipoValor: linea.tipoValor, valor: new Decimal(linea.valor).toString() },
        monto: new Decimal(linea.monto).toFixed(2)
      },
      ip
    })
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensaId,
    detalle: {
      origen,
      motivo: 'MORA',
      montoMora: { antes: moraAnterior.toFixed(2), despues: new Decimal(actualizada.montoMora).toFixed(2) },
      estado: { antes: estadoAnterior, despues: actualizada.estado },
      lineasNuevas: creadas.map((linea) => linea.numero)
    },
    ip
  })

  return { ...actualizada, moraActualizada: true }
}

async function registrarPago({ expensaId, monto, metodoPago, referencia, fechaPago, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)

  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previa.inmuebleId)
    await bloquearExpensa(tx, expensaId)

    const expensa = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.estado === 'PAGADA') {
      throw errorHttp('La expensa ya esta pagada, no se pueden registrar mas pagos', 409)
    }

    // Reglas de pago: orden de meses, meses atrasados completos, cuotas solo estando al dia.
    const deudas = await reglas.cargarDeudas(tx, expensa.inmuebleId)
    const plan = reglas.validarPagoSobreExpensa({ deudas, expensaId, monto: montoRecibido })

    const recibo = await crearRecibo(tx, {
      inmuebleId: expensa.inmuebleId,
      montoTotal: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })

    // Lo que alcanza la expensa se aplica como pago (primero la mora, luego el monto);
    // el sobrante pasa a saldo a favor.
    const { aplicaciones, restante: exceso } = await repartirPago(tx, {
      reciboId: recibo.id,
      expensas: [expensa],
      monto: montoRecibido,
      metodoPago,
      referencia: referenciaLimpia,
      fechaPago: fecha,
      usuarioId
    })
    const aplicacion = aplicaciones[0] ?? null
    const aplicado = aplicacion ? aplicacion.aplicado : new Decimal(0)

    const movimiento = exceso.gt(0)
      ? await tx.movimientoSaldo.create({
          data: {
            inmuebleId: expensa.inmuebleId,
            tipo: 'EXCESO_PAGO',
            monto: exceso,
            expensaId,
            reciboId: recibo.id,
            metodoPago,
            referencia: referenciaLimpia,
            registradoPorId: usuarioId
          }
        })
      : null

    const expensaActualizada = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true, ...INCLUIR_INMUEBLE, ...INCLUIR_MORAS }
    })

    return {
      recibo,
      pago: aplicacion ? aplicacion.pago : null,
      movimiento,
      expensa: expensaActualizada,
      estadoAnterior: expensa.estado,
      aplicado,
      aplicadoMora: aplicacion ? aplicacion.aplicadoMora : new Decimal(0),
      aplicadoExpensa: aplicacion ? aplicacion.aplicadoExpensa : new Decimal(0),
      exceso,
      tipoPago: plan.tipoPago
    }
  }, OPCIONES_TX)

  const { recibo, pago, movimiento, expensa, estadoAnterior, aplicado, aplicadoMora, aplicadoExpensa, exceso, tipoPago } =
    resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'Recibo',
    entidadId: recibo.id,
    detalle: {
      folio: formatearFolio(recibo.folioNumero),
      inmuebleId: expensa.inmuebleId,
      montoRecibido: montoRecibido.toFixed(2),
      fechaPago: recibo.fechaPago.toISOString(),
      metodoPago,
      referencia: referenciaLimpia
    },
    ip
  })

  if (pago) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'Pago',
      entidadId: pago.id,
      detalle: {
        expensaId,
        folio: formatearFolio(recibo.folioNumero),
        montoRecibido: montoRecibido.toFixed(2),
        montoAplicado: aplicado.toFixed(2),
        aMora: aplicadoMora.toFixed(2),
        aExpensa: aplicadoExpensa.toFixed(2),
        excesoASaldoFavor: exceso.toFixed(2),
        tipoPago,
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  if (movimiento) {
    await registrarAuditoria({
      usuarioId,
      accion: 'CREATE',
      entidad: 'MovimientoSaldo',
      entidadId: movimiento.id,
      detalle: {
        tipo: 'EXCESO_PAGO',
        folio: formatearFolio(recibo.folioNumero),
        expensaId,
        monto: exceso.toFixed(2),
        metodoPago,
        referencia: referenciaLimpia
      },
      ip
    })
  }

  if (estadoAnterior !== expensa.estado) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Expensa',
      entidadId: expensaId,
      detalle: { motivo: 'PAGO', estado: { antes: estadoAnterior, despues: expensa.estado } },
      ip
    })
  }

  return {
    pago,
    expensa,
    recibo: resumenRecibo(recibo),
    montoRecibido: montoRecibido.toFixed(2),
    montoAplicado: aplicado.toFixed(2),
    montoAplicadoMora: aplicadoMora.toFixed(2),
    montoAplicadoExpensa: aplicadoExpensa.toFixed(2),
    saldoFavorGenerado: exceso.toFixed(2),
    tipoPago
  }
}

/** Cubre una expensa ya existente con el saldo a favor del inmueble. */
async function aplicarSaldoFavor(expensaId, { usuarioId, ip }) {
  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previa.inmuebleId)
    await bloquearExpensa(tx, expensaId)

    const expensa = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.estado === 'PAGADA') {
      throw errorHttp('La expensa ya esta pagada', 409)
    }

    const saldoDisponible = await saldoFavorDe(tx, expensa.inmuebleId)
    if (saldoDisponible.lte(0)) {
      throw errorHttp('El inmueble no tiene saldo a favor disponible', 409)
    }

    // Mismo orden que los pagos: la deuda mas antigua primero, y un mes atrasado se cubre completo.
    const deudas = await reglas.cargarDeudas(tx, expensa.inmuebleId)
    reglas.validarAplicacionSaldo({ deudas, expensaId, saldo: saldoDisponible })

    const saldo = await aplicarSaldoAExpensa(tx, expensa, usuarioId)
    if (saldo.aplicado.lte(0)) {
      throw errorHttp('El inmueble no tiene saldo a favor disponible', 409)
    }

    const actualizada = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { pagos: true, ...INCLUIR_INMUEBLE, ...INCLUIR_MORAS }
    })
    return { saldo, expensa: actualizada, estadoAnterior: expensa.estado }
  }, OPCIONES_TX)

  const { saldo, expensa, estadoAnterior } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'MovimientoSaldo',
    entidadId: saldo.movimiento.id,
    detalle: {
      tipo: 'APLICACION_EXPENSA',
      expensaId,
      monto: saldo.movimiento.monto.toString()
    },
    ip
  })

  if (estadoAnterior !== expensa.estado) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'Expensa',
      entidadId: expensaId,
      detalle: { motivo: 'SALDO_A_FAVOR', estado: { antes: estadoAnterior, despues: expensa.estado } },
      ip
    })
  }

  return { expensa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Cambia a mano la fecha de vencimiento de una expensa ya generada y deja el cambio en el
 * historial (quien, cuando, fecha anterior y nueva). Solo mientras la expensa no tenga mora
 * generada y no este pagada: con mora ya cobrada, mover la fecha dejaria cargos sin sustento.
 */
async function cambiarVencimiento(expensaId, { fechaVencimiento, motivo, usuarioId = null, ip = null }) {
  if (typeof fechaVencimiento !== 'string' || !SOLO_FECHA.test(fechaVencimiento)) {
    throw errorHttp('fechaVencimiento debe tener el formato YYYY-MM-DD', 400)
  }
  const nueva = new Date(`${fechaVencimiento}T00:00:00Z`)
  if (Number.isNaN(nueva.getTime()) || nueva.toISOString().slice(0, 10) !== fechaVencimiento) {
    throw errorHttp('fechaVencimiento no es una fecha valida', 400)
  }

  let motivoLimpio = null
  if (motivo !== undefined && motivo !== null && motivo !== '') {
    if (typeof motivo !== 'string' || motivo.trim().length > 300) {
      throw errorHttp('motivo debe ser un texto de hasta 300 caracteres', 400)
    }
    motivoLimpio = motivo.trim() || null
  }

  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearInmueble(tx, previa.inmuebleId)
    await bloquearExpensa(tx, expensaId)

    const expensa = await tx.expensa.findUnique({
      where: { id: expensaId },
      include: { moras: { select: { id: true } } }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.estado === 'PAGADA') {
      throw errorHttp('La expensa ya esta pagada: no se puede cambiar su vencimiento', 409, {
        codigo: 'EXPENSA_PAGADA'
      })
    }
    if (expensa.moras.length > 0) {
      throw errorHttp('La expensa ya tiene mora generada: no se puede cambiar su vencimiento', 409, {
        codigo: 'EXPENSA_CON_MORA'
      })
    }

    const anterior = fechaCalendario(expensa.fechaVencimiento)
    if (anterior === fechaVencimiento) {
      throw errorHttp('La fecha de vencimiento ya es esa', 409, { codigo: 'SIN_CAMBIO' })
    }
    if (fechaVencimiento < fechaEnZona(expensa.createdAt)) {
      throw errorHttp('El vencimiento no puede ser anterior al dia en que se genero la expensa', 400)
    }

    const cambio = await tx.cambioVencimiento.create({
      data: {
        expensaId,
        fechaAnterior: new Date(`${anterior}T00:00:00Z`),
        fechaNueva: nueva,
        motivo: motivoLimpio,
        registradoPorId: usuarioId
      }
    })
    // Se actualiza despues de registrar el cambio para que la respuesta ya lo incluya.
    const actualizada = await tx.expensa.update({
      where: { id: expensaId },
      data: { fechaVencimiento: nueva },
      include: INCLUIR_COMPLETO
    })

    return { actualizada, cambio, anterior }
  }, OPCIONES_TX)

  const { actualizada, cambio, anterior } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensaId,
    detalle: {
      motivo: 'CAMBIO_VENCIMIENTO',
      fechaVencimiento: { antes: anterior, despues: fechaVencimiento },
      motivoTexto: cambio.motivo,
      periodo: actualizada.periodo,
      inmueble: actualizada.inmueble.codigo
    },
    ip
  })

  return actualizada
}

module.exports = { generar, listar, aplicarMora, registrarPago, aplicarSaldoFavor, cambiarVencimiento }
