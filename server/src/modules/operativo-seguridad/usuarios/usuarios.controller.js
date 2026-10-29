const usuariosService = require("./usuarios.service");
const { validarPassword } = require("../../../utils/validarPassword");

const ROLES_VALIDOS = ["ADMINISTRADOR", "DIRECTORIO", "CONSULTA"];

async function listar(req, res, next) {
  try {
    const usuarios = await usuariosService.listar();
    res.json({ usuarios });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const usuario = await usuariosService.obtenerPorId(req.params.id);
    res.json({ usuario });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { nombre, apellido, email, password, rol, copropietarioId } = req.body;
    if (!nombre || !apellido || !email || !password || !rol) {
      return res.status(400).json({ error: "nombre, apellido, email, password y rol son requeridos" });
    }
    const erroresPassword = validarPassword(password);
    if (erroresPassword.length > 0) {
      return res.status(400).json({ error: `La contraseña no cumple: ${erroresPassword.join(", ")}` });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `rol debe ser uno de: ${ROLES_VALIDOS.join(", ")}` });
    }
    if (copropietarioId !== undefined && copropietarioId !== null && typeof copropietarioId !== "string") {
      return res.status(400).json({ error: "copropietarioId debe ser un texto o null" });
    }

    const usuario = await usuariosService.crear({
      nombre,
      apellido,
      email,
      password,
      rol,
      copropietarioId,
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json({ usuario });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, apellido, email, rol, copropietarioId } = req.body;
    if (rol && !ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `rol debe ser uno de: ${ROLES_VALIDOS.join(", ")}` });
    }
    if (copropietarioId !== undefined && copropietarioId !== null && typeof copropietarioId !== "string") {
      return res.status(400).json({ error: "copropietarioId debe ser un texto o null" });
    }

    const usuario = await usuariosService.actualizar(
      req.params.id,
      { nombre, apellido, email, rol, copropietarioId },
      { actorId: req.usuario.id, ip: req.ip }
    );
    res.json({ usuario });
  } catch (err) {
    next(err);
  }
}

async function cambiarEstado(req, res, next) {
  try {
    const { activo } = req.body;
    if (typeof activo !== "boolean") {
      return res.status(400).json({ error: "activo debe ser true o false" });
    }

    const usuario = await usuariosService.cambiarEstado(req.params.id, activo, {
      actorId: req.usuario.id,
      ip: req.ip,
    });
    res.json({ usuario });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
