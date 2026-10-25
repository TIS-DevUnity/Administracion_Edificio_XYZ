const { errorHttp } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const CLAVE_BLOQUEO_PERIODOS = 'caja-bancos:periodos'

/** "YYYY-MM" en hora de Bolivia (America/La_Paz) de un instante: el mes al que pertenece un cobro. */
function periodoDe(instante) {
  return fechaEnZona(new Date(instante)).slice(0, 7)
}

/** Texto YYYY-MM-DD de un dia de calendario, que puede venir como texto o como Date (columna DATE, medianoche UTC). */
function textoDeDia(dia) {
  const texto = dia instanceof Date ? dia.toISOString().slice(0, 10) : String(dia)
  if (!SOLO_FECHA.test(texto)) throw new Error(`Dia invalido: ${dia}`)
  return texto
}

/** "YYYY-MM" de un dia de calendario (el mes no depende de la zona horaria). */
function periodoDeDia(dia) {
  return textoDeDia(dia).slice(0, 7)
}

/** Instante con el que se guarda un dia de calendario: mediodia de Bolivia, igual que el backfill. */
function instanteDeDia(dia) {
  return new Date(`${textoDeDia(dia)}T12:00:00-04:00`)
}

/** Un periodo esta cerrado si es igual o anterior al ultimo cierre (los cierres son consecutivos). */
function estaCerrado(periodo, ultimoCierre) {
  return Boolean(ultimoCierre) && periodo <= ultimoCierre
}

/** Periodo del ultimo cierre mensual, o null si todavia no hay ninguno. `db` es prisma o una transaccion. */
async function ultimoCierre(db) {
  const cierre = await db.cierreCaja.findFirst({ orderBy: { periodo: 'desc' }, select: { periodo: true } })
  return cierre ? cierre.periodo : null
}

/**
 * Guarda de periodo cerrado: lanza 409 PERIODO_CERRADO si `periodo` ("YYYY-MM") ya se cerro. Toma el
 * lock compartido de periodos, asi un cierre en curso (que toma el exclusivo) espera a los cobros que
 * ya empezaron y los cobros nuevos esperan al cierre: no puede entrar un movimiento en un mes que
 * se esta cerrando. Debe llamarse dentro de la transaccion que escribe.
 */
async function periodoAbierto(tx, periodo) {
  if (typeof periodo !== 'string' || !FORMATO_PERIODO.test(periodo)) {
    throw new Error(`Periodo invalido: ${periodo}`)
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${CLAVE_BLOQUEO_PERIODOS}))`

  const cierre = await ultimoCierre(tx)
  if (estaCerrado(periodo, cierre)) {
    throw errorHttp(
      `El periodo ${periodo} esta cerrado: no se pueden registrar ni modificar movimientos con fecha en ese mes`,
      409,
      { codigo: 'PERIODO_CERRADO', detalle: { periodo, ultimoCierre: cierre } }
    )
  }
}

module.exports = {
  CLAVE_BLOQUEO_PERIODOS,
  periodoDe,
  periodoDeDia,
  instanteDeDia,
  estaCerrado,
  ultimoCierre,
  periodoAbierto
}
