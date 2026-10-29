const inmueblesService = require("./inmuebles.service");
const { esConsulta, inmueblesPropios, copropietarioDe } = require("../../../middlewares/acceso-propio");

async function listar(req, res, next) {
  try {
    // CONSULTA solo recibe los inmuebles que ocupa.
    const ids = esConsulta(req) ? await inmueblesPropios(req) : undefined;
    const inmuebles = await inmueblesService.listar({ ids });
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
    const { codigo, clase, tipoInmuebleId, piso, areaM2, cuotaMensual } = req.body;
    if (!codigo) {
      return res.status(400).json({ error: "codigo es requerido" });
    }

    const inmueble = await inmueblesService.crear({
      codigo,
      clase: clase || undefined,
      tipoInmuebleId,
      piso,
      areaM2,
      cuotaMensual,
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
    const { codigo, clase, tipoInmuebleId, piso, areaM2, activo, cuotaMensual } = req.body;

    const inmueble = await inmueblesService.actualizar(
      req.params.id,
      { codigo, clase, tipoInmuebleId, piso, areaM2, activo, cuotaMensual },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ inmueble });
  } catch (err) {
    next(err);
  }
}

async function listarOcupantes(req, res, next) {
  try {
    let ocupantes = await inmueblesService.listarOcupantes(req.params.id);
    if (esConsulta(req)) {
      // De las demas personas del inmueble solo se muestra el nombre; sus datos personales no.
      const propio = await copropietarioDe(req);
      ocupantes = ocupantes.map((o) =>
        o.copropietarioId === propio
          ? o
          : {
              id: o.id,
              inmuebleId: o.inmuebleId,
              esPropietario: o.esPropietario,
              fechaInicio: o.fechaInicio,
              fechaFin: o.fechaFin,
              copropietario: { nombre: o.copropietario.nombre, apellido: o.copropietario.apellido },
            }
      );
    }
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
    const { fechaFin } = req.body;
    const ocupante = await inmueblesService.darDeBajaOcupante(
      req.params.id,
      req.params.ocupanteId,
      { fechaFin, actorId: req.usuario.id, ip: req.ip }
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
