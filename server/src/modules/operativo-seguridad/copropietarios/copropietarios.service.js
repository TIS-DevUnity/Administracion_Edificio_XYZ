const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  apellido: true,
  ci: true,
  email: true,
  telefono: true,
  createdAt: true,
  updatedAt: true,
};

async function listar() {
  return prisma.copropietario.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: "desc" },
  });
}

async function obtenerPorId(id) {
  const copropietario = await prisma.copropietario.findUnique({
    where: { id },
    select: CAMPOS_PUBLICOS,
  });
  if (!copropietario) {
    throw Object.assign(new Error("Copropietario no encontrado"), { status: 404 });
  }
  return copropietario;
}

async function crear({ nombre, apellido, ci, email, telefono, actorId, ip }) {
  const existente = await prisma.copropietario.findUnique({ where: { ci } });
  if (existente) {
    throw Object.assign(new Error("Ya existe un copropietario con ese CI"), { status: 409 });
  }

  const copropietario = await prisma.copropietario.create({
    data: { nombre, apellido, ci, email, telefono },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Copropietario",
    entidadId: copropietario.id,
    detalle: { nombre, apellido, ci, email, telefono },
    ip,
  });

  return copropietario;
}

async function actualizar(id, { nombre, apellido, ci, email, telefono }, { actorId, ip }) {
  await obtenerPorId(id);

  if (ci) {
    const conflicto = await prisma.copropietario.findUnique({ where: { ci } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("Ya existe un copropietario con ese CI"), { status: 409 });
    }
  }

  const copropietario = await prisma.copropietario.update({
    where: { id },
    data: { nombre, apellido, ci, email, telefono },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Copropietario",
    entidadId: copropietario.id,
    detalle: { nombre, apellido, ci, email, telefono },
    ip,
  });

  return copropietario;
}

module.exports = { listar, obtenerPorId, crear, actualizar };
