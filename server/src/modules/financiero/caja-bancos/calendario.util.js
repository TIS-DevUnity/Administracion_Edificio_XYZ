const { errorHttp } = require('../expensas/saldo.util')
const { periodoDe } = require('./periodos.util')

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Periodo "YYYY-MM" que llega del cliente (ruta o consulta). 400 si no tiene ese formato. */
function normalizarPeriodo(valor, campo = 'periodo') {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!FORMATO_PERIODO.test(texto)) throw errorHttp(`${campo} debe tener el formato YYYY-MM`, 400)
  return texto
}

/** Dia YYYY-MM-DD que llega del cliente. 400 si no tiene ese formato o no es una fecha real. */
function normalizarDia(valor, campo = 'fecha') {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!SOLO_FECHA.test(texto)) throw errorHttp(`${campo} debe tener el formato YYYY-MM-DD`, 400)
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return texto
}

/** Periodo que sigue a otro: "2026-12" -> "2027-01". */
function siguientePeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number)
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`
}

/** Inicio y fin (exclusivo) de un periodo como instantes en hora de Bolivia (UTC-4 todo el anio). */
function rangoDePeriodo(periodo) {
  return {
    inicio: new Date(`${periodo}-01T00:00:00-04:00`),
    fin: new Date(`${siguientePeriodo(periodo)}-01T00:00:00-04:00`)
  }
}

/** Inicio y fin (exclusivo) de un periodo para columnas DATE (medianoche UTC). */
function rangoDiasDePeriodo(periodo) {
  return {
    inicio: new Date(`${periodo}-01T00:00:00Z`),
    fin: new Date(`${siguientePeriodo(periodo)}-01T00:00:00Z`)
  }
}

function inicioDeDia(dia) {
  return new Date(`${dia}T00:00:00.000-04:00`)
}

function finDeDia(dia) {
  return new Date(`${dia}T23:59:59.999-04:00`)
}

/** Un mes termino cuando ya empezo un mes posterior (en hora de Bolivia). */
function mesTerminado(periodo, ahora = new Date()) {
  return periodo < periodoDe(ahora)
}

module.exports = {
  normalizarPeriodo,
  normalizarDia,
  siguientePeriodo,
  rangoDePeriodo,
  rangoDiasDePeriodo,
  inicioDeDia,
  finDeDia,
  mesTerminado
}
