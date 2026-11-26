/**
 * Listado de morosos (HU13): reglas puras, sin base de datos. Recibe expensas planas y devuelve el listado por
 * inmueble. La vista previa JSON y el PDF salen del mismo resultado. Todo el dinero va con Decimal.
 */
const { Decimal, errorHttp, pendientesDe } = require('../expensas/saldo.util')
const { fechaEnZona, fechaCalendario, diasEntre } = require('../expensas/mora.util')

const CERO = new Decimal(0)
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const ORDENES = ['monto', 'antiguedad']
const TITULO = 'Listado de morosos'
const TIPO_REPORTE = 'MOROSOS'
const MENSAJE_VACIO = 'No hay inmuebles morosos en el rango de fechas indicado'

const dinero = (valor) => new Decimal(valor ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
const suma = (valores) => valores.reduce((acc, v) => acc.plus(v), CERO)

/** Fecha YYYY-MM-DD obligatoria y real (no acepta 2026-02-30). */
function validarFecha(valor, campo) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
    throw errorHttp(`${campo} es requerido`, 400, { codigo: 'FECHA_REQUERIDA' })
  }
  const texto = typeof valor === 'string' ? valor.trim() : ''
  const fecha = SOLO_FECHA.test(texto) ? new Date(`${texto}T00:00:00Z`) : null
  // Con mes 13 o dia 32 la fecha es invalida y toISOString() lanzaria RangeError: debe ser un 400, no un 500.
  const real = fecha !== null && !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
  if (!real) throw errorHttp(`${campo} debe ser una fecha valida con el formato YYYY-MM-DD`, 400, { codigo: 'FECHA_INVALIDA' })
  return texto
}

/** { desde, hasta } validos y con desde <= hasta. */
function validarRango({ desde, hasta } = {}) {
  const d = validarFecha(desde, 'desde')
  const h = validarFecha(hasta, 'hasta')
  if (d > h) {
    throw errorHttp('desde no puede ser posterior a hasta', 400, { codigo: 'RANGO_INVALIDO', detalle: { desde: d, hasta: h } })
  }
  return { desde: d, hasta: h }
}

/** Orden del listado; "monto" si no se envia. */
function validarOrden(valor) {
  if (valor === undefined || valor === null || valor === '') return 'monto'
  const texto = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  if (!ORDENES.includes(texto)) {
    throw errorHttp(`orden debe ser uno de: ${ORDENES.join(', ')}`, 400, { codigo: 'ORDEN_INVALIDO' })
  }
  return texto
}

/** Dias de atraso de un vencimiento a `hoy` (YYYY-MM-DD); nunca negativo. */
function diasDeAtraso(vencimiento, hoy) {
  return Math.max(diasEntre(vencimiento, hoy), 0)
}

/**
 * Expensas que cuentan como mora: vencimiento dentro del rango y anterior a hoy, con saldo pendiente mayor que
 * cero y fuera de un plan de pagos. Devuelve cada una ya calculada; nunca repite una expensa.
 */
function expensasMorosas(expensas, { desde, hasta, hoy }) {
  const vistas = new Set()
  const resultado = []
  for (const e of expensas ?? []) {
    if (e.planPagoId || vistas.has(e.id)) continue
    const vencimiento = fechaCalendario(e.fechaVencimiento)
    if (vencimiento < desde || vencimiento > hasta || vencimiento >= hoy) continue
    const pendiente = pendientesDe(e)
    if (pendiente.total.lte(0)) continue
    vistas.add(e.id)
    resultado.push({
      expensaId: e.id,
      inmuebleId: e.inmuebleId,
      inmueble: e.inmuebleCodigo ?? e.inmuebleId,
      periodo: e.periodo,
      fechaVencimiento: vencimiento,
      diasMora: diasDeAtraso(vencimiento, hoy),
      responsableId: e.responsableId ?? null,
      responsable: e.responsableNombre ?? null,
      pendiente
    })
  }
  return resultado
}

const comparaCodigo = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true })

