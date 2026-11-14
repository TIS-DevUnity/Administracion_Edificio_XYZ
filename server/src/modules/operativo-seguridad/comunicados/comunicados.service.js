const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const {
  ESTADOS_TODOS,
  validarComunicado,
  validarDestinatarios,
  estaEmitido,
  estadosVisiblesPara,
} = require("./comunicados.util");
const destinatariosService = require("./destinatarios.service");

const ESTADOS_VALIDOS = ESTADOS_TODOS;

const CAMPOS_PUBLICOS = {
  id: true,
  titulo: true,
  cuerpo: true,
  canales: true,
  estado: true,
  destinatariosModo: true,
  destinatarioIds: true,
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

function errorValidacion(errores) {
  return Object.assign(new Error(errores.join(". ")), { status: 400, errores });
}

/**
 * Historial de comunicados. El ADMINISTRADOR ve todo (incluidos los borradores), el DIRECTORIO solo
 * los ya emitidos (enviados o fallidos) y CONSULTA ninguno. La ruta ya frena a CONSULTA; el servicio
 * lo vuelve a filtrar por si se llama desde otro lugar.
 */
async function listar({ estado, rol }) {
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    throw error(`estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}`, 400);
  }

  const visibles = estadosVisiblesPara(rol);
  const filtroEstado = estado ? (visibles.includes(estado) ? [estado] : []) : visibles;

  return prisma.comunicado.findMany({
    where: { estado: { in: filtroEstado } },
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: "desc" },
  });
}

/** Un borrador solo existe para el ADMINISTRADOR y CONSULTA no ve ninguno: en esos casos se responde 404. */
async function obtenerPorId(id, { rol }) {
  const comunicado = await prisma.comunicado.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  if (!comunicado || !estadosVisiblesPara(rol).includes(comunicado.estado)) {
    throw error("Comunicado no encontrado", 404);
  }
  return comunicado;
}

/** Residentes entre los que se puede elegir al redactar un comunicado (solo ADMINISTRADOR). */
function listarDestinatarios() {
  return destinatariosService.listarResidentes();
}

/**
 * Valida los destinatarios recibidos y devuelve los campos a guardar. Con `destinatarios`
 * undefined no hay nada que cambiar y devuelve {}.
 */
async function prepararDestinatarios(destinatarios) {
  if (destinatarios === undefined) return {};
  const { errores, datos } = validarDestinatarios(destinatarios);
  if (errores.length > 0) throw errorValidacion(errores);
  await destinatariosService.exigirResidentesValidos(datos.ids);
  return { destinatariosModo: datos.modo, destinatarioIds: datos.ids };
}

function resumenDestinatarios(comunicado) {
  return { modo: comunicado.destinatariosModo, cantidad: comunicado.destinatarioIds?.length ?? 0 };
}

async function crear({ titulo, cuerpo, canales, destinatarios, actorId, ip }) {
  const { errores, datos } = validarComunicado({ titulo, cuerpo, canales });
  if (errores.length > 0) throw errorValidacion(errores);
  const datosDestinatarios = await prepararDestinatarios(destinatarios);

  const comunicado = await prisma.comunicado.create({
    data: { ...datos, ...datosDestinatarios, estado: "BORRADOR", creadoPorId: actorId },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Comunicado",
    entidadId: comunicado.id,
    detalle: {
      titulo: comunicado.titulo,
      canales: comunicado.canales,
      destinatarios: resumenDestinatarios(comunicado),
    },
    ip,
  });

  return comunicado;
}

async function actualizar(id, { titulo, cuerpo, canales, destinatarios, actorId, ip }) {
  const actual = await prisma.comunicado.findUnique({ where: { id } });
  if (!actual) throw error("Comunicado no encontrado", 404);
  if (estaEmitido(actual)) {
    throw error("Un comunicado ya enviado no se puede editar", 409);
  }

  if (titulo === undefined && cuerpo === undefined && canales === undefined && destinatarios === undefined) {
    throw error("Debe enviar al menos un campo a modificar: titulo, cuerpo, canales o destinatarios", 400);
  }

  // Se valida el comunicado resultante completo (lo nuevo sobre lo que ya tenia).
  const { errores, datos } = validarComunicado({
    titulo: titulo !== undefined ? titulo : actual.titulo,
    cuerpo: cuerpo !== undefined ? cuerpo : actual.cuerpo,
    canales: canales !== undefined ? canales : actual.canales,
  });
  if (errores.length > 0) throw errorValidacion(errores);
  const datosDestinatarios = await prepararDestinatarios(destinatarios);

  const comunicado = await prisma.comunicado.update({
    where: { id },
    data: { ...datos, ...datosDestinatarios },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Comunicado",
    entidadId: id,
    detalle: {
      antes: {
        titulo: actual.titulo,
        cuerpo: actual.cuerpo,
        canales: actual.canales,
        destinatarios: resumenDestinatarios(actual),
      },
      despues: {
        titulo: comunicado.titulo,
        cuerpo: comunicado.cuerpo,
        canales: comunicado.canales,
        destinatarios: resumenDestinatarios(comunicado),
      },
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

module.exports = { listar, listarDestinatarios, obtenerPorId, crear, actualizar, eliminar };
