/**
 * NOTIFICACIONES DE LA CAMPANITA (HU3 - CA15).
 *
 * Avisos que ve el residente en su campanita: proximo vencimiento, fin de gracia cercano,
 * obligacion vencida, mora aplicada, deuda con mora pendiente y pago registrado. Cada aviso
 * tiene una `clave` unica por residente, asi un mismo hecho nunca se avisa dos veces aunque el
 * proceso se repita. Cuando se registra un pago o cambia la deuda, los recordatorios ya creados
 * se actualizan (nuevo importe) o dejan de estar vigentes (la deuda se pago).
 *
 * Los avisos son independientes del correo: se crean aunque el envio por correo falle.
 * Nada de lo que hay aqui debe interrumpir el flujo que lo dispara (pagos, mora, generacion).
 */
const prisma = require('../../../config/prisma')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { Decimal, errorHttp, pendientesDe, formatearFolio } = require('../expensas/saldo.util')
const { fechaEnZona, fechaCalendario, sumarDias, diasEntre } = require('../expensas/mora.util')
const { configuracionDeLaExpensa } = require('../expensas/configuracion-expensa.util')
const { desgloseExpensa } = require('../cuenta-inmueble/estado-cuenta.util')

const DIAS_AVISO_VENCIMIENTO = 3 // se avisa desde 3 dias antes de la fecha limite
const DIAS_AVISO_MORA = 2 // y desde 2 dias antes de que termine la gracia
const TIPOS_RECORDATORIO = ['PROXIMO_VENCIMIENTO', 'PROXIMA_MORA', 'OBLIGACION_VENCIDA', 'DEUDA_CON_MORA']
const LIMITE_LISTA_DEFECTO = 100
const LIMITE_LISTA_MAXIMO = 300

const TITULOS = {
  PROXIMO_VENCIMIENTO: 'Proximo vencimiento',
  PROXIMA_MORA: 'Se acerca el fin del periodo de gracia',
  OBLIGACION_VENCIDA: 'Obligacion vencida',
  MORA_APLICADA: 'Mora aplicada',
  DEUDA_CON_MORA: 'Deuda con mora pendiente',
  PAGO_REGISTRADO: 'Pago registrado'
}

function registrarFallo(contexto, err) {
  console.error(`[campanita] ${contexto}:`, err.message)
}

