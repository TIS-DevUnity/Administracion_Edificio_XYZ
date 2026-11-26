const service = require('./saldos-favor.service')

async function listar(req, res, next) {
  try {
    res.json(await service.listar())
  } catch (err) {
    next(err)
  }
}

module.exports = { listar }
