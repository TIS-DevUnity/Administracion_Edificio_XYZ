const {
  ejecutarGeneracionAutomatica,
  ejecutarAplicacionMoraAutomatica
} = require('./generacion-automatica.job')

/**
 * Dispara manualmente la generacion automatica de expensas. Por defecto
 * respeta el dia configurado (igual que el cron real); si se llama con
 * ?forzar=true, se salta esa validacion (uso exclusivo de administracion
 * para pruebas o demostraciones, nunca automatico).
 */
async function ejecutarGeneracion(req, res, next) {
  try {
    const forzar = req.query.forzar === 'true'
    const resultado = await ejecutarGeneracionAutomatica(new Date(), { forzar })
    res.json(resultado)
  } catch (err) {
    next(err)
  }
}

/**
 * Dispara manualmente la aplicacion de mora a expensas vencidas. No tiene
 * restriccion de fecha, se puede llamar en cualquier momento.
 */
async function ejecutarMora(req, res, next) {
  try {
    const resultado = await ejecutarAplicacionMoraAutomatica()
    res.json(resultado)
  } catch (err) {
    next(err)
  }
}

module.exports = { ejecutarGeneracion, ejecutarMora }
