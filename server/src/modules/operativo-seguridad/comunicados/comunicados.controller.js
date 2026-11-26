const comunicadosService = require("./comunicados.service");

async function listar(req, res, next) {
  try {
    const comunicados = await comunicadosService.listar({
      estado: req.query.estado,
      rol: req.usuario.rol,
    });
    res.json({ comunicados });
  } catch (err) {
    next(err);
  }
}

async function listarDestinatarios(req, res, next) {
  try {
    const destinatarios = await comunicadosService.listarDestinatarios();
    res.json({ destinatarios });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const comunicado = await comunicadosService.obtenerPorId(req.params.id, { rol: req.usuario.rol });
    res.json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { titulo, cuerpo, canales, destinatarios } = req.body ?? {};
    const comunicado = await comunicadosService.crear({
      titulo,
      cuerpo,
      canales,
      destinatarios,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { titulo, cuerpo, canales, destinatarios } = req.body ?? {};
    const comunicado = await comunicadosService.actualizar(req.params.id, {
      titulo,
      cuerpo,
      canales,
      destinatarios,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.json({ comunicado });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    await comunicadosService.eliminar(req.params.id, { actorId: req.usuario.id, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function vistaPrevia(req, res, next) {
  try {
    const vistaPrevia = await comunicadosService.vistaPrevia(req.params.id);
    res.json({ vistaPrevia });
  } catch (err) {
    next(err);
  }
}

async function enviar(req, res, next) {
  try {
    const { confirmar } = req.body ?? {};
    const resultado = await comunicadosService.enviar(req.params.id, {
      confirmar,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function resultado(req, res, next) {
  try {
    res.json(await comunicadosService.obtenerResultado(req.params.id, { rol: req.usuario.rol }));
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, listarDestinatarios, obtener, crear, actualizar, eliminar, vistaPrevia, enviar, resultado };
