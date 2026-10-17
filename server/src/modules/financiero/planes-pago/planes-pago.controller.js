const service = require('./planes-pago.service')

async function crear(req, res, next) {
  try {
    const { inmuebleId, expensaIds, montoTotal, cuotas, cantidadCuotas, primerVencimiento, observacion } = req.body ?? {}
    const plan = await service.crear({
      inmuebleId,
      expensaIds,
      montoTotal,
      cuotas,
      cantidadCuotas,
      primerVencimiento,
      observacion,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json({ plan, mensaje: 'Plan de pagos registrado' })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { inmuebleId, estado } = req.query
    res.json(await service.listar({ inmuebleId, estado }))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json({ plan: await service.obtener(req.params.id) })
  } catch (err) {
    next(err)
  }
}

async function registrarPago(req, res, next) {
  try {
    const { monto, metodoPago, referencia, fechaPago } = req.body ?? {}
    if (monto === undefined || !metodoPago) {
      return res.status(400).json({ error: 'monto y metodoPago son requeridos' })
    }
    const resultado = await service.registrarPago({
      planId: req.params.id,
      monto,
      metodoPago,
      referencia,
      fechaPago,
      claveSolicitud: req.get('Idempotency-Key'),
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(resultado.duplicado ? 200 : 201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function cancelar(req, res, next) {
  try {
    const plan = await service.cancelar(req.params.id, { usuarioId: req.usuario.id, ip: req.ip })
    res.json({ plan, mensaje: 'Plan de pagos cancelado: sus expensas vuelven al cobro normal' })
  } catch (err) {
    next(err)
  }
}

module.exports = { crear, listar, obtener, registrarPago, cancelar }
