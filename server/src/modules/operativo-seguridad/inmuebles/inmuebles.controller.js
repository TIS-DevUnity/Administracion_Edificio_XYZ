const inmueblesService = require("./inmuebles.service");

async function listar(req, res, next) {
  try {
    const inmuebles = await inmueblesService.listar();
    res.json({ inmuebles });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const inmueble = await inmueblesService.obtenerPorId(req.params.id);
    res.json({ inmueble });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { codigo, tipoInmuebleId, piso, areaM2 } = req.body;
    if (!codigo || !tipoInmuebleId) {
      return res.status(400).json({ error: "codigo y tipoInmuebleId son requeridos" });
    }

    const inmueble = await inmueblesService.crear({
      codigo,
      tipoInmuebleId,
      piso,
      areaM2,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ inmueble });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { codigo, tipoInmuebleId, piso, areaM2, activo } = req.body;

    const inmueble = await inmueblesService.actualizar(
      req.params.id,
      { codigo, tipoInmuebleId, piso, areaM2, activo },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ inmueble });
  } catch (err) {
    next(err);
  }
}

async function listarOcupantes(req, res, next) {
  try {
    const ocupantes = await inmueblesService.listarOcupantes(req.params.id);
    res.json({ ocupantes });
  } catch (err) {
    next(err);
  }
}

async function asignarOcupante(req, res, next) {
  try {
    const { copropietarioId, esPropietario, fechaInicio } = req.body;
    if (!copropietarioId) {
      return res.status(400).json({ error: "copropietarioId es requerido" });
    }

    const ocupante = await inmueblesService.asignarOcupante(
      req.params.id,
      { copropietarioId, esPropietario, fechaInicio },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.status(201).json({ ocupante });
  } catch (err) {
    next(err);
  }
}

async function darDeBajaOcupante(req, res, next) {
  try {
    const ocupante = await inmueblesService.darDeBajaOcupante(
      req.params.id,
      req.params.ocupanteId,
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ ocupante });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  listarOcupantes,
  asignarOcupante,
  darDeBajaOcupante,
};
