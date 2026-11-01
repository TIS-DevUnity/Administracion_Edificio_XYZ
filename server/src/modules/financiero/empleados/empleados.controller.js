const service = require('./empleados.service')

async function crear(req, res, next) {
  try {
    const empleado = await service.crear({ datos: req.body ?? {}, usuarioId: req.usuario.id, ip: req.ip })
    res.status(201).json({ empleado, mensaje: 'Empleado registrado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { estado, q, pagina, porPagina } = req.query
    res.json(await service.listar({ estado, q, pagina, porPagina }))
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

async function actualizar(req, res, next) {
  try {
    const empleado = await service.actualizar(req.params.id, {
      datos: req.body ?? {},
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ empleado, mensaje: 'Empleado actualizado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function cambiarEstado(req, res, next) {
  try {
    const { empleado, cambio } = await service.cambiarEstado(req.params.id, {
      estado: req.body?.estado,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    const etiqueta = empleado.estadoEtiqueta.toLowerCase()
    res.json({ empleado, mensaje: cambio ? `Empleado ${etiqueta}` : `El empleado ya estaba ${etiqueta}` })
  } catch (err) {
    next(err)
  }
}

module.exports = { crear, listar, obtener, actualizar, cambiarEstado }
