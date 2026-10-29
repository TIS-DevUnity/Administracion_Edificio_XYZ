const service = require('./conciliacion.service')

async function comprobar(req, res, next) {
  try {
    res.json(await service.comprobar(req.params.id, { datos: req.body ?? {} }))
  } catch (err) {
    next(err)
  }
}

async function conciliar(req, res, next) {
  try {
    const resultado = await service.conciliar(req.params.id, { datos: req.body ?? {}, usuarioId: req.usuario.id })
    res.json({
      ...resultado,
      mensaje: resultado.coincide
        ? 'Movimiento conciliado correctamente'
        : 'El movimiento no coincide con el extracto: queda con diferencia, pendiente de revision'
    })
  } catch (err) {
    next(err)
  }
}

async function actualizarObservacion(req, res, next) {
  try {
    const movimiento = await service.actualizarObservacion(req.params.id, {
      observacion: (req.body ?? {}).observacion,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ movimiento, mensaje: 'Observacion actualizada correctamente' })
  } catch (err) {
    next(err)
  }
}

async function listarEventos(req, res, next) {
  try {
    res.json(await service.listarEventos(req.query))
  } catch (err) {
    next(err)
  }
}

module.exports = { comprobar, conciliar, actualizarObservacion, listarEventos }
