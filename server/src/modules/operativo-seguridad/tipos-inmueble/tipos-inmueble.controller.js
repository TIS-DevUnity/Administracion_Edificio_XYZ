const tiposInmuebleService = require("./tipos-inmueble.service");

async function listar(req, res, next) {
  try {
    const tiposInmueble = await tiposInmuebleService.listar();
    res.json({ tiposInmueble });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const tipoInmueble = await tiposInmuebleService.obtenerPorId(req.params.id);
    res.json({ tipoInmueble });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener };
