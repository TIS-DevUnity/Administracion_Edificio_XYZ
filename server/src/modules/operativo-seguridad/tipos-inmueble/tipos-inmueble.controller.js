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

async function crear(req, res, next) {
  try {
    const { nombre, montoBase, pesoAgua } = req.body;
    if (!nombre || montoBase === undefined) {
      return res.status(400).json({ error: "nombre y montoBase son requeridos" });
    }

    const tipoInmueble = await tiposInmuebleService.crear({
      nombre,
      montoBase,
      pesoAgua,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ tipoInmueble });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, montoBase, pesoAgua } = req.body;

    const tipoInmueble = await tiposInmuebleService.actualizar(
      req.params.id,
      { nombre, montoBase, pesoAgua },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ tipoInmueble });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, actualizar };
