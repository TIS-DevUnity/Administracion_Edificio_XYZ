const service = require('./morosos.service')
const { enviarPdf } = require('../nomina/pdf-comun.util')

async function morosos(req, res, next) {
  try {
    const { desde, hasta, orden } = req.query
    const { datos } = await service.generar({ formato: 'JSON', desde, hasta, orden, usuarioId: req.usuario.id, ip: req.ip })
    res.json(datos)
  } catch (err) {
    next(err)
  }
}

async function morososPdf(req, res, next) {
  try {
    const { desde, hasta, orden } = req.query
    const { pdf, nombreArchivo } = await service.generar({ formato: 'PDF', desde, hasta, orden, usuarioId: req.usuario.id, ip: req.ip })
    enviarPdf(res, pdf, nombreArchivo, req.query.inline === 'true')
  } catch (err) {
    next(err)
  }
}

module.exports = { morosos, morososPdf }
