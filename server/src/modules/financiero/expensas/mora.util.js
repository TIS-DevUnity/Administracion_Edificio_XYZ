const { Prisma } = require('@prisma/client')

const Decimal = Prisma.Decimal
const ZONA_HORARIA = process.env.CRON_TIMEZONE || 'America/La_Paz'
const DIAS_POR_MES_MORA = 30
const MS_POR_DIA = 24 * 60 * 60 * 1000

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

/**
 * Calcula la mora que corresponde hoy a una expensa.
 *
 * - El ultimo dia para pagar sin mora es fechaVencimiento + diasGracia (inclusive):
 *   la mora recien corre desde el dia siguiente.
 * - modoMora UNICA: un solo recargo. MENSUAL: el recargo se repite por cada mes de
 *   atraso iniciado (1-30 dias = 1 mes, 31-60 dias = 2 meses, ...).
 */
function calcularMora({ fechaVencimiento, montoTotal, config, hoy = new Date() }) {
  const fechaLimite = sumarDias(fechaCalendario(fechaVencimiento), config.diasGracia)
  const diasAtraso = diasEntre(fechaLimite, fechaEnZona(hoy))

  if (diasAtraso <= 0) {
    return { aplica: false, montoMora: new Decimal(0), mesesAtraso: 0, diasAtraso: 0, fechaLimite }
  }

  const unitaria =
    config.tipoValor === 'PORCENTAJE'
      ? new Decimal(montoTotal).times(config.valor).div(100)
      : new Decimal(config.valor)

  const mesesAtraso = config.modoMora === 'MENSUAL' ? Math.ceil(diasAtraso / DIAS_POR_MES_MORA) : 1
  const montoMora = unitaria.times(mesesAtraso).toDecimalPlaces(2)

  return { aplica: true, montoMora, mesesAtraso, diasAtraso, fechaLimite }
}

module.exports = {
  fechaEnZona,
  fechaCalendario,
  sumarDias,
  diasEntre,
  calcularMora,
  DIAS_POR_MES_MORA
}
