const service = require('./cuenta-residente.service')

async function obtenerCuenta(req, res, next) {
  try {
    res.json(await service.obtenerCuenta(req.params.id))
  } catch (err) {
    next(err)
  }
}

module.exports = { obtenerCuenta }