/** Una fila por inmueble con sus expensas como detalle (de la mas antigua a la mas reciente). */
function agruparPorInmueble(morosas) {
  const porInmueble = new Map()
  for (const m of morosas) {
    if (!porInmueble.has(m.inmuebleId)) porInmueble.set(m.inmuebleId, [])
    porInmueble.get(m.inmuebleId).push(m)
  }
  return [...porInmueble.entries()].map(([inmuebleId, lista]) => {
    const detalle = [...lista].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.periodo.localeCompare(b.periodo))
    const masAntigua = detalle[0]
    const masReciente = detalle[detalle.length - 1]
    // El responsable de la fila es el de la expensa mas reciente que tenga uno guardado.
    const conResponsable = [...detalle].reverse().find((d) => d.responsable)
    const montoPendiente = suma(detalle.map((d) => d.pendiente.expensa))
    const interesMora = suma(detalle.map((d) => d.pendiente.mora))
    return {
      inmuebleId,
      inmueble: masAntigua.inmueble,
      responsableId: conResponsable?.responsableId ?? null,
      responsable: conResponsable?.responsable ?? null,
      periodoDeuda: { desde: masAntigua.periodo, hasta: masReciente.periodo },
      diasMora: masAntigua.diasMora,
      cantidadExpensas: detalle.length,
      montoPendiente: dinero(montoPendiente),
      interesMora: dinero(interesMora),
      totalAcumulado: dinero(montoPendiente.plus(interesMora)),
      expensas: detalle.map((d) => ({
        expensaId: d.expensaId,
        periodo: d.periodo,
        fechaVencimiento: d.fechaVencimiento,
        diasMora: d.diasMora,
        responsableId: d.responsableId,
        responsable: d.responsable,
        montoPendiente: dinero(d.pendiente.expensa),
        interesMora: dinero(d.pendiente.mora),
        total: dinero(d.pendiente.total)
      }))
    }
  })
}

/** Ordena las filas: "monto" = mayor total primero; "antiguedad" = mayor atraso primero. El resto desempata. */
function ordenarFilas(filas, orden = 'monto') {
  const porMonto = (a, b) => new Decimal(b.totalAcumulado).comparedTo(a.totalAcumulado)
  const porAntiguedad = (a, b) => b.diasMora - a.diasMora
  const principal = orden === 'antiguedad' ? porAntiguedad : porMonto
  const secundario = orden === 'antiguedad' ? porMonto : porAntiguedad
  return [...filas].sort((a, b) => principal(a, b) || secundario(a, b) || comparaCodigo(a.inmueble, b.inmueble))
}

function totalizar(filas) {
  const montoPendiente = suma(filas.map((f) => f.montoPendiente))
  const interesMora = suma(filas.map((f) => f.interesMora))
  return {
    inmuebles: filas.length,
    expensas: filas.reduce((n, f) => n + f.cantidadExpensas, 0),
    montoPendiente: dinero(montoPendiente),
    interesMora: dinero(interesMora),
    totalAcumulado: dinero(montoPendiente.plus(interesMora))
  }
}

/**
 * Arma el listado completo. `expensas`: [{ id, inmuebleId, inmuebleCodigo, periodo, fechaVencimiento, montoTotal,
 * montoMora, pagos, planPagoId, responsableId, responsableNombre }]. `generadoPor`: { id, nombre, rol }.
 */
function construirListadoMorosos({ expensas = [], desde, hasta, orden, generadoPor = null, generadoEn = new Date(), hoy } = {}) {
  const rango = validarRango({ desde, hasta })
  const ordenFinal = validarOrden(orden)
  const dia = hoy ?? fechaEnZona(generadoEn)
  const filas = ordenarFilas(agruparPorInmueble(expensasMorosas(expensas, { ...rango, hoy: dia })), ordenFinal)
  return {
    titulo: TITULO,
    tipoReporte: TIPO_REPORTE,
    rango,
    orden: ordenFinal,
    generadoEn: new Date(generadoEn).toISOString(),
    generadoPor,
    vacio: filas.length === 0,
    mensaje: filas.length === 0 ? MENSAJE_VACIO : null,
    filas,
    totales: totalizar(filas)
  }
}

module.exports = {
  ORDENES,
  TITULO,
  TIPO_REPORTE,
  MENSAJE_VACIO,
  validarFecha,
  validarRango,
  validarOrden,
  diasDeAtraso,
  expensasMorosas,
  agruparPorInmueble,
  ordenarFilas,
  totalizar,
  construirListadoMorosos
}
