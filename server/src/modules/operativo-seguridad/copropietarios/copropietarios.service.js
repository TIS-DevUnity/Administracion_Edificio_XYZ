const { Prisma } = require("@prisma/client");
const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");
const { obtenerMapa, montoEfectivo } = require("../tarifas-inmueble/tarifas-inmueble.service");

const Decimal = Prisma.Decimal;

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
 *
 * Cada inmueble trae `cargoMensual`: lo que suma por mes (expensa fija del tipo en un
 * departamento; `cuotaMensual` propia o tarifa de la clase en baulera y parqueo; 0 si esta
 * inactivo). `resumen.cargoMensualTotal` suma los vigentes y es referencial: lo que realmente
 * se cobra lo decide la expensa (ver GET /api/financiero/copropietarios/{id}/cuenta).
 */
async function listarInmuebles(id) {
  const copropietario = await obtenerPorId(id);

  const [ocupaciones, tarifas] = await Promise.all([
    prisma.ocupanteInmueble.findMany({
      where: { copropietarioId: id },
      include: { inmueble: { include: { tipoInmueble: true } } },
      orderBy: [{ fechaInicio: "desc" }, { id: "asc" }],
    }),
    obtenerMapa(),
  ]);

  const ahora = new Date();
  const items = ocupaciones.map((o) => {
    const vigente = o.fechaInicio <= ahora && (o.fechaFin === null || o.fechaFin > ahora);
    const { inmueble } = o;

    let cargoMensual = new Decimal(0);
    if (inmueble.activo) {
      cargoMensual =
        inmueble.clase === "DEPARTAMENTO"
          ? new Decimal(inmueble.tipoInmueble?.montoBase ?? 0)
          : montoEfectivo(inmueble, tarifas);
    }

    return {
      ocupanteId: o.id,
      inmuebleId: inmueble.id,
      codigo: inmueble.codigo,
      clase: inmueble.clase,
      tipoInmueble: inmueble.tipoInmueble?.nombre ?? null,
      piso: inmueble.piso,
      areaM2: inmueble.areaM2,
      activo: inmueble.activo,
      cuotaMensual: inmueble.cuotaMensual === null ? null : new Decimal(inmueble.cuotaMensual).toFixed(2),
      cargoMensual: cargoMensual.toFixed(2),
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
    cargoMensualTotal: vigentes
      .reduce((acc, i) => acc.plus(i.cargoMensual), new Decimal(0))
      .toFixed(2),
  };

  return { copropietario, vigentes, anteriores, resumen };
}

module.exports = { listar, obtenerPorId, crear, actualizar, listarInmuebles };
