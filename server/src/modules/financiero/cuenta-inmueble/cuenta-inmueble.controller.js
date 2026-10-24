const service = require('./cuenta-inmueble.service')
const { generarEstadoCuentaPdf } = require('./estado-cuenta-pdf.service')

async function registrarPagoAnticipado(req, res, next) {
  try {
    const { monto, metodoPago, referencia, fechaPago, cuentaId } = req.body
    if (monto === undefined || !metodoPago) {
      return res.status(400).json({ error: 'monto y metodoPago son requeridos' })
    }
    const resultado = await service.registrarPagoAnticipado({
      inmuebleId: req.params.id,
      monto,
      metodoPago,
      referencia,
      fechaPago,
      cuentaId,
      claveSolicitud: req.get('Idempotency-Key'),
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(resultado.duplicado ? 200 : 201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function registrarPagoInmueble(req, res, next) {
  try {
    const { monto, metodoPago, referencia, fechaPago, cuentaId } = req.body
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
      cuentaId,
      claveSolicitud: req.get('Idempotency-Key'),
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(resultado.duplicado ? 200 : 201).json(resultado)
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

/**
 * Si el calculo falla por un motivo inesperado se responde con un mensaje claro y sin datos: nunca
 * se devuelven cuentas a medias como si fueran definitivas.
 */
function errorEstadoCuenta(err) {
  if (err.status) return err
  console.error(err)
  return Object.assign(
    new Error('No se pudo generar el estado de cuenta. Intente nuevamente; no se muestran datos incompletos.'),
    { status: 500, codigo: 'ERROR_ESTADO_CUENTA' }
  )
}

async function obtenerEstadoCuenta(req, res, next) {
  try {
    const { desde, hasta, mes } = req.query
    res.json(await service.obtenerEstadoCuenta(req.params.id, { desde, hasta, mes }))
  } catch (err) {
    next(errorEstadoCuenta(err))
  }
}

async function descargarEstadoCuentaPdf(req, res, next) {
  try {
    const { desde, hasta, mes, inline } = req.query
    const estado = await service.obtenerEstadoCuenta(req.params.id, { desde, hasta, mes })
    const pdf = await generarEstadoCuentaPdf(estado)
    const sufijo = estado.periodo.mes ?? ([estado.periodo.desde, estado.periodo.hasta].filter(Boolean).join('_a_') || 'completo')
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `${inline === 'true' ? 'inline' : 'attachment'}; filename="estado-cuenta-${estado.inmueble.codigo}-${sufijo}.pdf"`,
      'Cache-Control': 'private, no-store'
    })
    res.send(pdf)
  } catch (err) {
    next(errorEstadoCuenta(err))
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
  descargarEstadoCuentaPdf,
  listarMovimientosSaldo
}
