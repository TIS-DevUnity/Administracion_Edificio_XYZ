const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");

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
  const antes = await obtenerPorId(id);

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
    detalle: diferencias(antes, copropietario, ["nombre", "apellido", "ci", "email", "telefono"]),
    ip,
  });

  return copropietario;
}

/**
 * Inmuebles de una persona: los que tiene asociados hoy (vigentes) y las asociaciones que ya
 * terminaron (anteriores). Cada uno trae clase, tipo (A, B, C solo en departamentos), piso,
 * rol (propietario o inquilino) y fechas. Los vigentes se resumen por clase.
 */
async function listarInmuebles(id) {
  const copropietario = await obtenerPorId(id);

  const ocupaciones = await prisma.ocupanteInmueble.findMany({
    where: { copropietarioId: id },
    include: { inmueble: { include: { tipoInmueble: true } } },
    orderBy: [{ fechaInicio: "desc" }, { id: "asc" }],
  });

  const ahora = new Date();
  const items = ocupaciones.map((o) => {
    const vigente = o.fechaInicio <= ahora && (o.fechaFin === null || o.fechaFin > ahora);
    return {
      ocupanteId: o.id,
      inmuebleId: o.inmueble.id,
      codigo: o.inmueble.codigo,
      clase: o.inmueble.clase,
      tipoInmueble: o.inmueble.tipoInmueble?.nombre ?? null,
      piso: o.inmueble.piso,
      areaM2: o.inmueble.areaM2,
      activo: o.inmueble.activo,
      rol: o.esPropietario ? "PROPIETARIO" : "INQUILINO",
      fechaInicio: o.fechaInicio,
      fechaFin: o.fechaFin,
      vigente,
    };
  });

  const vigentes = items.filter((i) => i.vigente);
  const anteriores = items.filter((i) => !i.vigente);

  const contar = (clase) => vigentes.filter((i) => i.clase === clase).length;
  const resumen = {
    departamentos: contar("DEPARTAMENTO"),
    bauleras: contar("BAULERA"),
    parqueos: contar("PARQUEO"),
    total: vigentes.length,
  };

  return { copropietario, vigentes, anteriores, resumen };
}

module.exports = { listar, obtenerPorId, crear, actualizar, listarInmuebles };
