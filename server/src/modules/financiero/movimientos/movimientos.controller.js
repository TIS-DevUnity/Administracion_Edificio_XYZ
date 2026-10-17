const service = require('./movimientos.service')

/** La clave que evita contar dos veces una solicitud reenviada: cabecera Idempotency-Key. */
function claveDe(req) {
  return req.get('Idempotency-Key') ?? req.body?.claveSolicitud
}

async function listarCategorias(req, res, next) {
  try {
    const { tipo, incluirInactivas } = req.query
    res.json({ categorias: await service.listarCategorias({ tipo, incluirInactivas }) })
  } catch (err) {
    next(err)
  }
}

async function crearCategoria(req, res, next) {
  try {
    const { nombre, tipo } = req.body ?? {}
    const categoria = await service.crearCategoria({ nombre, tipo, usuarioId: req.usuario.id, ip: req.ip })
    res.status(201).json({ categoria })
  } catch (err) {
    next(err)
  }
}

async function actualizarCategoria(req, res, next) {
  try {
    const { nombre, activa } = req.body ?? {}
    const categoria = await service.actualizarCategoria(req.params.id, {
      nombre,
      activa,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ categoria })
  } catch (err) {
    next(err)
  }
}

async function crear(req, res, next) {
  try {
    const resultado = await service.crear({
      datos: req.body ?? {},
      archivo: req.file,
      claveSolicitud: claveDe(req),
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(resultado.duplicado ? 200 : 201).json({
      movimiento: resultado.movimiento,
      duplicado: resultado.duplicado,
      mensaje: resultado.duplicado
        ? 'Este movimiento ya estaba registrado: no se registro de nuevo'
        : 'Movimiento registrado correctamente'
    })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { tipo, categoriaId, desde, hasta, pagina, porPagina } = req.query
    res.json(await service.listar({ tipo, categoriaId, desde, hasta, pagina, porPagina }))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json({ movimiento: await service.obtener(req.params.id) })
  } catch (err) {
    next(err)
  }
}

async function obtenerBalance(req, res, next) {
  try {
    const { desde, hasta } = req.query
    res.json(await service.obtenerBalance({ desde, hasta }))
  } catch (err) {
    next(err)
  }
}

async function actualizar(req, res, next) {
  try {
    const movimiento = await service.actualizar(req.params.id, {
      datos: req.body ?? {},
      archivo: req.file,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ movimiento, mensaje: 'Movimiento actualizado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function adjuntarComprobante(req, res, next) {
  try {
    const movimiento = await service.adjuntarComprobante(req.params.id, {
      archivo: req.file,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json({ movimiento, mensaje: 'Comprobante adjuntado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function obtenerComprobante(req, res, next) {
  try {
    res.json(await service.obtenerEnlaceComprobante(req.params.id, { descargar: req.query.descargar === 'true' }))
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  crear,
  listar,
  obtener,
  obtenerBalance,
  actualizar,
  adjuntarComprobante,
  obtenerComprobante
}
