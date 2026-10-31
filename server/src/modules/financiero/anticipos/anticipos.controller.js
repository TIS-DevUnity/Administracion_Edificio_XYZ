const service = require('./anticipos.service')

async function crear(req, res, next) {
  try {
    const resultado = await service.crear({ datos: req.body ?? {}, usuarioId: req.usuario.id, ip: req.ip })
    res.status(201).json({ ...resultado, mensaje: 'Anticipo registrado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { empleadoId, estado, desde, hasta, pagina, porPagina } = req.query
    res.json(await service.listar({ empleadoId, estado, desde, hasta, pagina, porPagina }))
  } catch (err) {
    next(err)
  }
}

async function pendientes(req, res, next) {
  try {
    res.json(await service.pendientes())
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(req.params.id))
  } catch (err) {
    next(err)
  }
}

module.exports = { crear, listar, pendientes, obtener }
