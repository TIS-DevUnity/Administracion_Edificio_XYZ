// Enviadores por canal de los comunicados (HU10). Cada uno recibe { residente, comunicado } y devuelve
//   { estado: "ENVIADO" | "FALLIDO" | "OMITIDO", motivo?, contacto?, destinoReal? }
// donde `contacto` es el correo o telefono que se uso (queda en el registro por destinatario) y `destinoReal`
// es donde se entrego de verdad si el envio se redirigio o se permitio por lista de pruebas.
// Cada enviador es quien valida el contacto del residente: sin contacto valido devuelve OMITIDO con el motivo.
// Mientras un canal no tenga su enviador real, se omite con el motivo "no configurado".
const { enviarMensaje } = require("../../../config/mailer");
const { construirHtmlComunicado } = require("./comunicados-envio.util");

function canalNoConfigurado(canal) {
  return async () => ({ estado: "OMITIDO", motivo: `El canal ${canal} no esta configurado` });
}

/**
 * Canal CORREO: usa el envio de bajo nivel de mailer.js, que valida el correo, aplica la redireccion de
 * seguridad fuera de produccion (y la lista CORREOS_DE_PRUEBA_PERMITIDOS) y devuelve el resultado.
 * `enviar` se inyecta en las pruebas.
 */
function crearEnviadorCorreo(enviar = enviarMensaje) {
  return async ({ residente, comunicado }) => {
    const resultado = await enviar({
      to: residente.email,
      subject: comunicado.titulo,
      html: construirHtmlComunicado(comunicado),
      text: comunicado.cuerpo,
    });
    return {
      estado: resultado.estado,
      motivo: resultado.motivo,
      contacto: resultado.destinatario,
      destinoReal: resultado.destinoReal,
    };
  };
}

const ENVIADORES_POR_DEFECTO = {
  CORREO: crearEnviadorCorreo(),
  WHATSAPP: canalNoConfigurado("WHATSAPP"),
};

module.exports = { ENVIADORES_POR_DEFECTO, crearEnviadorCorreo };
