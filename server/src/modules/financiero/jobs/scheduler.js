const cron = require('node-cron')
const {
  ejecutarGeneracionAutomatica,
  ejecutarAplicacionMoraAutomatica
} = require('./generacion-automatica.job')

const TIMEZONE = process.env.CRON_TIMEZONE || 'America/La_Paz'

/**
 * Registra los cron jobs financieros. Se llama una sola vez al arrancar el
 * servidor (ver server.js). En entorno de test no se registran para no dejar
 * timers activos que impidan que el proceso termine.
 */
function iniciarCronsFinancieros() {
  // Todos los dias a las 06:00: genera expensas si corresponde al dia
  // configurado en ConfiguracionMora.diaGeneracion.
  cron.schedule(
    '0 6 * * *',
    () => {
      ejecutarGeneracionAutomatica().catch((err) =>
        console.error('[cron:expensas] Fallo inesperado:', err)
      )
    },
    { timezone: TIMEZONE }
  )

  // Todos los dias a las 06:30: aplica mora a las expensas vencidas.
  cron.schedule(
    '30 6 * * *',
    () => {
      ejecutarAplicacionMoraAutomatica().catch((err) =>
        console.error('[cron:mora] Fallo inesperado:', err)
      )
    },
    { timezone: TIMEZONE }
  )

  console.log(`[cron] Jobs financieros registrados (timezone: ${TIMEZONE})`)
}

module.exports = { iniciarCronsFinancieros }
