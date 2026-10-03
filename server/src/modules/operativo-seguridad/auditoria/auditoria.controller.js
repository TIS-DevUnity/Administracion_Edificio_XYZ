const auditoriaService = require("./auditoria.service");

async function listar(req, res, next) {
  try {
    const { usuarioId, entidad, entidadId, accion, desde, hasta, pagina } = req.query;
    const resultado = await auditoriaService.listar({
      usuarioId,
      entidad,
      entidadId,
      accion,
      desde,
      hasta,
      pagina,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const registro = await auditoriaService.obtenerPorId(req.params.id);
    res.json({ registro });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener };
