const service = require('./cierres.service')

async function vistaPrevia(req, res, next) {
  try {
    res.json(await service.vistaPrevia(req.params.periodo))
  } catch (err) {
    next(err)
  }
}

async function cerrar(req, res, next) {
  try {
    const { confirmarDiferencias, observacion } = req.body ?? {}
    const resultado = await service.cerrar(
      req.params.periodo,
      { confirmarDiferencias, observacion },
      { usuarioId: req.usuario.id, ip: req.ip }
    )
    res.status(201).json({ ...resultado, mensaje: `Periodo ${req.params.periodo} cerrado correctamente` })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    res.json(await service.listarCierres(req.query))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtenerCierre(req.params.periodo))
  } catch (err) {
    next(err)
  }
}

module.exports = { vistaPrevia, cerrar, listar, obtener }
