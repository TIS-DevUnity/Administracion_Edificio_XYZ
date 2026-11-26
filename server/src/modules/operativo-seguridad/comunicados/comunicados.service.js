const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const {
  ESTADOS_TODOS,
  validarComunicado,
  validarDestinatarios,
  estaEmitido,
  estadosVisiblesPara,
  MAX_CUERPO_WHATSAPP,
} = require("./comunicados.util");
const destinatariosService = require("./destinatarios.service");
const {
  ejecutarEnvio,
  resumirEnvio,
  limiteEnvioInterrumpido,
  CAUSA_ENVIO_INTERRUMPIDO,
  construirMensajeWhatsapp,
} = require("./comunicados-envio.util");
const { ENVIADORES_POR_DEFECTO } = require("./comunicados.canales");

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
 * Pasa a FALLIDO los comunicados que quedaron a mitad de un envio (BORRADOR con `enviadoEn` de hace mas
 * de 15 minutos) porque el proceso se cayo o se reinicio. No se reintentan: no hay registro de a quien
 * llego el mensaje. Nunca interrumpe a quien la llama; devuelve cuantos comunicados marco.
 */
async function marcarEnviosInterrumpidos({ ahora = new Date() } = {}) {
  try {
    const { count } = await prisma.comunicado.updateMany({
      where: { estado: "BORRADOR", enviadoEn: { lt: limiteEnvioInterrumpido(ahora) } },
      data: { estado: "FALLIDO", causaFallo: CAUSA_ENVIO_INTERRUMPIDO },
    });
    if (count > 0) console.warn(`[comunicados] ${count} envio(s) interrumpido(s) marcado(s) como FALLIDO`);
    return count;
  } catch (err) {
    console.error("[comunicados] No se pudo revisar los envios interrumpidos:", err.message);
    return 0;
  }
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

  await marcarEnviosInterrumpidos();

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

/**
 * Valida el borrador y resuelve a quienes se enviaria. Falla con 409 si ya se envio y con 400 si el
 * comunicado esta incompleto (campos, limite de WhatsApp o destinatarios sin elegir).
 */
async function prepararEnvio(id) {
  const comunicado = await prisma.comunicado.findUnique({ where: { id } });
  if (!comunicado) throw error("Comunicado no encontrado", 404);
  if (estaEmitido(comunicado)) {
    throw error("Un comunicado ya enviado no se puede volver a enviar. Para reenviar, cree un comunicado nuevo", 409);
  }

  const { errores } = validarComunicado(comunicado);
  if (errores.length > 0) throw errorValidacion(errores);
  if (!comunicado.destinatariosModo) {
    throw error("Debe elegir los destinatarios antes de enviar el comunicado", 400);
  }

  // Por WhatsApp el residente recibe titulo y mensaje juntos: el conjunto tambien debe caber en 1024.
  const largoWhatsapp = construirMensajeWhatsapp(comunicado).length;
  if (comunicado.canales.includes("WHATSAPP") && largoWhatsapp > MAX_CUERPO_WHATSAPP) {
    throw error(
      `Por WhatsApp se envian el titulo y el mensaje juntos y no pueden superar los ${MAX_CUERPO_WHATSAPP} caracteres (tienen ${largoWhatsapp})`,
      400
    );
  }

  const residentes = await destinatariosService.resolverResidentes({
    modo: comunicado.destinatariosModo,
    ids: comunicado.destinatarioIds,
  });
  return { comunicado, residentes };
}

/** Vista previa antes de enviar: lo que se va a enviar y a cuantos residentes. No envia nada. */
async function vistaPrevia(id) {
  const { comunicado, residentes } = await prepararEnvio(id);
  const sinOcupacionVigente = residentes.filter((r) => !r.vigente).length;
  return {
    comunicadoId: comunicado.id,
    titulo: comunicado.titulo,
    mensaje: comunicado.cuerpo,
    canales: comunicado.canales,
    destinatariosModo: comunicado.destinatariosModo,
    totalDestinatarios: residentes.length,
    sinOcupacionVigente,
    puedeEnviar: residentes.length - sinOcupacionVigente > 0,
  };
}

/**
 * Envia un comunicado en BORRADOR. Exige `confirmar: true` (despues de ver la vista previa), lo reserva
 * para que no salga dos veces (un segundo envio responde 409), envia por cada canal y deja el resultado
 * por residente. Queda ENVIADO si llego a alguien y FALLIDO (con la causa) si no llego a nadie.
 * No hay reintentos: para reenviar se crea un comunicado nuevo. `enviadores` se inyecta en las pruebas.
 */
async function enviar(id, { confirmar, actorId, ip, enviadores = ENVIADORES_POR_DEFECTO }) {
  if (confirmar !== true) {
    throw error("Debe confirmar el envio (confirmar: true) despues de revisar la vista previa", 400);
  }

  const { comunicado, residentes } = await prepararEnvio(id);
  if (residentes.every((r) => !r.vigente)) {
    throw error("Ningun destinatario tiene ocupacion vigente en un inmueble activo: no hay a quien enviar", 400);
  }

  // Reserva atomica: solo una peticion pasa de BORRADOR sin enviar a "enviando".
  const reserva = await prisma.comunicado.updateMany({
    where: { id, estado: "BORRADOR", enviadoEn: null },
    data: { enviadoEn: new Date() },
  });
  if (reserva.count === 0) throw error("El comunicado ya se envio o se esta enviando", 409);

  const filas = await ejecutarEnvio({ residentes, canales: comunicado.canales, enviadores, comunicado });
  const resumen = resumirEnvio({ filas, totalDestinatarios: residentes.length });

  let actualizado;
  try {
    [, actualizado] = await prisma.$transaction([
      prisma.comunicadoDestinatario.createMany({ data: filas.map((fila) => ({ ...fila, comunicadoId: id })) }),
      prisma.comunicado.update({
        where: { id },
        data: {
          estado: resumen.estado,
          causaFallo: resumen.causaFallo,
          totalDestinatarios: resumen.totalDestinatarios,
          totalEnviados: resumen.enviados,
          totalFallidos: resumen.fallidos,
          totalOmitidos: resumen.omitidos,
          enviadoEn: new Date(),
        },
        select: CAMPOS_PUBLICOS,
      }),
    ]);
  } catch (err) {
    // El envio ya salio pero no se pudo guardar el resultado: queda FALLIDO con la causa y no se reintenta.
    await prisma.comunicado
      .update({
        where: { id },
        data: { estado: "FALLIDO", causaFallo: `No se pudo registrar el resultado del envio: ${err.message}`.slice(0, 500) },
      })
      .catch(() => {});
    throw err;
  }

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "SEND",
    entidad: "Comunicado",
    entidadId: id,
    detalle: {
      titulo: actualizado.titulo,
      canales: actualizado.canales,
      estado: resumen.estado,
      causaFallo: resumen.causaFallo,
      totalDestinatarios: resumen.totalDestinatarios,
      enviados: resumen.enviados,
      fallidos: resumen.fallidos,
      omitidos: resumen.omitidos,
    },
    ip,
  });

  return { comunicado: actualizado, resumen };
}

/** Resultado del envio por residente y canal, con el resumen y la lista de omitidos. */
async function obtenerResultado(id, { rol }) {
  const comunicado = await obtenerPorId(id, { rol });
  const destinatarios = await prisma.comunicadoDestinatario.findMany({
    where: { comunicadoId: id },
    select: {
      copropietarioId: true,
      nombre: true,
      canal: true,
      email: true,
      telefono: true,
      destinoReal: true,
      estado: true,
      motivo: true,
    },
    orderBy: [{ canal: "asc" }, { nombre: "asc" }],
  });
  const resumen = resumirEnvio({ filas: destinatarios, totalDestinatarios: comunicado.totalDestinatarios ?? 0 });
  return { comunicado, resumen, destinatarios };
}

module.exports = {
  listar,
  marcarEnviosInterrumpidos,
  listarDestinatarios,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
  vistaPrevia,
  enviar,
  obtenerResultado,
};
