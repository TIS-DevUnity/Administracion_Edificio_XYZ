const prisma = require("../../../config/prisma");
const { hashPassword } = require("../../../utils/hash");
const { diferencias } = require("../../../utils/diferencias");
const { registrarAuditoria } = require("../auditoria/auditoria.service");

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  rol: true,
  activo: true,
  ultimoLogin: true,
  copropietarioId: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Copropietario al que se vincula un usuario (es lo que define "lo suyo" para el rol CONSULTA).
 * undefined = sin cambio; null o "" = sin vinculo.
 */
async function validarCopropietario(copropietarioId) {
  if (copropietarioId === undefined) return undefined;
  if (copropietarioId === null || copropietarioId === "") return null;
  const copropietario = await prisma.copropietario.findUnique({ where: { id: copropietarioId } });
  if (!copropietario) {
    throw Object.assign(new Error("Copropietario no encontrado"), { status: 404 });
  }
  return copropietario.id;
}

async function listar() {
  return prisma.usuario.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: "desc" },
  });
}

async function obtenerPorId(id) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  if (!usuario) {
    throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
  }
  return usuario;
}

async function crear({ nombre, apellido, email, password, rol, copropietarioId, actorId, ip }) {
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw Object.assign(new Error("El email ya esta registrado"), { status: 409 });
  }
  const copropietarioVinculado = await validarCopropietario(copropietarioId);

  const passwordHash = await hashPassword(password);
  const usuario = await prisma.usuario.create({
    data: { nombre, apellido, email, passwordHash, rol, copropietarioId: copropietarioVinculado },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Usuario",
    entidadId: usuario.id,
    detalle: { nombre, apellido, email, rol, copropietarioId: usuario.copropietarioId },
    ip,
  });

  return usuario;
}

async function actualizar(id, { nombre, apellido, email, rol, copropietarioId }, { actorId, ip }) {
  const antes = await obtenerPorId(id);
  const copropietarioVinculado = await validarCopropietario(copropietarioId);

  if (email) {
    const conflicto = await prisma.usuario.findUnique({ where: { email } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("El email ya esta registrado"), { status: 409 });
    }
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: { nombre, apellido, email, rol, copropietarioId: copropietarioVinculado },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Usuario",
    entidadId: usuario.id,
    detalle: diferencias(antes, usuario, ["nombre", "apellido", "email", "rol", "copropietarioId"]),
    ip,
  });

  return usuario;
}

async function cambiarEstado(id, activo, { actorId, ip }) {
  const antes = await obtenerPorId(id);

  const usuario = await prisma.usuario.update({
    where: { id },
    data: { activo },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: activo ? "ACTIVAR" : "DESACTIVAR",
    entidad: "Usuario",
    entidadId: usuario.id,
    detalle: diferencias(antes, usuario, ["activo"]),
    ip,
  });

  return usuario;
}

module.exports = { listar, obtenerPorId, crear, actualizar, cambiarEstado };
