const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const configuracionMoraService = require('../configuracion-mora/configuracion-mora.service')
const { calcularLineasMora, fechaEnZona, fechaCalendario, sumarDias, vencimientoDelPeriodo } = require('./mora.util')
const reglas = require('./reglas-pago.util')
const cargosUtil = require('./cargos.util')
const { configuracionDeLaExpensa } = require('./configuracion-expensa.util')
const campanita = require('../notificaciones/campanita.service')
const {
  Decimal,
  errorHttp,
  parsearMonto,
  validarMetodoPago,
  normalizarReferencia,
  normalizarClaveSolicitud,
  buscarReciboPorClave,
  parsearFechaPago,
  formatearFolio,
  resumenRecibo,
  respuestaDuplicada,
  crearRecibo,
  repartirPago,
  bloquearInmueble,
  bloquearExpensa,
  aplicarSaldoAExpensa,
  calcularEstado,
  pendientesDe,
  sumarCampo,
  saldoFavorDe
} = require('./saldo.util')

const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/
const ESTADOS_VALIDOS = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA']
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const OPCIONES_TX = { timeout: 15000 }

const INCLUIR_INMUEBLE = { inmueble: { include: { tipoInmueble: true } } }
const INCLUIR_MORAS = { moras: { orderBy: { numero: 'asc' } } }
// Departamento primero y luego parqueos y bauleras (orden de declaracion del enum es
// DEPARTAMENTO, BAULERA, PARQUEO); dentro de cada clase por codigo.
const INCLUIR_CARGOS = { cargos: { orderBy: [{ clase: 'asc' }, { codigo: 'asc' }] } }
const INCLUIR_CAMBIOS = { cambiosVencimiento: { orderBy: { createdAt: 'desc' } } }
const INCLUIR_COMPLETO = {
  ...INCLUIR_INMUEBLE,
  pagos: true,
  ...INCLUIR_MORAS,
  ...INCLUIR_CARGOS,
  ...INCLUIR_CAMBIOS
}

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
 * inquilino); baulera y parqueo no. El monto es la expensa fija del tipo (mas baulera y
 * parqueo); el agua nace en 0 y el administrador la carga despues con `cargarAgua`.
 *
 * Cada expensa guarda la configuracion de mora vigente al generarla (la de su periodo) y la
 * persona responsable en ese momento (propietario vigente; si no hay, el inquilino).
 *
 * `configuracion` la usa la generacion masiva para no leer la configuracion en cada inmueble.
 */
