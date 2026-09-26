const auditoriaService = require("./auditoria.service");

async function listar(req, res, next) {
  try {
    const { usuarioId, entidad, accion, desde, hasta, pagina } = req.query;
    const resultado = await auditoriaService.listar({
      usuarioId,
      entidad,
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

module.exports = { listar };
