const documentosService = require("./documentos.service");

async function listar(req, res, next) {
  try {
    const { categoria, entidad, entidadId } = req.query;
    const documentos = await documentosService.listar({ categoria, entidad, entidadId });
    res.json({ documentos });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const { documento, url } = await documentosService.obtenerUrlDescarga(req.params.id);
    res.json({ documento, url });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { categoria, entidad, entidadId } = req.body;
    const documento = await documentosService.crear({
      archivo: req.file,
      categoria,
      entidad,
      entidadId,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ documento });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    await documentosService.eliminar(req.params.id, { actorId: req.usuario.id, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, eliminar };