async function generar({
  inmuebleId,
  periodo,
  fechaVencimiento,
  usuarioId = null,
  ip = null,
  origen = 'MANUAL',
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

      // Cuota del departamento + la de cada baulera y parqueo que paga el responsable
      // (ver cargos.util.js). `montoBase` es la suma; el agua va aparte (`montoAgua`).
      const extras = await cargosUtil.extrasParaExpensa(tx, {
        inmuebleId,
        responsableId: responsable.copropietario.id
      })
      const montoBase = new Decimal(tipo.montoBase).plus(cargosUtil.sumarMontos(extras))

      const creada = await tx.expensa.create({
        data: {
          inmuebleId,
          periodo,
          montoBase,
          montoAgua: 0,
          montoTotal: montoBase,
          tipoNombre: tipo.nombre,
          fechaVencimiento: vencimiento,
          configuracionMoraId: configVigente ? configVigente.id : null,
          responsableId: responsable.copropietario.id,
          responsableNombre: `${responsable.copropietario.nombre} ${responsable.copropietario.apellido}`,
          responsableRol: responsable.esPropietario ? 'PROPIETARIO' : 'INQUILINO'
        }
      })

      await tx.cargoExpensa.createMany({
        data: [
          { clase: 'DEPARTAMENTO', inmuebleId, codigo: inmueble.codigo, monto: tipo.montoBase },
          ...extras.map((extra) => ({
            clase: extra.clase,
            inmuebleId: extra.inmuebleId,
            codigo: extra.codigo,
            monto: extra.monto
          }))
        ].map((cargo) => ({ ...cargo, expensaId: creada.id }))
      })

      // El saldo a favor (pagos anticipados / excesos) se usa de inmediato, pero solo si esta
      // es la deuda mas antigua del inmueble: los pagos siempre van del mes mas antiguo al mas nuevo.
      const anteriores = await tx.expensa.count({
        where: { inmuebleId, id: { not: creada.id }, estado: { not: 'PAGADA' }, planPagoId: null, periodo: { lt: periodo } }
      })
      const saldo =
        anteriores === 0
          ? await aplicarSaldoAExpensa(tx, { ...creada, pagos: [] }, usuarioId)
          : { aplicado: new Decimal(0) }

      return { creada, saldo, extras }
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

  const { creada, saldo, extras } = resultado

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
      montoBase: new Decimal(creada.montoBase).toFixed(2),
      cargos: [
        { clase: 'DEPARTAMENTO', codigo: inmueble.codigo, monto: new Decimal(tipo.montoBase).toFixed(2) },
        ...extras.map((extra) => ({
          clase: extra.clase,
          codigo: extra.codigo,
          monto: extra.monto.toFixed(2)
        }))
      ],
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

  const expensa = await prisma.expensa.findUnique({ where: { id: creada.id }, include: INCLUIR_COMPLETO })

  return { ...expensa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
}

/**
 * Agrega a cada expensa dos datos de saldo a favor, para mostrarlos en su detalle:
 *  - `saldoFavorInmueble`: saldo a favor vigente hoy del inmueble (no de la expensa).
 *  - `pagadoConSaldoFavor`: lo que ya se cubrio de esta expensa usando saldo a favor.
 * Solo agrega campos; no cambia ninguno existente.
 */
async function conSaldoFavor(expensas) {
  if (expensas.length === 0) return expensas

  const inmuebleIds = [...new Set(expensas.map((expensa) => expensa.inmuebleId))]
  const saldos = await prisma.movimientoSaldo.groupBy({
    by: ['inmuebleId'],
    where: { inmuebleId: { in: inmuebleIds } },
    _sum: { monto: true }
  })
  const saldoPorInmueble = new Map(saldos.map((fila) => [fila.inmuebleId, new Decimal(fila._sum.monto ?? 0)]))

  return expensas.map((expensa) => {
    const pagadoConSaldo = (expensa.pagos ?? [])
      .filter((pago) => pago.metodoPago === 'SALDO_A_FAVOR')
      .reduce((acc, pago) => acc.plus(pago.monto), new Decimal(0))
    return {
      ...expensa,
      saldoFavorInmueble: (saldoPorInmueble.get(expensa.inmuebleId) ?? new Decimal(0)).toFixed(2),
      pagadoConSaldoFavor: pagadoConSaldo.toFixed(2)
    }
  })
}

/**
 * Lista expensas. Filtros opcionales: periodo, estado, inmuebleId, aguaCargada. Sin `pagina`
 * devuelve el arreglo completo (compatibilidad con quien ya lo consume); con
 * `pagina` devuelve { expensas, paginacion }.
 */
async function listar({ periodo, estado, inmuebleId, aguaCargada, pagina, porPagina } = {}) {
  if (periodo !== undefined && !PERIODO_VALIDO.test(periodo)) {
    throw errorHttp('periodo debe tener el formato YYYY-MM (ej. 2026-09)', 400)
  }
  if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400)
  }

  if (aguaCargada !== undefined && aguaCargada !== 'true' && aguaCargada !== 'false') {
    throw errorHttp('aguaCargada debe ser true o false', 400)
  }

  const where = {
    ...(periodo ? { periodo } : {}),
    ...(estado ? { estado } : {}),
    ...(inmuebleId ? { inmuebleId } : {}),
    // true = ya se cargo el agua; false = todavia falta cargarla.
    ...(aguaCargada === undefined
      ? {}
      : { aguaRegistradaEn: aguaCargada === 'true' ? { not: null } : null })
  }
  const consulta = {
    where,
    include: INCLUIR_COMPLETO,
    orderBy: { fechaVencimiento: 'desc' }
  }

  if (pagina === undefined) {
    return conSaldoFavor(await prisma.expensa.findMany(consulta))
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
    expensas: await conSaldoFavor(expensas),
    paginacion: {
      pagina: numeroPagina,
      porPagina: tamanio,
      total,
      totalPaginas: Math.ceil(total / tamanio)
    }
  }
}

