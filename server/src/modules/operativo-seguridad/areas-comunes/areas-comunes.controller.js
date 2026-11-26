const service = require("./areas-comunes.service");
const { exigirCopropietario } = require("../../../middlewares/acceso-propio");

/**
 * Los errores con `datos` (NO_AL_DIA, RESERVAS_EN_CONFLICTO) llevan informacion extra que se devuelve
 * junto al mensaje y al codigo; los demas pasan al middleware de errores.
 */
function responderError(err, res, next) {
  if (err.datos) {
    return res.status(err.status || 409).json({ error: err.message, codigo: err.codigo, ...err.datos });
  }
  return next(err);
}

async function listarAreas(req, res, next) {
  try {
    res.json({ areas: await service.listarAreas() });
  } catch (err) {
    next(err);
  }
}

async function obtenerArea(req, res, next) {
  try {
    res.json({ area: await service.obtenerArea(req.params.id, { rol: req.usuario.rol }) });
  } catch (err) {
    next(err);
  }
}

async function disponibilidad(req, res, next) {
  try {
    const { desde, hasta } = req.query;
    res.json(await service.disponibilidad(req.params.id, { desde, hasta }, { rol: req.usuario.rol }));
  } catch (err) {
    next(err);
  }
}

async function reservar(req, res, next) {
  try {
    const copropietarioId = await exigirCopropietario(req);
    const { fecha, horaInicio, horaFin } = req.body ?? {};
    const reserva = await service.reservar({
      areaId: req.params.id,
      copropietarioId,
      fecha,
      horaInicio,
      horaFin,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ reserva });
  } catch (err) {
    responderError(err, res, next);
  }
}

async function misReservas(req, res, next) {
  try {
    const copropietarioId = await exigirCopropietario(req);
    res.json({ reservas: await service.misReservas(copropietarioId, { estado: req.query.estado }) });
  } catch (err) {
    next(err);
  }
}

async function cancelar(req, res, next) {
  try {
    const admin = req.usuario.rol === "ADMINISTRADOR";
    const reserva = await service.cancelar(req.params.reservaId, {
      motivo: req.body?.motivo,
      rol: req.usuario.rol,
      actorId: req.usuario.id,
      copropietarioId: admin ? null : await exigirCopropietario(req),
      ip: req.ip,
    });
    res.json({ reserva });
  } catch (err) {
    next(err);
  }
}

async function listarReservas(req, res, next) {
  try {
    const { areaId, fecha, estado } = req.query;
    res.json({ reservas: await service.listarReservas({ areaId, fecha, estado }) });
  } catch (err) {
    next(err);
  }
}

async function crearArea(req, res, next) {
  try {
    res.status(201).json({ area: await service.crearArea(req.body ?? {}, { actorId: req.usuario.id, ip: req.ip }) });
  } catch (err) {
    next(err);
  }
}

async function actualizarArea(req, res, next) {
  try {
    res.json({ area: await service.actualizarArea(req.params.id, req.body ?? {}, { actorId: req.usuario.id, ip: req.ip }) });
  } catch (err) {
    next(err);
  }
}

async function crearHorario(req, res, next) {
  try {
    const horario = await service.crearHorario(req.params.id, req.body ?? {}, { actorId: req.usuario.id, ip: req.ip });
    res.status(201).json({ horario });
  } catch (err) {
    next(err);
  }
}

async function actualizarHorario(req, res, next) {
  try {
    const horario = await service.actualizarHorario(req.params.id, req.params.horarioId, req.body ?? {}, {
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.json({ horario });
  } catch (err) {
    next(err);
  }
}

async function eliminarHorario(req, res, next) {
  try {
    await service.eliminarHorario(req.params.id, req.params.horarioId, { actorId: req.usuario.id, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listarBloqueos(req, res, next) {
  try {
    const { desde, hasta } = req.query;
    res.json({ bloqueos: await service.listarBloqueos(req.params.id, { desde, hasta }) });
  } catch (err) {
    next(err);
  }
}

async function crearBloqueo(req, res, next) {
  try {
    const bloqueo = await service.crearBloqueo(req.params.id, req.body ?? {}, { actorId: req.usuario.id, ip: req.ip });
    res.status(201).json({ bloqueo });
  } catch (err) {
    responderError(err, res, next);
  }
}

async function eliminarBloqueo(req, res, next) {
  try {
    await service.eliminarBloqueo(req.params.id, req.params.bloqueoId, { actorId: req.usuario.id, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarAreas,
  obtenerArea,
  disponibilidad,
  reservar,
  misReservas,
  cancelar,
  listarReservas,
  crearArea,
  actualizarArea,
  crearHorario,
  actualizarHorario,
  eliminarHorario,
  listarBloqueos,
  crearBloqueo,
  eliminarBloqueo,
};
