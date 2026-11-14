// Reglas de validacion de los comunicados (HU10). Son funciones puras: no tocan la base de datos.

const CANALES_VALIDOS = ["CORREO", "WHATSAPP"];
const MAX_TITULO = 150;
const MAX_CUERPO = 5000;
const MAX_CUERPO_WHATSAPP = 1024;
const MODOS_DESTINATARIOS = ["TODOS", "SELECCIONADOS"];

// Estados en los que el comunicado ya salio: no se pueden editar ni borrar.
const ESTADOS_EMITIDOS = ["ENVIADO", "FALLIDO"];
const ESTADOS_TODOS = ["BORRADOR", ...ESTADOS_EMITIDOS];

function textoONull(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

/** Devuelve los canales en mayusculas y sin repetir, o null si no es una lista valida de texto. */
function normalizarCanales(canales) {
  if (!Array.isArray(canales)) return null;
  if (canales.some((canal) => typeof canal !== "string")) return null;
  return [...new Set(canales.map((canal) => canal.trim().toUpperCase()))];
}

/**
 * Valida un comunicado completo ({ titulo, cuerpo, canales }).
 * Devuelve { errores, datos }: si `errores` esta vacio, `datos` trae los valores ya limpios.
 * Los campos faltantes se reportan juntos en un solo mensaje, como pide la HU10.
 */
function validarComunicado({ titulo, cuerpo, canales } = {}) {
  const errores = [];

  const tituloLimpio = textoONull(titulo);
  const cuerpoLimpio = textoONull(cuerpo);
  const canalesLimpios = normalizarCanales(canales);

  const faltantes = [];
  if (!tituloLimpio) faltantes.push("titulo");
  if (!cuerpoLimpio) faltantes.push("cuerpo");
  if (!canalesLimpios || canalesLimpios.length === 0) faltantes.push("canales (al menos uno)");
  if (faltantes.length > 0) {
    errores.push(`Faltan campos obligatorios: ${faltantes.join(", ")}`);
  }

  if (canalesLimpios && canalesLimpios.length > 0) {
    const invalidos = canalesLimpios.filter((canal) => !CANALES_VALIDOS.includes(canal));
    if (invalidos.length > 0) {
      errores.push(`Canales invalidos: ${invalidos.join(", ")}. Valores permitidos: ${CANALES_VALIDOS.join(", ")}`);
    }
  }

  if (tituloLimpio && tituloLimpio.length > MAX_TITULO) {
    errores.push(`El titulo no puede superar los ${MAX_TITULO} caracteres`);
  }
  if (cuerpoLimpio && cuerpoLimpio.length > MAX_CUERPO) {
    errores.push(`El cuerpo no puede superar los ${MAX_CUERPO} caracteres`);
  }
  if (cuerpoLimpio && canalesLimpios?.includes("WHATSAPP") && cuerpoLimpio.length > MAX_CUERPO_WHATSAPP) {
    errores.push(
      `El mensaje de WhatsApp no puede superar los ${MAX_CUERPO_WHATSAPP} caracteres (tiene ${cuerpoLimpio.length})`
    );
  }

  return {
    errores,
    datos: { titulo: tituloLimpio, cuerpo: cuerpoLimpio, canales: canalesLimpios },
  };
}

/**
 * Valida la eleccion de destinatarios ({ modo, copropietarioIds }), que son residentes (copropietarios):
 * nunca correos ni telefonos escritos a mano.
 *  - TODOS: no lleva ids (se resuelven al enviar, con los residentes vigentes de ese momento).
 *  - SELECCIONADOS: uno o varios ids de copropietario, sin repetir.
 * Devuelve { errores, datos: { modo, ids } }. Que los ids existan y esten vigentes lo comprueba el servicio.
 */
function validarDestinatarios(destinatarios) {
  const errores = [];
  const vacio = { modo: null, ids: [] };

  if (!destinatarios || typeof destinatarios !== "object" || Array.isArray(destinatarios)) {
    return { errores: [`destinatarios debe indicar el modo (${MODOS_DESTINATARIOS.join(" o ")})`], datos: vacio };
  }

  const modo = typeof destinatarios.modo === "string" ? destinatarios.modo.trim().toUpperCase() : null;
  if (!MODOS_DESTINATARIOS.includes(modo)) {
    return { errores: [`El modo de destinatarios debe ser ${MODOS_DESTINATARIOS.join(" o ")}`], datos: vacio };
  }

  if (modo === "TODOS") return { errores, datos: { modo, ids: [] } };

  const { copropietarioIds } = destinatarios;
  if (!Array.isArray(copropietarioIds) || copropietarioIds.length === 0) {
    errores.push("Debe elegir al menos un destinatario (copropietarioIds)");
    return { errores, datos: { modo, ids: [] } };
  }
  if (copropietarioIds.some((id) => typeof id !== "string" || id.trim() === "")) {
    errores.push("copropietarioIds debe ser una lista de ids de copropietario");
    return { errores, datos: { modo, ids: [] } };
  }

  return { errores, datos: { modo, ids: [...new Set(copropietarioIds.map((id) => id.trim()))] } };
}

/** Un comunicado ya emitido (enviado o fallido) queda bloqueado: solo se puede consultar. */
function estaEmitido(comunicado) {
  return ESTADOS_EMITIDOS.includes(comunicado.estado);
}

/**
 * Estados de comunicado que un rol puede ver: el ADMINISTRADOR ve todo (incluidos los borradores),
 * el DIRECTORIO solo los emitidos y cualquier otro rol (CONSULTA) nada (BUG-007).
 */
function estadosVisiblesPara(rol) {
  if (rol === "ADMINISTRADOR") return ESTADOS_TODOS;
  if (rol === "DIRECTORIO") return ESTADOS_EMITIDOS;
  return [];
}

module.exports = {
  CANALES_VALIDOS,
  ESTADOS_EMITIDOS,
  ESTADOS_TODOS,
  MODOS_DESTINATARIOS,
  estadosVisiblesPara,
  validarDestinatarios,
  MAX_TITULO,
  MAX_CUERPO,
  MAX_CUERPO_WHATSAPP,
  validarComunicado,
  estaEmitido,
};
