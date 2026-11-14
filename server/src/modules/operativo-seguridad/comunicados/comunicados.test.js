// Pruebas de las reglas de validacion de comunicados. Se ejecutan con:
//   node --test server/src/modules/operativo-seguridad/comunicados/comunicados.test.js
// Son funciones puras: no tocan la base de datos.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validarComunicado,
  validarDestinatarios,
  estaEmitido,
  estadosVisiblesPara,
  MAX_CUERPO_WHATSAPP,
} = require("./comunicados.util");
const { PERMISOS } = require("../../../middlewares/permisos");

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

test("BUG-007: el ADMINISTRADOR ve todos los estados y el DIRECTORIO solo los emitidos", () => {
  assert.deepEqual(estadosVisiblesPara("ADMINISTRADOR"), ["BORRADOR", "ENVIADO", "FALLIDO"]);
  assert.deepEqual(estadosVisiblesPara("DIRECTORIO"), ["ENVIADO", "FALLIDO"]);
});

test("BUG-007: CONSULTA (y cualquier rol desconocido) no ve ningun estado", () => {
  assert.deepEqual(estadosVisiblesPara("CONSULTA"), []);
  assert.deepEqual(estadosVisiblesPara(undefined), []);
});

test("BUG-007: el permiso de ver comunicados excluye a CONSULTA y gestionar es solo del ADMINISTRADOR", () => {
  assert.deepEqual(PERMISOS.comunicados.ver, ["ADMINISTRADOR", "DIRECTORIO"]);
  assert.deepEqual(PERMISOS.comunicados.gestionar, ["ADMINISTRADOR"]);
});

test("BUG-005: modo TODOS no lleva ids", () => {
  const { errores, datos } = validarDestinatarios({ modo: "todos", copropietarioIds: ["a", "b"] });
  assert.deepEqual(errores, []);
  assert.deepEqual(datos, { modo: "TODOS", ids: [] });
});

test("BUG-005: SELECCIONADOS acepta uno o varios ids y quita repetidos", () => {
  assert.deepEqual(validarDestinatarios({ modo: "SELECCIONADOS", copropietarioIds: ["a"] }).datos.ids, ["a"]);
  const { errores, datos } = validarDestinatarios({ modo: "SELECCIONADOS", copropietarioIds: [" a ", "b", "a"] });
  assert.deepEqual(errores, []);
  assert.deepEqual(datos, { modo: "SELECCIONADOS", ids: ["a", "b"] });
});

test("BUG-005: SELECCIONADOS exige al menos un destinatario", () => {
  for (const copropietarioIds of [undefined, [], "a"]) {
    const { errores } = validarDestinatarios({ modo: "SELECCIONADOS", copropietarioIds });
    assert.match(errores[0], /al menos un destinatario/);
  }
});

test("BUG-005: los destinatarios son ids de residentes, no correos ni telefonos a mano", () => {
  assert.match(validarDestinatarios({ modo: "SELECCIONADOS", copropietarioIds: [1] }).errores[0], /copropietarioIds/);
  assert.match(validarDestinatarios({ modo: "SELECCIONADOS", copropietarioIds: [""] }).errores[0], /copropietarioIds/);
});

test("BUG-005: un modo ausente o desconocido se rechaza", () => {
  assert.match(validarDestinatarios({ modo: "ALGUNOS" }).errores[0], /TODOS o SELECCIONADOS/);
  assert.match(validarDestinatarios({}).errores[0], /TODOS o SELECCIONADOS/);
  assert.match(validarDestinatarios(null).errores[0], /modo/);
  assert.match(validarDestinatarios(["a"]).errores[0], /modo/);
});
