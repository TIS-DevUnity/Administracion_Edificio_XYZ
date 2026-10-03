const service = require('./cuenta-inmueble.service')

async function registrarPagoAnticipado(req, res, next) {
  try {
    const { monto, metodoPago, referencia } = req.body
    if (monto === undefined || !metodoPago) {
      return res.status(400).json({ error: 'monto y metodoPago son requeridos' })
    }
    const resultado = await service.registrarPagoAnticipado({
      inmuebleId: req.params.id,
      monto,
      metodoPago,
      referencia,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function obtenerSaldo(req, res, next) {
  try {
    res.json(await service.obtenerSaldo(req.params.id))
  } catch (err) {
    next(err)
  }
}

async function obtenerEstadoCuenta(req, res, next) {
  try {
    const { desde, hasta } = req.query
    res.json(await service.obtenerEstadoCuenta(req.params.id, { desde, hasta }))
  } catch (err) {
    next(err)
  }
}

async function listarMovimientosSaldo(req, res, next) {
  try {
    res.json(await service.listarMovimientosSaldo(req.params.id))
  } catch (err) {
    next(err)
  }
}

module.exports = {
  registrarPagoAnticipado,
  obtenerSaldo,
  obtenerEstadoCuenta,
  listarMovimientosSaldo
}
