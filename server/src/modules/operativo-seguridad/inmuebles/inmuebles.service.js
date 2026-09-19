const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");

const CAMPOS_PUBLICOS = {
  id: true,
  codigo: true,
  piso: true,
  areaM2: true,
  activo: true,
  tipoInmuebleId: true,
  tipoInmueble: {
    select: { id: true, nombre: true, montoBase: true },
  },
  createdAt: true,
  updatedAt: true,
};

const CAMPOS_OCUPANTE = {
  id: true,
  inmuebleId: true,
  copropietarioId: true,
  esPropietario: true,
  fechaInicio: true,
  fechaFin: true,
  copropietario: {
    select: { id: true, nombre: true, apellido: true, ci: true },
  },
};

async function obtenerTipoInmueble(tipoInmuebleId) {
  const tipoInmueble = await prisma.tipoInmueble.findUnique({ where: { id: tipoInmuebleId } });
  if (!tipoInmueble) {
    throw Object.assign(new Error("Tipo de inmueble no encontrado"), { status: 404 });
  }
  return tipoInmueble;
}

async function listar() {
  return prisma.inmueble.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: { codigo: "asc" },
  });
}

async function obtenerPorId(id) {
  const inmueble = await prisma.inmueble.findUnique({
    where: { id },
    select: CAMPOS_PUBLICOS,
  });
  if (!inmueble) {
    throw Object.assign(new Error("Inmueble no encontrado"), { status: 404 });
  }
  return inmueble;
}

async function crear({ codigo, tipoInmuebleId, piso, areaM2, actorId, ip }) {
  const existente = await prisma.inmueble.findUnique({ where: { codigo } });
  if (existente) {
    throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
  }
  await obtenerTipoInmueble(tipoInmuebleId);

  const inmueble = await prisma.inmueble.create({
    data: { codigo, tipoInmuebleId, piso, areaM2 },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Inmueble",
    entidadId: inmueble.id,
    detalle: { codigo, tipoInmuebleId, piso, areaM2 },
    ip,
  });

  return inmueble;
}

async function actualizar(id, { codigo, tipoInmuebleId, piso, areaM2, activo }, { actorId, ip }) {
  await obtenerPorId(id);

  if (codigo) {
    const conflicto = await prisma.inmueble.findUnique({ where: { codigo } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
    }
  }
  if (tipoInmuebleId) {
    await obtenerTipoInmueble(tipoInmuebleId);
  }

  const inmueble = await prisma.inmueble.update({
    where: { id },
    data: { codigo, tipoInmuebleId, piso, areaM2, activo },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Inmueble",
    entidadId: inmueble.id,
    detalle: { codigo, tipoInmuebleId, piso, areaM2, activo },
    ip,
  });

  return inmueble;
}

async function listarOcupantes(inmuebleId) {
  await obtenerPorId(inmuebleId);

  return prisma.ocupanteInmueble.findMany({
    where: { inmuebleId },
    select: CAMPOS_OCUPANTE,
    orderBy: { fechaInicio: "desc" },
  });
}

async function asignarOcupante(inmuebleId, { copropietarioId, esPropietario, fechaInicio }, { actorId, ip }) {
  await obtenerPorId(inmuebleId);

  const copropietario = await prisma.copropietario.findUnique({ where: { id: copropietarioId } });
  if (!copropietario) {
    throw Object.assign(new Error("Copropietario no encontrado"), { status: 404 });
  }

  const tipoEsPropietario = esPropietario ?? true;
  const fechaInicioNueva = fechaInicio ? new Date(fechaInicio) : new Date();
  const fechaCambio = new Date();

  const { nuevo, cerroOcupanteAnteriorId } = await prisma.$transaction(async (tx) => {
    // Solo puede haber un ocupante activo del mismo tipo (propietario o inquilino)
    // a la vez por inmueble; un propietario y un inquilino si pueden estar activos
    // al mismo tiempo (el dueño que alquila su unidad).
    const activoAnterior = await tx.ocupanteInmueble.findFirst({
      where: { inmuebleId, esPropietario: tipoEsPropietario, fechaFin: null },
    });

    if (activoAnterior) {
      if (fechaCambio < activoAnterior.fechaInicio) {
        throw Object.assign(
          new Error("La fecha de finalizacion no puede ser anterior a la fecha de inicio del ocupante anterior"),
          { status: 400 }
        );
      }
      await tx.ocupanteInmueble.update({
        where: { id: activoAnterior.id },
        data: { fechaFin: fechaCambio },
      });
    }

    const creado = await tx.ocupanteInmueble.create({
      data: {
        inmuebleId,
        copropietarioId,
        esPropietario: tipoEsPropietario,
        fechaInicio: fechaInicioNueva,
      },
      select: CAMPOS_OCUPANTE,
    });

    return { nuevo: creado, cerroOcupanteAnteriorId: activoAnterior?.id ?? null };
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "OcupanteInmueble",
    entidadId: nuevo.id,
    detalle: { inmuebleId, copropietarioId, esPropietario: tipoEsPropietario, cerroOcupanteAnteriorId },
    ip,
  });

  return nuevo;
}

async function darDeBajaOcupante(inmuebleId, ocupanteId, { actorId, ip }) {
  const ocupante = await prisma.ocupanteInmueble.findUnique({ where: { id: ocupanteId } });
  if (!ocupante || ocupante.inmuebleId !== inmuebleId) {
    throw Object.assign(new Error("Ocupante no encontrado para este inmueble"), { status: 404 });
  }
  if (ocupante.fechaFin) {
    throw Object.assign(new Error("El ocupante ya fue dado de baja"), { status: 409 });
  }

  const fechaFin = new Date();
  if (fechaFin < ocupante.fechaInicio) {
    throw Object.assign(
      new Error("La fecha de finalizacion no puede ser anterior a la fecha de inicio"),
      { status: 400 }
    );
  }

  const actualizado = await prisma.ocupanteInmueble.update({
    where: { id: ocupanteId },
    data: { fechaFin },
    select: CAMPOS_OCUPANTE,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "OcupanteInmueble",
    entidadId: actualizado.id,
    detalle: { fechaFin: actualizado.fechaFin },
    ip,
  });

  return actualizado;
}

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  listarOcupantes,
  asignarOcupante,
  darDeBajaOcupante,
};
