const service = require('./pagos-informados.service')
const { esConsulta, inmueblesPropios, exigirCopropietario } = require('../../../middlewares/acceso-propio')

// El rol CONSULTA solo ve los avisos de sus inmuebles; Administrador y Directorio ven todos.
const inmueblesVisibles = async (req) => (esConsulta(req) ? inmueblesPropios(req) : undefined)

async function informar(req, res, next) {
  try {
    const { inmuebleId, monto, metodoPago, referencia, fechaPago } = req.body ?? {}
    const copropietarioId = await exigirCopropietario(req)
    const resultado = await service.informar({
      copropietarioId,
      inmueblesPermitidos: await inmueblesPropios(req),
      inmuebleId,
      monto,
      metodoPago,
      referencia,
      fechaPago,
      archivo: req.file,
      claveSolicitud: req.get('Idempotency-Key'),
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(resultado.duplicado ? 200 : 201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { estado, inmuebleId } = req.query
    res.json(await service.listar({ estado, inmuebleId, inmuebleIds: await inmueblesVisibles(req) }))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(req.params.id, { inmuebleIds: await inmueblesVisibles(req) }))
  } catch (err) {
    next(err)
  }
}

async function obtenerComprobante(req, res, next) {
  try {
    res.json(await service.obtenerEnlaceComprobante(req.params.id, { inmuebleIds: await inmueblesVisibles(req) }))
  } catch (err) {
    next(err)
  }
}

async function confirmar(req, res, next) {
  try {
    const { cuentaId } = req.body ?? {}
    res.json(await service.confirmar(req.params.id, { cuentaId, usuarioId: req.usuario.id, ip: req.ip }))
  } catch (err) {
    next(err)
  }
}

async function rechazar(req, res, next) {
  try {
    const { motivo } = req.body ?? {}
    res.json(await service.rechazar(req.params.id, { motivo, usuarioId: req.usuario.id, ip: req.ip }))
  } catch (err) {
    next(err)
  }
}

module.exports = { informar, listar, obtener, obtenerComprobante, confirmar, rechazar }
