// Reglas de validacion de los comunicados (HU10). Son funciones puras: no tocan la base de datos.

const CANALES_VALIDOS = ["CORREO", "WHATSAPP"];
const MAX_TITULO = 150;
const MAX_CUERPO = 5000;
const MAX_CUERPO_WHATSAPP = 1024;

// Estados en los que el comunicado ya salio: no se pueden editar ni borrar, y los ven todos los roles.
const ESTADOS_EMITIDOS = ["ENVIADO", "FALLIDO"];

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

/** Un comunicado ya emitido (enviado o fallido) queda bloqueado: solo se puede consultar. */
function estaEmitido(comunicado) {
  return ESTADOS_EMITIDOS.includes(comunicado.estado);
}

module.exports = {
  CANALES_VALIDOS,
  ESTADOS_EMITIDOS,
  MAX_TITULO,
  MAX_CUERPO,
  MAX_CUERPO_WHATSAPP,
  validarComunicado,
  estaEmitido,
};
