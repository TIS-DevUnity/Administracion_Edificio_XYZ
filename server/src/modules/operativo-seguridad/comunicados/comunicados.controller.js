const comunicadosService = require("./comunicados.service");

async function listar(req, res, next) {
  try {
    const comunicados = await comunicadosService.listar({
      estado: req.query.estado,
      rol: req.usuario.rol,
    });
    res.json({ comunicados });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const comunicado = await comunicadosService.obtenerPorId(req.params.id, { rol: req.usuario.rol });
    res.json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { titulo, cuerpo, canales } = req.body ?? {};
    const comunicado = await comunicadosService.crear({
      titulo,
      cuerpo,
      canales,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { titulo, cuerpo, canales } = req.body ?? {};
    const comunicado = await comunicadosService.actualizar(req.params.id, {
      titulo,
      cuerpo,
      canales,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    await comunicadosService.eliminar(req.params.id, { actorId: req.usuario.id, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