/** Pasa a VENCIDA una expensa con deuda cuya gracia ya termino, sin crear lineas de mora. */
async function marcarVencida(expensa, { usuarioId, ip, origen }) {
  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearExpensa(tx, expensa.id)
    const actual = await tx.expensa.findUnique({ where: { id: expensa.id }, include: { pagos: true } })
    if (!actual || !['PENDIENTE', 'PARCIAL'].includes(actual.estado)) return null
    if (pendientesDe(actual).total.lte(0)) return null
    return tx.expensa.update({
      where: { id: expensa.id },
      data: { estado: 'VENCIDA' },
      include: INCLUIR_COMPLETO
    })
  }, OPCIONES_TX)
  if (!resultado) return null

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensa.id,
    detalle: { origen, motivo: 'VENCIMIENTO', estado: { antes: expensa.estado, despues: 'VENCIDA' } },
    ip
  })
  return resultado
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

  // Mientras un plan de pagos la cubre, la expensa se cobra por cuotas y no genera mora nueva.
  if (expensa.planPagoId) {
    return {
      ...expensa,
      moraActualizada: false,
      mensaje: 'La expensa esta cubierta por un plan de pagos: no genera mora nueva'
    }
  }

  const pendientes = calcularLineasMora({
    expensa,
    pagos: expensa.pagos,
    config,
    existentes: expensa.moras
  })

  if (pendientes.length === 0) {
    const ultimoDiaSinMora = sumarDias(fechaCalendario(expensa.fechaVencimiento), config.diasGracia)
    const pasoGracia = fechaEnZona() > ultimoDiaSinMora
    const dentroDeGracia = !pasoGracia && expensa.moras.length === 0

    // Pasada la gracia con deuda, la expensa esta vencida aunque la mora calculada sea 0.
    if (pasoGracia && ['PENDIENTE', 'PARCIAL'].includes(expensa.estado)) {
      const vencida = await marcarVencida(expensa, { usuarioId, ip, origen })
      if (vencida) {
        return { ...vencida, moraActualizada: false, mensaje: 'La expensa paso a VENCIDA (sin mora por calcular)' }
      }
    }
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

  // Aviso en la campanita del residente (no depende de que el correo se envie).
  await campanita.avisarMoraAplicada(expensaId, creadas.map((linea) => linea.numero))

  return { ...actualizada, moraActualizada: true }
}

