// Pruebas de las reglas de validacion de comunicados. Se ejecutan con:
//   node --test server/src/modules/operativo-seguridad/comunicados/comunicados.test.js
// Son funciones puras: no tocan la base de datos.
const test = require("node:test");
const assert = require("node:assert/strict");
const { validarComunicado, estaEmitido, MAX_CUERPO_WHATSAPP } = require("./comunicados.util");

const valido = { titulo: "Corte de agua", cuerpo: "El sabado no habra agua.", canales: ["CORREO"] };

test("un comunicado completo es valido y se devuelve limpio", () => {
  const { errores, datos } = validarComunicado({
    titulo: "  Corte de agua  ",
    cuerpo: "  El sabado no habra agua.  ",
    canales: ["correo", "WHATSAPP", "CORREO"],
  });
  assert.deepEqual(errores, []);
  assert.deepEqual(datos, {
    titulo: "Corte de agua",
    cuerpo: "El sabado no habra agua.",
    canales: ["CORREO", "WHATSAPP"],
  });
});

test("reporta juntos todos los campos obligatorios que faltan", () => {
  const { errores } = validarComunicado({});
  assert.equal(errores.length, 1);
  assert.match(errores[0], /Faltan campos obligatorios: titulo, cuerpo, canales/);
});

test("un titulo o cuerpo con solo espacios cuenta como faltante", () => {
  const { errores } = validarComunicado({ ...valido, titulo: "   ", cuerpo: "" });
  assert.match(errores[0], /titulo, cuerpo/);
  assert.doesNotMatch(errores[0], /canales/);
});

test("exige al menos un canal", () => {
  const { errores } = validarComunicado({ ...valido, canales: [] });
  assert.match(errores[0], /canales \(al menos uno\)/);
});

test("rechaza canales que no existen", () => {
  const { errores } = validarComunicado({ ...valido, canales: ["CORREO", "SMS"] });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /Canales invalidos: SMS/);
});

test("rechaza canales que no son una lista de texto", () => {
  assert.match(validarComunicado({ ...valido, canales: "CORREO" }).errores[0], /canales/);
  assert.match(validarComunicado({ ...valido, canales: [1] }).errores[0], /canales/);
});

test("el mensaje de WhatsApp admite hasta 1024 caracteres", () => {
  const justo = "a".repeat(MAX_CUERPO_WHATSAPP);
  assert.deepEqual(validarComunicado({ ...valido, cuerpo: justo, canales: ["WHATSAPP"] }).errores, []);

  const pasado = "a".repeat(MAX_CUERPO_WHATSAPP + 1);
  const { errores } = validarComunicado({ ...valido, cuerpo: pasado, canales: ["WHATSAPP"] });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /WhatsApp no puede superar los 1024/);
});

test("el limite de WhatsApp no aplica si el canal es solo correo", () => {
  const largo = "a".repeat(MAX_CUERPO_WHATSAPP + 500);
  assert.deepEqual(validarComunicado({ ...valido, cuerpo: largo, canales: ["CORREO"] }).errores, []);
});

test("limita el largo del titulo", () => {
  const { errores } = validarComunicado({ ...valido, titulo: "a".repeat(151) });
  assert.match(errores[0], /titulo no puede superar los 150/);
});

test("solo los comunicados enviados o fallidos estan emitidos (bloqueados)", () => {
  assert.equal(estaEmitido({ estado: "BORRADOR" }), false);
  assert.equal(estaEmitido({ estado: "ENVIADO" }), true);
  assert.equal(estaEmitido({ estado: "FALLIDO" }), true);
});
