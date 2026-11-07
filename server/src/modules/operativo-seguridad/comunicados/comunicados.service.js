const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { ESTADOS_EMITIDOS, validarComunicado, estaEmitido } = require("./comunicados.util");

const ESTADOS_VALIDOS = ["BORRADOR", ...ESTADOS_EMITIDOS];

const CAMPOS_PUBLICOS = {
  id: true,
  titulo: true,
  cuerpo: true,
  canales: true,
  estado: true,
  causaFallo: true,
  totalDestinatarios: true,
  enviadoEn: true,
  creadoPorId: true,
  creadoPor: { select: { id: true, nombre: true, apellido: true } },
  createdAt: true,
  updatedAt: true,
};

function error(mensaje, status) {
  return Object.assign(new Error(mensaje), { status });
}

function esAdministrador(rol) {
  return rol === "ADMINISTRADOR";
}

function errorValidacion(errores) {
  return Object.assign(new Error(errores.join(". ")), { status: 400, errores });
}

/**
 * Historial de comunicados. El ADMINISTRADOR ve todo (incluidos los borradores); el resto de los
 * roles solo ve los ya emitidos (enviados o fallidos).
 */
async function listar({ estado, rol }) {
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    throw error(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}`, 400);
  }

  const visibles = esAdministrador(rol) ? ESTADOS_VALIDOS : ESTADOS_EMITIDOS;
  const filtroEstado = estado ? (visibles.includes(estado) ? [estado] : []) : visibles;

  return prisma.comunicado.findMany({
    where: { estado: { in: filtroEstado } },
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: "desc" },
  });
}

/** Un borrador solo existe para el ADMINISTRADOR: para los demas se responde 404. */
async function obtenerPorId(id, { rol }) {
  const comunicado = await prisma.comunicado.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  if (!comunicado || (!esAdministrador(rol) && !estaEmitido(comunicado))) {
    throw error("Comunicado no encontrado", 404);
  }
  return comunicado;
}

async function crear({ titulo, cuerpo, canales, actorId, ip }) {
  const { errores, datos } = validarComunicado({ titulo, cuerpo, canales });
  if (errores.length > 0) throw errorValidacion(errores);

  const comunicado = await prisma.comunicado.create({
    data: { ...datos, estado: "BORRADOR", creadoPorId: actorId },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Comunicado",
    entidadId: comunicado.id,
    detalle: { titulo: comunicado.titulo, canales: comunicado.canales },
    ip,
  });

  return comunicado;
}

async function actualizar(id, { titulo, cuerpo, canales, actorId, ip }) {
  const actual = await prisma.comunicado.findUnique({ where: { id } });
  if (!actual) throw error("Comunicado no encontrado", 404);
  if (estaEmitido(actual)) {
    throw error("Un comunicado ya enviado no se puede editar", 409);
  }

  if (titulo === undefined && cuerpo === undefined && canales === undefined) {
    throw error("Debe enviar al menos un campo a modificar: titulo, cuerpo o canales", 400);
  }

  // Se valida el comunicado resultante completo (lo nuevo sobre lo que ya tenia).
  const { errores, datos } = validarComunicado({
    titulo: titulo !== undefined ? titulo : actual.titulo,
    cuerpo: cuerpo !== undefined ? cuerpo : actual.cuerpo,
    canales: canales !== undefined ? canales : actual.canales,
  });
  if (errores.length > 0) throw errorValidacion(errores);

  const comunicado = await prisma.comunicado.update({
    where: { id },
    data: datos,
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Comunicado",
    entidadId: id,
    detalle: {
      antes: { titulo: actual.titulo, cuerpo: actual.cuerpo, canales: actual.canales },
      despues: { titulo: comunicado.titulo, cuerpo: comunicado.cuerpo, canales: comunicado.canales },
    },
    ip,
  });

  return comunicado;
}

async function eliminar(id, { actorId, ip }) {
  const actual = await prisma.comunicado.findUnique({ where: { id } });
  if (!actual) throw error("Comunicado no encontrado", 404);
  if (estaEmitido(actual)) {
    throw error("Un comunicado ya enviado no se puede eliminar", 409);
  }

  await prisma.comunicado.delete({ where: { id } });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "DELETE",
    entidad: "Comunicado",
    entidadId: id,
    detalle: { titulo: actual.titulo, canales: actual.canales },
    ip,
  });
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
