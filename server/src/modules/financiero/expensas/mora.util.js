const { Prisma } = require('@prisma/client')

const Decimal = Prisma.Decimal
const ZONA_HORARIA = process.env.CRON_TIMEZONE || 'America/La_Paz'
const MS_POR_DIA = 24 * 60 * 60 * 1000
const MAX_MESES_MORA = 120 // tope de seguridad del calculo

/** Fecha de calendario (YYYY-MM-DD) de un instante, vista en hora de Bolivia. */
function fechaEnZona(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(fecha)
}

/**
 * Fecha de calendario (YYYY-MM-DD) de `fechaVencimiento`. Es una fecha sin hora
 * (se guarda como medianoche UTC), asi que se lee con componentes UTC para que
 * no dependa de la zona horaria del servidor.
 */
function fechaCalendario(fecha) {
  return new Date(fecha).toISOString().slice(0, 10)
}

function aMs(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`)
}

function sumarDias(isoDate, dias) {
  return new Date(aMs(isoDate) + dias * MS_POR_DIA).toISOString().slice(0, 10)
}

function diasEntre(isoDesde, isoHasta) {
  return Math.round((aMs(isoHasta) - aMs(isoDesde)) / MS_POR_DIA)
}

/** Suma meses calendario; si el dia no existe en el mes destino queda en su ultimo dia. */
function sumarMeses(isoDate, meses) {
  const [anio, mes, dia] = isoDate.split('-').map(Number)
  const total = anio * 12 + (mes - 1) + meses
  const anioFinal = Math.floor(total / 12)
  const mesFinal = total % 12
  const ultimoDia = new Date(Date.UTC(anioFinal, mesFinal + 1, 0)).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${anioFinal}-${String(mesFinal + 1).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

/** Fecha de vencimiento (medianoche UTC) del dia `dia` del periodo YYYY-MM. */
function vencimientoDelPeriodo(periodo, dia) {
  const [anio, mes] = periodo.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia))
}

/**
 * Dia (YYYY-MM-DD) desde el que corre la mora numero `numero` (1, 2, 3...).
 *
 * El ultimo dia para pagar sin mora es fechaVencimiento + diasGracia (inclusive). La mora 1
 * corre desde el dia siguiente; cada mora siguiente desde ese mismo dia, un mes calendario
 * despues (vence el 10: 11 oct, 11 nov, 11 dic...).
 */
function fechaCorteMora(fechaVencimiento, diasGracia, numero) {
  const limite = sumarDias(fechaCalendario(fechaVencimiento), diasGracia)
  return sumarDias(sumarMeses(limite, numero - 1), 1)
}

/**
 * Lo que faltaba pagar del monto de la expensa (sin mora) al terminar el dia `fechaIso`.
 * Solo cuentan los pagos hechos hasta ese dia, para que el resultado no dependa de cuando
 * corre el calculo.
 */
function saldoExpensaAlDia(montoTotal, pagos, fechaIso) {
  const pagado = (pagos ?? [])
    .filter((p) => fechaEnZona(new Date(p.fechaPago)) <= fechaIso)
    .reduce((acc, p) => acc.plus(p.montoExpensa), new Decimal(0))
  return Decimal.max(new Decimal(montoTotal).minus(pagado), new Decimal(0))
}

/**
 * Lineas de mora que faltan generar para una expensa a la fecha `hoy`.
 *
 * Cada mes de atraso genera una linea, calculada sobre lo que faltaba pagar de la expensa al
 * ultimo dia sin mora de ese mes (porcentaje de esa base, o monto fijo). Si ya no falta nada
 * no se genera mora ni vuelve a generarse. Las lineas existentes no se recalculan.
 * modoMora UNICA: solo la primera linea.
 */
function calcularLineasMora({ expensa, pagos, config, existentes = [], hoy = new Date() }) {
  const hoyIso = fechaEnZona(hoy)
  const hasta = config.modoMora === 'UNICA' ? 1 : MAX_MESES_MORA
  const yaGeneradas = new Set(existentes.map((linea) => linea.numero))
  const lineas = []

  for (let numero = 1; numero <= hasta; numero++) {
    const corte = fechaCorteMora(expensa.fechaVencimiento, config.diasGracia, numero)
    if (corte > hoyIso) break
    if (yaGeneradas.has(numero)) continue

    const base = saldoExpensaAlDia(expensa.montoTotal, pagos, sumarDias(corte, -1))
    if (base.lte(0)) break

    const monto =
      config.tipoValor === 'PORCENTAJE'
        ? base.times(config.valor).div(100).toDecimalPlaces(2)
        : new Decimal(config.valor).toDecimalPlaces(2)
    if (monto.lte(0)) continue

    lineas.push({
      numero,
      mes: corte.slice(0, 7),
      fechaCorte: corte,
      base,
      tipoValor: config.tipoValor,
      valor: new Decimal(config.valor),
      monto
    })
  }

  return lineas
}

module.exports = {
  fechaEnZona,
  fechaCalendario,
  sumarDias,
  sumarMeses,
  diasEntre,
  vencimientoDelPeriodo,
  fechaCorteMora,
  saldoExpensaAlDia,
  calcularLineasMora
}
