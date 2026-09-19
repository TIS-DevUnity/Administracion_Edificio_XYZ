const copropietariosService = require("./copropietarios.service");

async function listar(req, res, next) {
  try {
    const copropietarios = await copropietariosService.listar();
    res.json({ copropietarios });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const copropietario = await copropietariosService.obtenerPorId(req.params.id);
    res.json({ copropietario });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { nombre, apellido, ci, email, telefono } = req.body;
    if (!nombre || !apellido || !ci) {
      return res.status(400).json({ error: "nombre, apellido y ci son requeridos" });
    }

    const copropietario = await copropietariosService.crear({
      nombre,
      apellido,
      ci,
      email,
      telefono,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ copropietario });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, apellido, ci, email, telefono } = req.body;

    const copropietario = await copropietariosService.actualizar(
      req.params.id,
      { nombre, apellido, ci, email, telefono },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ copropietario });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, actualizar };
