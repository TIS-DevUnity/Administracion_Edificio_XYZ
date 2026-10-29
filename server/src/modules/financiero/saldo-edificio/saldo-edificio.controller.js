const service = require('./saldo-edificio.service')

async function obtener(req, res, next) {
  try {
    const { desde, hasta, tipo, pagina, porPagina } = req.query
    res.json(await service.obtener({ desde, hasta, tipo, pagina, porPagina }))
  } catch (err) {
    next(err)
  }
}

module.exports = { obtener }
