const prisma = require("../../../config/prisma");
const { filtroOcupanteVigente } = require("../inmuebles/asignacion.util");

function error(mensaje, status) {
  return Object.assign(new Error(mensaje), { status });
}

/**
 * Residentes que pueden recibir un comunicado: copropietarios (propietarios e inquilinos) con una
 * ocupacion vigente en un inmueble activo. Un residente con varios inmuebles aparece una sola vez.
 */
function filtroResidente(fecha = new Date()) {
  return { ocupaciones: { some: { ...filtroOcupanteVigente(fecha), inmueble: { activo: true } } } };
}

/** Lista para elegir destinatarios, con los inmuebles en los que cada residente tiene ocupacion vigente. */
async function listarResidentes(fecha = new Date()) {
  const residentes = await prisma.copropietario.findMany({
    where: filtroResidente(fecha),
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      ocupaciones: {
        where: { ...filtroOcupanteVigente(fecha), inmueble: { activo: true } },
        select: { esPropietario: true, inmueble: { select: { codigo: true } } },
      },
    },
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
  });

  return residentes.map(({ ocupaciones, ...residente }) => ({
    ...residente,
    inmuebles: ocupaciones.map((o) => ({ codigo: o.inmueble.codigo, esPropietario: o.esPropietario })),
  }));
}

/** Ids de todos los residentes elegibles (lo que significa "todos"). */
async function idsDeTodosLosResidentes(fecha = new Date()) {
  const residentes = await prisma.copropietario.findMany({ where: filtroResidente(fecha), select: { id: true } });
  return residentes.map((r) => r.id);
}

/**
 * Residentes a los que se envia un comunicado, con el contacto de cada uno.
 *  - TODOS: los residentes elegibles de este momento.
 *  - SELECCIONADOS: los ids elegidos en el borrador, en ese orden. Uno que ya no tiene ocupacion vigente
 *    queda con `vigente: false` (se omite al enviar); uno que ya no existe, con `existe: false`.
 */
async function resolverResidentes({ modo, ids = [] }, fecha = new Date()) {
  const select = { id: true, nombre: true, apellido: true, email: true, telefono: true };

  if (modo === "TODOS") {
    const residentes = await prisma.copropietario.findMany({
      where: filtroResidente(fecha),
      select,
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    });
    return residentes.map((r) => ({ ...r, existe: true, vigente: true }));
  }

  const [encontrados, vigentes] = await Promise.all([
    prisma.copropietario.findMany({ where: { id: { in: ids } }, select }),
    prisma.copropietario.findMany({ where: { id: { in: ids }, ...filtroResidente(fecha) }, select: { id: true } }),
  ]);
  const porId = new Map(encontrados.map((r) => [r.id, r]));
  const idsVigentes = new Set(vigentes.map((r) => r.id));

  return ids.map((id) => {
    const residente = porId.get(id);
    if (!residente) {
      return { id, nombre: "Copropietario no encontrado", apellido: "", email: null, telefono: null, existe: false, vigente: false };
    }
    return { ...residente, existe: true, vigente: idsVigentes.has(id) };
  });
}

/** Falla con 400 si algun id no es un residente elegible (no existe o no tiene ocupacion vigente). */
async function exigirResidentesValidos(ids, fecha = new Date()) {
  if (ids.length === 0) return;
  const validos = await prisma.copropietario.findMany({
    where: { id: { in: ids }, ...filtroResidente(fecha) },
    select: { id: true },
  });
  const setValidos = new Set(validos.map((r) => r.id));
  const invalidos = ids.filter((id) => !setValidos.has(id));
  if (invalidos.length > 0) {
    throw error(
      `Destinatarios invalidos (no existen o no tienen ocupacion vigente en un inmueble activo): ${invalidos.join(", ")}`,
      400
    );
  }
}

module.exports = { listarResidentes, idsDeTodosLosResidentes, resolverResidentes, exigirResidentesValidos };
