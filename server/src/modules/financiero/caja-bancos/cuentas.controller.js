const service = require('./cuentas.service')

async function listar(req, res, next) {
  try {
    const { tipo, incluirInactivas } = req.query
    res.json({ cuentas: await service.listar({ tipo, incluirInactivas }) })
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json({ cuenta: await service.obtener(req.params.id) })
  } catch (err) {
    next(err)
  }
}

async function crear(req, res, next) {
  try {
    const cuenta = await service.crear({ datos: req.body ?? {}, usuarioId: req.usuario.id, ip: req.ip })
    res.status(201).json({ cuenta, mensaje: 'Cuenta creada correctamente' })
  } catch (err) {
    next(err)
  }
}

async function actualizar(req, res, next) {
  try {
    const cuenta = await service.actualizar(req.params.id, {
      datos: req.body ?? {},
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ cuenta, mensaje: 'Cuenta actualizada correctamente' })
  } catch (err) {
    next(err)
  }
}

async function designarPorDefecto(req, res, next) {
  try {
    const { cuenta, anterior, sinCambios } = await service.designarPorDefecto(req.params.id, {
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({
      cuenta,
      anterior,
      mensaje: sinCambios ? 'Esta cuenta ya es la cuenta por defecto' : 'Cuenta por defecto actualizada correctamente'
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  designarPorDefecto
}
