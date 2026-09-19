const prisma = require("../../../config/prisma");

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  montoBase: true,
  createdAt: true,
  updatedAt: true,
};

async function listar() {
  return prisma.tipoInmueble.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: { nombre: "asc" },
  });
}

async function obtenerPorId(id) {
  const tipoInmueble = await prisma.tipoInmueble.findUnique({
    where: { id },
    select: CAMPOS_PUBLICOS,
  });
  if (!tipoInmueble) {
    throw Object.assign(new Error("Tipo de inmueble no encontrado"), { status: 404 });
  }
  return tipoInmueble;
}

module.exports = { listar, obtenerPorId };