/** DD/MM/AAAA a partir de YYYY-MM-DD. */
function fechaLegible(iso) {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

function bs(valor) {
  return `Bs ${new Decimal(valor).toFixed(2)}`
}

/**
 * Titulo, mensaje e importe de un aviso. `expensa` debe traer `pagos`, `moras` e `inmueble.codigo`.
 * Se vuelve a calcular cada vez que se actualiza un recordatorio, asi siempre dice lo actual.
 */
function contenido(tipo, expensa, datos = {}) {
  const codigo = expensa.inmueble?.codigo ?? ''
  const pendiente = pendientesDe(expensa)
  const venc = fechaCalendario(expensa.fechaVencimiento)
  const donde = `expensa de ${expensa.periodo} (inmueble ${codigo})`

  switch (tipo) {
    case 'PROXIMO_VENCIMIENTO':
      return {
        monto: pendiente.total,
        mensaje: `Su ${donde} vence el ${fechaLegible(venc)}. Importe pendiente: ${bs(pendiente.total)}.`
      }
    case 'PROXIMA_MORA': {
      const limite = datos.limite ?? venc
      return {
        monto: pendiente.total,
        mensaje:
          `El periodo de gracia de su ${donde} termina el ${fechaLegible(limite)}. ` +
          `Si no paga hasta esa fecha se aplicara mora. Importe pendiente: ${bs(pendiente.total)}.`
      }
    }
    case 'OBLIGACION_VENCIDA': {
      const atraso = Math.max(1, diasEntre(venc, datos.hoy ?? fechaEnZona()))
      return {
        monto: pendiente.total,
        mensaje:
          `Su ${donde} vencio el ${fechaLegible(venc)} (${atraso} dia${atraso === 1 ? '' : 's'} de retraso). ` +
          `Importe pendiente: ${bs(pendiente.total)}.`
      }
    }
    case 'MORA_APLICADA':
      return {
        monto: new Decimal(datos.linea.monto),
        mensaje:
          `Se aplico una mora de ${bs(datos.linea.monto)} a su ${donde} (mes ${datos.linea.mes}, ` +
          `sobre ${bs(datos.linea.base)} pendientes). Saldo pendiente total: ${bs(pendiente.total)}.`
      }
    case 'DEUDA_CON_MORA':
      return {
        monto: pendiente.total,
        mensaje:
          `Su ${donde} tiene una deuda con mora: mora acumulada ${bs(expensa.montoMora)}, ` +
          `saldo pendiente ${bs(pendiente.total)}.`
      }
    case 'PAGO_REGISTRADO':
      return {
        monto: new Decimal(datos.monto),
        mensaje:
          `Se registro su pago de ${bs(datos.monto)} (recibo ${datos.folio}) aplicado a su ${donde}. ` +
          `Saldo pendiente de esa expensa: ${bs(pendiente.total)}.`
      }
    default:
      throw new Error(`Tipo de aviso desconocido: ${tipo}`)
  }
}

/** Residentes a quienes avisar: las personas con ocupacion vigente del inmueble. */
async function destinatariosDe(db, inmuebleId) {
  const ocupantes = await db.ocupanteInmueble.findMany({
    where: { inmuebleId, ...filtroOcupanteVigente() },
    select: { copropietarioId: true }
  })
  return [...new Set(ocupantes.map((o) => o.copropietarioId))]
}

/** Crea el aviso si no existia (misma clave para el mismo residente). Devuelve true si lo creo. */
async function crearAviso(db, { copropietarioId, expensaId = null, tipo, titulo, mensaje, monto = null, clave }) {
  try {
    await db.notificacion.create({
      data: { copropietarioId, expensaId, tipo, titulo, mensaje, monto, clave }
    })
    return true
  } catch (err) {
    if (err.code === 'P2002') return false // ya estaba avisado
    throw err
  }
}

async function avisarADestinatarios(expensa, tipo, datos, clave) {
  const { mensaje, monto } = contenido(tipo, expensa, datos)
  let creados = 0
  for (const copropietarioId of await destinatariosDe(prisma, expensa.inmuebleId)) {
    if (await crearAviso(prisma, { copropietarioId, expensaId: expensa.id, tipo, titulo: TITULOS[tipo], mensaje, monto, clave })) {
      creados += 1
    }
  }
  return creados
}

const INCLUIR_EXPENSA = {
  inmueble: { select: { id: true, codigo: true } },
  pagos: true,
  moras: { orderBy: { numero: 'asc' } }
}

/**
 * Situacion de una expensa frente a sus fechas: que avisos corresponde CREAR hoy y cuales
 * siguen siendo VIGENTES. `config` es la mora que rige para esa expensa (dias de gracia).
 */
function situacion(expensa, config, hoy) {
  const pendiente = pendientesDe(expensa)
  const debe = pendiente.total.gt(0)
  const venc = fechaCalendario(expensa.fechaVencimiento)
  const gracia = config?.diasGracia ?? 0
  const limite = sumarDias(venc, gracia)
  const diasParaVencer = diasEntre(hoy, venc)
  const diasParaLimite = diasEntre(hoy, limite)
  const mes = hoy.slice(0, 7)
  const ultimaMora = (expensa.moras ?? []).reduce((a, m) => (a && a.numero > m.numero ? a : m), null)

  return {
    pendiente,
    venc,
    limite,
    mes,
    ultimaMora,
    crear: {
      PROXIMO_VENCIMIENTO: debe && diasParaVencer >= 0 && diasParaVencer <= DIAS_AVISO_VENCIMIENTO,
      // Con dias de gracia se avisa durante la gracia; sin gracia, el mismo dia del vencimiento.
      PROXIMA_MORA:
        debe &&
        (gracia > 0 ? hoy > venc && diasParaLimite >= 0 && diasParaLimite <= DIAS_AVISO_MORA : hoy === venc),
      OBLIGACION_VENCIDA: debe && hoy > venc,
      // Un recordatorio por mes, y no el mismo mes en que se aplico la mora.
      DEUDA_CON_MORA: debe && ultimaMora !== null && ultimaMora.mes < mes
    },
    vigente: {
      PROXIMO_VENCIMIENTO: debe && hoy <= venc,
      PROXIMA_MORA: debe && hoy <= limite,
      OBLIGACION_VENCIDA: debe && hoy > venc,
      DEUDA_CON_MORA: debe && ultimaMora !== null
    }
  }
}

/**
 * Pone al dia los recordatorios de una expensa: si la deuda se pago o la fecha cambio y el aviso
 * ya no aplica, deja de estar vigente; si sigue aplicando, se actualiza con el importe actual.
 */
async function sincronizarExpensa(expensaId, { hoy = fechaEnZona() } = {}) {
  try {
    const expensa = await prisma.expensa.findUnique({ where: { id: expensaId }, include: INCLUIR_EXPENSA })
    if (!expensa) return
    const config = await configuracionDeLaExpensa(prisma, expensa)
    const estado = situacion(expensa, config, hoy)

    const avisos = await prisma.notificacion.findMany({
      where: { expensaId, vigente: true, tipo: { in: TIPOS_RECORDATORIO } }
    })
    for (const aviso of avisos) {
      if (!estado.vigente[aviso.tipo]) {
        await prisma.notificacion.update({ where: { id: aviso.id }, data: { vigente: false } })
        continue
      }
      const { mensaje, monto } = contenido(aviso.tipo, expensa, { limite: estado.limite, hoy })
      await prisma.notificacion.update({ where: { id: aviso.id }, data: { mensaje, monto } })
    }
  } catch (err) {
    registrarFallo(`No se pudo actualizar los avisos de la expensa ${expensaId}`, err)
  }
}

/** Avisa de cada linea de mora nueva de una expensa y actualiza sus recordatorios. */
async function avisarMoraAplicada(expensaId, numerosNuevos) {
  try {
    const expensa = await prisma.expensa.findUnique({ where: { id: expensaId }, include: INCLUIR_EXPENSA })
    if (!expensa) return 0
    let creados = 0
    for (const linea of expensa.moras.filter((m) => numerosNuevos.includes(m.numero))) {
      creados += await avisarADestinatarios(expensa, 'MORA_APLICADA', { linea }, `MORA_APLICADA:${expensa.id}:${linea.numero}`)
    }
    await sincronizarExpensa(expensaId)
    return creados
  } catch (err) {
    registrarFallo(`No se pudo avisar la mora de la expensa ${expensaId}`, err)
    return 0
  }
}

/**
 * Avisa de un pago registrado. `recibo` es el recibo del cobro; `aplicaciones` lo que se aplico a
 * cada expensa ([{ expensaId, monto }]). Un cobro sin expensas (pago anticipado) se avisa como
 * saldo a favor. Despues actualiza los recordatorios de las expensas tocadas.
 */
async function avisarPago({ recibo, inmuebleId, aplicaciones = [], saldoFavorGenerado = null }) {
  try {
    const folio = formatearFolio(recibo.folioNumero)
    for (const aplicacion of aplicaciones) {
      const expensa = await prisma.expensa.findUnique({ where: { id: aplicacion.expensaId }, include: INCLUIR_EXPENSA })
      if (!expensa) continue
      await avisarADestinatarios(
        expensa,
        'PAGO_REGISTRADO',
        { monto: aplicacion.monto, folio },
        `PAGO_REGISTRADO:${recibo.id}:${expensa.id}`
      )
      await sincronizarExpensa(expensa.id)
    }

    const sobrante = new Decimal(saldoFavorGenerado ?? 0)
    if (aplicaciones.length === 0 && sobrante.gt(0)) {
      const titulo = TITULOS.PAGO_REGISTRADO
      const mensaje = `Se registro su pago anticipado de ${bs(sobrante)} (recibo ${folio}). Queda como saldo a favor para sus proximas expensas.`
      for (const copropietarioId of await destinatariosDe(prisma, inmuebleId)) {
        await crearAviso(prisma, {
          copropietarioId,
          tipo: 'PAGO_REGISTRADO',
          titulo,
          mensaje,
          monto: sobrante,
          clave: `PAGO_REGISTRADO:${recibo.id}`
        })
      }
    }
  } catch (err) {
    registrarFallo('No se pudo avisar el pago registrado', err)
  }
}

/**
 * Revisa las expensas con deuda y crea los avisos que correspondan hoy (proximo vencimiento, fin
 * de gracia, vencida y recordatorio de deuda con mora). Se puede repetir sin duplicar. Tambien
 * actualiza el estado de las cuotas de planes de pago vencidas.
 */
async function ejecutarNotificacionesAutomaticas({ hoy = new Date() } = {}) {
  const hoyIso = fechaEnZona(hoy)
  const expensas = await prisma.expensa.findMany({
    where: { estado: { not: 'PAGADA' } },
    include: INCLUIR_EXPENSA,
    orderBy: [{ periodo: 'asc' }]
  })

  const configuraciones = new Map()
  const resumen = { revisadas: 0, creadas: 0, porTipo: {} }

  for (const expensa of expensas) {
    try {
      resumen.revisadas += 1
      const clave = expensa.configuracionMoraId ?? 'vigente'
      if (!configuraciones.has(clave)) {
        configuraciones.set(clave, await configuracionDeLaExpensa(prisma, expensa))
      }
      const estado = situacion(expensa, configuraciones.get(clave), hoyIso)

      for (const tipo of TIPOS_RECORDATORIO) {
        if (!estado.crear[tipo]) continue
        const claveAviso =
          tipo === 'DEUDA_CON_MORA' ? `DEUDA_CON_MORA:${expensa.id}:${estado.mes}` : `${tipo}:${expensa.id}`
        const creados = await avisarADestinatarios(expensa, tipo, { limite: estado.limite, hoy: hoyIso }, claveAviso)
        if (creados > 0) {
          resumen.creadas += creados
          resumen.porTipo[tipo] = (resumen.porTipo[tipo] ?? 0) + creados
          // El recordatorio de este mes reemplaza al de los meses anteriores.
          if (tipo === 'DEUDA_CON_MORA') {
            await prisma.notificacion.updateMany({
              where: { expensaId: expensa.id, tipo, vigente: true, clave: { not: claveAviso } },
              data: { vigente: false }
            })
          }
        }
      }
      await sincronizarExpensa(expensa.id, { hoy: hoyIso })
    } catch (err) {
      registrarFallo(`Fallo la expensa ${expensa.id}`, err)
    }
  }

  // Las expensas que ya se pagaron no deben seguir con recordatorios vigentes.
  await prisma.notificacion.updateMany({
    where: {
      vigente: true,
      tipo: { in: TIPOS_RECORDATORIO },
      expensa: { estado: 'PAGADA' }
    },
    data: { vigente: false }
  })

  return resumen
}

// ---------------------------------------------------------------------------
// Consulta (campanita del residente)
// ---------------------------------------------------------------------------

async function copropietarioDelUsuario(usuarioId) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { copropietarioId: true } })
  return usuario?.copropietarioId ?? null
}

