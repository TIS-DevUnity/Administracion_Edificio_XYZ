// Enviadores por canal de los comunicados (HU10). Cada uno recibe { residente, comunicado } y devuelve
//   { estado: "ENVIADO" | "FALLIDO" | "OMITIDO", motivo?, contacto?, destinoReal? }
// donde `contacto` es el correo o telefono que se uso (queda en el registro por destinatario) y `destinoReal`
// es donde se entrego de verdad si el envio se redirigio o se permitio por lista de pruebas.
// Cada enviador es quien valida el contacto del residente: sin contacto valido devuelve OMITIDO con el motivo.
// Mientras un canal no tenga su enviador real, se omite con el motivo "no configurado".

function canalNoConfigurado(canal) {
  return async () => ({ estado: "OMITIDO", motivo: `El canal ${canal} no esta configurado` });
}

const ENVIADORES_POR_DEFECTO = {
  CORREO: canalNoConfigurado("CORREO"),
  WHATSAPP: canalNoConfigurado("WHATSAPP"),
};

module.exports = { ENVIADORES_POR_DEFECTO };