async function registrarPago({ expensaId, monto, metodoPago, referencia, fechaPago, cuentaId, claveSolicitud, usuarioId, ip }) {
  const montoRecibido = parsearMonto(monto)
  validarMetodoPago(metodoPago)
  const referenciaLimpia = normalizarReferencia(referencia)
  const fecha = parsearFechaPago(fechaPago)
  const clave = normalizarClaveSolicitud(claveSolicitud)

  // Reenvio de una solicitud ya registrada: se devuelve el recibo existente, sin cobrar de nuevo.
  const yaRegistrado = await buscarReciboPorClave(prisma, clave)
  if (yaRegistrado) return respuestaDuplicada(yaRegistrado)

  const previa = await prisma.expensa.findUnique({
    where: { id: expensaId },
    select: { inmuebleId: true }
  })
  if (!previa) {
    throw errorHttp('Expensa no encontrada', 404)
  }

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
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
    if (expensa.planPagoId) {
      throw errorHttp(
        'Esta expensa esta cubierta por un plan de pagos: registre el pago en el plan (POST /api/financiero/planes-pago/{id}/pagos)',
        409,
        { codigo: 'EXPENSA_EN_PLAN', detalle: { planPagoId: expensa.planPagoId } }
      )
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
      usuarioId,
      claveSolicitud: clave,
      cuentaId
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
      include: { pagos: true, ...INCLUIR_INMUEBLE, ...INCLUIR_MORAS, ...INCLUIR_CARGOS }
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
  } catch (err) {
    // Dos solicitudes con la misma clave llegaron a la vez: gana la primera.
    if (err.code === 'P2002' && clave) {
      const yaRegistradoAhora = await buscarReciboPorClave(prisma, clave)
      if (yaRegistradoAhora) return respuestaDuplicada(yaRegistradoAhora)
    }
    throw err
  }

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

  // Aviso en la campanita y recordatorios al dia con el nuevo saldo.
  await campanita.avisarPago({
    recibo,
    inmuebleId: expensa.inmuebleId,
    aplicaciones: pago ? [{ expensaId, monto: aplicado }] : [],
    saldoFavorGenerado: exceso
  })

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
    if (expensa.planPagoId) {
      throw errorHttp('Esta expensa esta cubierta por un plan de pagos: se cobra a traves de sus cuotas', 409, {
        codigo: 'EXPENSA_EN_PLAN',
        detalle: { planPagoId: expensa.planPagoId }
      })
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
      include: { pagos: true, ...INCLUIR_INMUEBLE, ...INCLUIR_MORAS, ...INCLUIR_CARGOS }
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

  await campanita.sincronizarExpensa(expensaId)

  return { expensa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
}

/**
 * Carga (o corrige) a mano el agua de una expensa ya generada. Cada departamento tiene su propio
 * monto; no hay reparto. El total pasa a ser `montoBase + montoAgua` y el estado se recalcula con
 * lo ya pagado. Reglas:
 *  - Solo mientras la expensa no tenga mora generada: la mora se calcula sobre lo que falta pagar
 *    y sus lineas nunca se editan, asi que cambiar el total despues dejaria cargos sin sustento.
 *  - El nuevo total no puede quedar por debajo de lo que ya se pago de la expensa.
 *  - Si el agua sube y el inmueble tiene saldo a favor, se usa para cubrir ese aumento (solo
 *    cuando esta es su deuda mas antigua, igual que el resto de pagos).
 */
async function cargarAgua(expensaId, { montoAgua, usuarioId = null, ip = null }) {
  const agua = parsearMonto(montoAgua, 'montoAgua', { permitirCero: true })

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
      include: { pagos: true, moras: { select: { id: true } }, inmueble: { select: { codigo: true } } }
    })
    if (!expensa) {
      throw errorHttp('Expensa no encontrada', 404)
    }
    if (expensa.moras.length > 0) {
      throw errorHttp('La expensa ya tiene mora generada: no se puede cambiar el agua', 409, {
        codigo: 'EXPENSA_CON_MORA'
      })
    }
    if (expensa.planPagoId) {
      throw errorHttp('La expensa esta cubierta por un plan de pagos: no se puede cambiar el agua', 409, {
        codigo: 'EXPENSA_EN_PLAN'
      })
    }

    const aguaAnterior = new Decimal(expensa.montoAgua)
    if (expensa.aguaRegistradaEn && aguaAnterior.equals(agua)) {
      throw errorHttp('El agua de esta expensa ya es ese monto', 409, { codigo: 'SIN_CAMBIO' })
    }

    const montoTotal = new Decimal(expensa.montoBase).plus(agua)
    const pagadoExpensa = sumarCampo(expensa.pagos, 'montoExpensa')
    if (montoTotal.lt(pagadoExpensa)) {
      throw errorHttp(
        `No se puede cargar ese monto: la expensa de ${expensa.inmueble.codigo} quedaria en Bs ${montoTotal.toFixed(2)} ` +
          `y ya se pago Bs ${pagadoExpensa.toFixed(2)}`,
        409,
        { codigo: 'AGUA_MENOR_A_LO_PAGADO', detalle: { inmueble: expensa.inmueble.codigo } }
      )
    }

    const estado = calcularEstado({
      montoTotal,
      montoMora: expensa.montoMora,
      pagos: expensa.pagos,
      vencida: expensa.estado === 'VENCIDA'
    })
    const actualizada = await tx.expensa.update({
      where: { id: expensaId },
      data: { montoAgua: agua, montoTotal, estado, aguaRegistradaEn: new Date() }
    })

    // Si el agua subio y al inmueble le sobra saldo a favor, se usa para cubrir ese aumento.
    let saldo = { aplicado: new Decimal(0) }
    if (agua.gt(aguaAnterior)) {
      const anteriores = await tx.expensa.count({
        where: {
          inmuebleId: expensa.inmuebleId,
          id: { not: expensaId },
          estado: { not: 'PAGADA' },
          planPagoId: null,
          periodo: { lt: expensa.periodo }
        }
      })
      if (anteriores === 0) {
        saldo = await aplicarSaldoAExpensa(tx, { ...actualizada, pagos: expensa.pagos }, usuarioId)
      }
    }

    return { expensa, actualizada, aguaAnterior, saldo }
  }, OPCIONES_TX)

  const { expensa, actualizada, aguaAnterior, saldo } = resultado

  const completa = await prisma.expensa.findUnique({ where: { id: expensaId }, include: INCLUIR_COMPLETO })

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensaId,
    detalle: {
      motivo: 'AGUA',
      periodo: expensa.periodo,
      inmueble: expensa.inmueble.codigo,
      montoAgua: { antes: aguaAnterior.toFixed(2), despues: agua.toFixed(2) },
      montoTotal: {
        antes: new Decimal(expensa.montoTotal).toFixed(2),
        despues: new Decimal(actualizada.montoTotal).toFixed(2)
      },
      estado: { antes: expensa.estado, despues: completa.estado }
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
        tipo: 'APLICACION_EXPENSA',
        motivo: 'AGUA',
        expensaId,
        periodo: expensa.periodo,
        inmueble: expensa.inmueble.codigo,
        monto: new Decimal(saldo.movimiento.monto).toString()
      },
      ip
    })
  }

  await campanita.sincronizarExpensa(expensaId)

  return { ...completa, saldoFavorAplicado: saldo.aplicado.toFixed(2) }
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
      include: { moras: { select: { id: true } }, pagos: true }
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

    // Una VENCIDA sin mora lo es solo por fecha: si la nueva fecha (mas la gracia) todavia no
    // paso, deja de estar vencida y vuelve al estado que le corresponde segun lo pagado.
    const estadoAnterior = expensa.estado
    let estadoNuevo = estadoAnterior
    if (estadoAnterior === 'VENCIDA') {
      const config = await configuracionDeLaExpensa(tx, expensa)
      if (config && fechaEnZona() <= sumarDias(fechaVencimiento, config.diasGracia)) {
        estadoNuevo = calcularEstado({
          montoTotal: expensa.montoTotal,
          montoMora: expensa.montoMora,
          pagos: expensa.pagos
        })
      }
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
      data: { fechaVencimiento: nueva, estado: estadoNuevo },
      include: INCLUIR_COMPLETO
    })

    return { actualizada, cambio, anterior, estadoAnterior }
  }, OPCIONES_TX)

  const { actualizada, cambio, anterior, estadoAnterior } = resultado

  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'Expensa',
    entidadId: expensaId,
    detalle: {
      motivo: 'CAMBIO_VENCIMIENTO',
      fechaVencimiento: { antes: anterior, despues: fechaVencimiento },
      estado: { antes: estadoAnterior, despues: actualizada.estado },
      motivoTexto: cambio.motivo,
      periodo: actualizada.periodo,
      inmueble: actualizada.inmueble.codigo
    },
    ip
  })

  await campanita.sincronizarExpensa(expensaId)

  return actualizada
}

module.exports = {
  generar,
  listar,
  aplicarMora,
  registrarPago,
  aplicarSaldoFavor,
  cargarAgua,
  cambiarVencimiento
}