function presentar(n) {
  return {
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    monto: n.monto === null ? null : new Decimal(n.monto).toFixed(2),
    leida: n.leida,
    leidaEn: n.leidaEn,
    vigente: n.vigente,
    expensaId: n.expensaId,
    createdAt: n.createdAt
  }
}

/**
 * Notificaciones del usuario (las de su ficha de copropietario). Por defecto solo las vigentes,
 * mas recientes primero; `historial` incluye las que ya dejaron de aplicar.
 * ADMINISTRADOR y DIRECTORIO pueden consultar las de otra persona con `copropietarioId`.
 */
async function listar(usuario, { soloNoLeidas, historial, limite, copropietarioId } = {}) {
  let propietarioId
  if (copropietarioId) {
    if (!['ADMINISTRADOR', 'DIRECTORIO'].includes(usuario.rol)) {
      throw errorHttp('No tiene permisos para ver las notificaciones de otra persona', 403)
    }
    propietarioId = copropietarioId
  } else {
    propietarioId = await copropietarioDelUsuario(usuario.id)
  }

  if (!propietarioId) {
    return {
      notificaciones: [],
      noLeidas: 0,
      total: 0,
      mensaje: 'Su usuario no esta vinculado a un residente, por eso no tiene notificaciones'
    }
  }

  const tamanio = Math.min(LIMITE_LISTA_MAXIMO, Math.max(1, Number.parseInt(limite, 10) || LIMITE_LISTA_DEFECTO))
  const base = { copropietarioId: propietarioId, ...(historial === 'true' ? {} : { vigente: true }) }
  const [lista, noLeidas, total] = await Promise.all([
    prisma.notificacion.findMany({
      where: { ...base, ...(soloNoLeidas === 'true' ? { leida: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: tamanio
    }),
    prisma.notificacion.count({ where: { copropietarioId: propietarioId, vigente: true, leida: false } }),
    prisma.notificacion.count({ where: base })
  ])
  return { notificaciones: lista.map(presentar), noLeidas, total }
}

async function buscarPropia(usuario, id) {
  const aviso = await prisma.notificacion.findUnique({ where: { id } })
  if (!aviso) {
    throw errorHttp('Notificacion no encontrada', 404)
  }
  const propio = (await copropietarioDelUsuario(usuario.id)) === aviso.copropietarioId
  if (!propio && !['ADMINISTRADOR', 'DIRECTORIO'].includes(usuario.rol)) {
    throw errorHttp('Notificacion no encontrada', 404)
  }
  return { aviso, propio }
}

/**
 * Detalle de una notificacion con la obligacion a la que se refiere (tarifa, agua, cargos, mora,
 * pagos y saldo pendiente). Al abrirla, su dueño la marca como leida.
 */
async function obtenerDetalle(usuario, id) {
  const { aviso, propio } = await buscarPropia(usuario, id)
  if (propio && !aviso.leida) {
    aviso.leida = true
    aviso.leidaEn = new Date()
    await prisma.notificacion.update({ where: { id }, data: { leida: true, leidaEn: aviso.leidaEn } })
  }

  let obligacion = null
  if (aviso.expensaId) {
    const expensa = await prisma.expensa.findUnique({
      where: { id: aviso.expensaId },
      include: {
        inmueble: { select: { id: true, codigo: true, clase: true } },
        pagos: true,
        moras: { orderBy: { numero: 'asc' } },
        cargos: { orderBy: [{ clase: 'asc' }, { codigo: 'asc' }] }
      }
    })
    if (expensa) {
      const pendiente = pendientesDe(expensa)
      const pagado = expensa.pagos.reduce((acc, p) => acc.plus(p.monto), new Decimal(0))
      obligacion = {
        expensaId: expensa.id,
        periodo: expensa.periodo,
        inmueble: expensa.inmueble,
        estado: expensa.estado,
        fechaVencimiento: fechaCalendario(expensa.fechaVencimiento),
        desglose: desgloseExpensa(expensa),
        montoTotal: new Decimal(expensa.montoTotal).toFixed(2),
        montoMora: new Decimal(expensa.montoMora).toFixed(2),
        moras: expensa.moras.map((m) => ({ mes: m.mes, base: new Decimal(m.base).toFixed(2), monto: new Decimal(m.monto).toFixed(2) })),
        pagado: pagado.toFixed(2),
        pendiente: pendiente.total.toFixed(2),
        pendienteMora: pendiente.mora.toFixed(2),
        pendienteExpensa: pendiente.expensa.toFixed(2)
      }
    }
  }
  return { notificacion: presentar(aviso), obligacion }
}

async function marcarLeida(usuario, id) {
  const { aviso, propio } = await buscarPropia(usuario, id)
  if (!propio) {
    throw errorHttp('Solo la persona a quien va dirigido el aviso puede marcarlo como leido', 403)
  }
  if (aviso.leida) return presentar(aviso)
  return presentar(await prisma.notificacion.update({ where: { id }, data: { leida: true, leidaEn: new Date() } }))
}

async function marcarTodasLeidas(usuario) {
  const propietarioId = await copropietarioDelUsuario(usuario.id)
  if (!propietarioId) return { marcadas: 0 }
  const { count } = await prisma.notificacion.updateMany({
    where: { copropietarioId: propietarioId, leida: false },
    data: { leida: true, leidaEn: new Date() }
  })
  return { marcadas: count }
}

module.exports = {
  contenido,
  situacion,
  sincronizarExpensa,
  avisarMoraAplicada,
  avisarPago,
  ejecutarNotificacionesAutomaticas,
  listar,
  obtenerDetalle,
  marcarLeida,
  marcarTodasLeidas
}
