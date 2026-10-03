const service = require('./cuenta-inmueble.service')

async function registrarPagoAnticipado(req, res, next) {
  try {
    const { monto, metodoPago, referencia, fechaPago } = req.body
    if (monto === undefined || !metodoPago) {
      return res.status(400).json({ error: 'monto y metodoPago son requeridos' })
    }
    const resultado = await service.registrarPagoAnticipado({
      inmuebleId: req.params.id,
      monto,
      metodoPago,
      referencia,
      fechaPago,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function registrarPagoInmueble(req, res, next) {
  try {
    const { monto, metodoPago, referencia, fechaPago } = req.body
    // Se avisa de todo lo que falta de una vez, no campo por campo.
    const faltantes = [
      monto === undefined || monto === null || monto === '' ? 'monto' : null,
      !metodoPago ? 'metodoPago' : null,
      !fechaPago ? 'fechaPago' : null
    ].filter(Boolean)
    if (faltantes.length) {
      return res.status(400).json({ error: `Faltan campos obligatorios: ${faltantes.join(', ')}`, campos: faltantes })
    }
    const resultado = await service.registrarPagoInmueble({
      inmuebleId: req.params.id,
      monto,
      metodoPago,
      referencia,
      fechaPago,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function listarPagos(req, res, next) {
  try {
    const { desde, hasta } = req.query
    res.json(await service.listarPagos(req.params.id, { desde, hasta }))
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
  registrarPagoInmueble,
  listarPagos,
  obtenerSaldo,
  obtenerEstadoCuenta,
  listarMovimientosSaldo
}
