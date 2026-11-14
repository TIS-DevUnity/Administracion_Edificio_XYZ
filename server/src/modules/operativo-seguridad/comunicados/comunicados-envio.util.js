// Logica del envio de comunicados (HU10) sin base de datos: los enviadores se reciben por parametro,
// asi se prueba sin red ni correo.

const ESTADOS_ENVIO = ["ENVIADO", "FALLIDO", "OMITIDO"];
const MAX_CAUSA_FALLO = 500;
const MAX_MOTIVOS_EN_CAUSA = 3;

function nombreDe(residente) {
  return `${residente.nombre ?? ""} ${residente.apellido ?? ""}`.trim() || "Sin nombre";
}

/**
 * Envia el comunicado a cada residente por cada canal y devuelve una fila por residente y canal
 * ({ copropietarioId, nombre, canal, email, telefono, destinoReal, estado, motivo }).
 * Un residente sin ocupacion vigente se omite; un enviador que falla o lanza un error solo marca
 * esa fila como FALLIDO, el resto del envio sigue.
 *
 * `residentes`: [{ id, nombre, apellido, email, telefono, existe, vigente }].
 */
async function ejecutarEnvio({ residentes, canales, enviadores, comunicado }) {
  const filas = [];

  for (const canal of canales) {
    for (const residente of residentes) {
      const fila = {
        copropietarioId: residente.existe === false ? null : residente.id,
        nombre: nombreDe(residente),
        canal,
        email: null,
        telefono: null,
        destinoReal: null,
        estado: "OMITIDO",
        motivo: null,
      };

      if (!residente.vigente) {
        fila.motivo = "Sin ocupacion vigente en un inmueble activo";
        filas.push(fila);
        continue;
      }

      const enviador = enviadores?.[canal];
      if (!enviador) {
        fila.motivo = `El canal ${canal} no esta configurado`;
        filas.push(fila);
        continue;
      }

      try {
        const resultado = await enviador({ residente, comunicado });
        if (!resultado || !ESTADOS_ENVIO.includes(resultado.estado)) {
          fila.estado = "FALLIDO";
          fila.motivo = "El canal devolvio una respuesta invalida";
        } else {
          fila.estado = resultado.estado;
          fila.motivo = resultado.motivo ?? null;
          fila.destinoReal = resultado.destinoReal ?? null;
          if (resultado.contacto) {
            if (canal === "CORREO") fila.email = resultado.contacto;
            else fila.telefono = resultado.contacto;
          }
        }
      } catch (err) {
        fila.estado = "FALLIDO";
        fila.motivo = `No se pudo enviar: ${err.message}`;
      }
      filas.push(fila);
    }
  }

  return filas;
}

/**
 * Resumen del envio a partir de las filas por destinatario.
 *  - ENVIADO si llego a al menos un destinatario (aunque otros hayan fallado u omitido).
 *  - FALLIDO si no llego a ninguno (incluye canal no configurado), con la causa.
 * Los conteos son de filas (residente y canal); `totalDestinatarios` es de residentes.
 */
function resumirEnvio({ filas, totalDestinatarios }) {
  const enviados = filas.filter((f) => f.estado === "ENVIADO").length;
  const fallidos = filas.filter((f) => f.estado === "FALLIDO");
  const omitidos = filas.filter((f) => f.estado === "OMITIDO");
  const detalle = (f) => ({ nombre: f.nombre, canal: f.canal, motivo: f.motivo });

  const estado = enviados > 0 ? "ENVIADO" : "FALLIDO";
  let causaFallo = null;
  if (estado === "FALLIDO") {
    const motivos = [...new Set([...fallidos, ...omitidos].map((f) => f.motivo).filter(Boolean))];
    causaFallo = motivos.length
      ? `No se entrego a ningun destinatario: ${motivos.slice(0, MAX_MOTIVOS_EN_CAUSA).join("; ")}`
      : "No se entrego a ningun destinatario";
    causaFallo = causaFallo.slice(0, MAX_CAUSA_FALLO);
  }

  return {
    estado,
    causaFallo,
    totalDestinatarios,
    enviados,
    fallidos: fallidos.length,
    omitidos: omitidos.length,
    omitidosLista: omitidos.map(detalle),
    fallidosLista: fallidos.map(detalle),
  };
}

// Un envio que lleva mas de 15 minutos reservado (enviadoEn) y sigue en BORRADOR se da por interrumpido
// (el proceso se cayo o se reinicio a mitad del envio).
const MINUTOS_ENVIO_INTERRUMPIDO = 15;
const CAUSA_ENVIO_INTERRUMPIDO = "El envío se interrumpió; no hay registro de a quién llegó";

/** Fecha anterior a la cual un envio reservado se considera interrumpido, vista desde `ahora`. */
function limiteEnvioInterrumpido(ahora = new Date()) {
  return new Date(ahora.getTime() - MINUTOS_ENVIO_INTERRUMPIDO * 60 * 1000);
}

/**
 * true si el comunicado quedo a mitad de un envio: sigue en BORRADOR, tiene `enviadoEn` y esa reserva
 * es de hace mas de 15 minutos (exactamente 15 todavia no).
 */
function envioInterrumpido(comunicado, ahora = new Date()) {
  if (comunicado.estado !== "BORRADOR" || !comunicado.enviadoEn) return false;
  return new Date(comunicado.enviadoEn).getTime() < limiteEnvioInterrumpido(ahora).getTime();
}

module.exports = {
  ejecutarEnvio,
  resumirEnvio,
  MINUTOS_ENVIO_INTERRUMPIDO,
  CAUSA_ENVIO_INTERRUMPIDO,
  limiteEnvioInterrumpido,
  envioInterrumpido,
};
