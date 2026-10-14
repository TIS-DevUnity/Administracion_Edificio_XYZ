const tarifasService = require("./tarifas-inmueble.service");

async function listar(req, res, next) {
  try {
    const tarifas = await tarifasService.listar();
    res.json({ tarifas });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { monto } = req.body;
    if (monto === undefined) {
      return res.status(400).json({ error: "monto es requerido" });
    }

    const tarifa = await tarifasService.actualizar(
      req.params.clase,
      { monto },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ tarifa });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, actualizar };
