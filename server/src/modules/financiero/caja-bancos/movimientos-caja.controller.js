const service = require('./movimientos-caja.service')

async function listar(req, res, next) {
  try {
    res.json(await service.listar(req.query))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(req.params.id))
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtener }
