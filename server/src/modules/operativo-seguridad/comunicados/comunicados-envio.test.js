// Pruebas del envio de comunicados (BUG-003 y BUG-001). Se ejecutan con:
//   node --test server/src/modules/operativo-seguridad/comunicados/comunicados-envio.test.js
// Son funciones puras con enviadores falsos: no tocan la base de datos ni la red.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ejecutarEnvio,
  resumirEnvio,
  construirHtmlComunicado,
  construirMensajeWhatsapp,
  limiteEnvioInterrumpido,
  envioInterrumpido,
  MINUTOS_ENVIO_INTERRUMPIDO,
} = require("./comunicados-envio.util");
const { estaEmitido } = require("./comunicados.util");
const { ENVIADORES_POR_DEFECTO, crearEnviadorCorreo, crearEnviadorWhatsapp } = require("./comunicados.canales");
const { enviarWhatsApp } = require("../../../config/whatsapp");

const residente = (id, extra = {}) => ({
  id,
  nombre: `Nombre${id}`,
  apellido: `Apellido${id}`,
  email: `${id}@correo.com`,
  telefono: "70000000",
  existe: true,
  vigente: true,
  ...extra,
});

const siempreEnvia = async ({ residente }) => ({ estado: "ENVIADO", contacto: residente.email });
const comunicado = { id: "c1", titulo: "Aviso", cuerpo: "Texto", canales: ["CORREO"] };

test("una fila por residente y canal, con el contacto usado en el campo del canal", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a"), residente("b")],
    canales: ["CORREO", "WHATSAPP"],
    enviadores: {
      CORREO: siempreEnvia,
      WHATSAPP: async ({ residente }) => ({ estado: "ENVIADO", contacto: "+59170000000", destinoReal: "+59171111111" }),
    },
    comunicado,
  });
  assert.equal(filas.length, 4);
  const correo = filas.find((f) => f.canal === "CORREO" && f.copropietarioId === "a");
  assert.equal(correo.email, "a@correo.com");
  assert.equal(correo.telefono, null);
  const whatsapp = filas.find((f) => f.canal === "WHATSAPP" && f.copropietarioId === "a");
  assert.equal(whatsapp.telefono, "+59170000000");
  assert.equal(whatsapp.email, null);
  assert.equal(whatsapp.destinoReal, "+59171111111");
  assert.equal(correo.nombre, "Nombrea Apellidoa");
});

test("un residente sin ocupacion vigente se omite sin llamar al enviador", async () => {
  let llamadas = 0;
  const filas = await ejecutarEnvio({
    residentes: [residente("a", { vigente: false })],
    canales: ["CORREO"],
    enviadores: { CORREO: async () => (llamadas++, { estado: "ENVIADO" }) },
    comunicado,
  });
  assert.equal(llamadas, 0);
  assert.equal(filas[0].estado, "OMITIDO");
  assert.match(filas[0].motivo, /ocupacion vigente/);
});

test("un copropietario que ya no existe se guarda sin id (no rompe la clave foranea)", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("x", { existe: false, vigente: false })],
    canales: ["CORREO"],
    enviadores: { CORREO: siempreEnvia },
    comunicado,
  });
  assert.equal(filas[0].copropietarioId, null);
});

test("un enviador que lanza un error solo marca esa fila como FALLIDA y el envio sigue", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a"), residente("b")],
    canales: ["CORREO"],
    enviadores: {
      CORREO: async ({ residente }) => {
        if (residente.id === "a") throw new Error("SMTP caido");
        return { estado: "ENVIADO", contacto: residente.email };
      },
    },
    comunicado,
  });
  assert.equal(filas[0].estado, "FALLIDO");
  assert.match(filas[0].motivo, /SMTP caido/);
  assert.equal(filas[1].estado, "ENVIADO");
});

test("una respuesta invalida del canal cuenta como FALLIDA", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a")],
    canales: ["CORREO"],
    enviadores: { CORREO: async () => ({ estado: "QUIZAS" }) },
    comunicado,
  });
  assert.equal(filas[0].estado, "FALLIDO");
});

test("un canal sin enviador se omite con el motivo 'no configurado'", async () => {
  const filas = await ejecutarEnvio({ residentes: [residente("a")], canales: ["WHATSAPP"], enviadores: {}, comunicado });
  assert.equal(filas[0].estado, "OMITIDO");
  assert.match(filas[0].motivo, /WHATSAPP no esta configurado/);
});

test("fallo parcial: ENVIADO con el detalle de omitidos y fallidos", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a"), residente("b"), residente("c")],
    canales: ["CORREO"],
    enviadores: {
      CORREO: async ({ residente }) => {
        if (residente.id === "b") return { estado: "OMITIDO", motivo: "Sin correo valido" };
        if (residente.id === "c") return { estado: "FALLIDO", motivo: "Rechazado" };
        return { estado: "ENVIADO", contacto: residente.email };
      },
    },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 3 });
  assert.equal(r.estado, "ENVIADO");
  assert.equal(r.causaFallo, null);
  assert.deepEqual([r.enviados, r.fallidos, r.omitidos], [1, 1, 1]);
  assert.deepEqual(r.omitidosLista, [{ nombre: "Nombreb Apellidob", canal: "CORREO", motivo: "Sin correo valido" }]);
  assert.equal(r.fallidosLista[0].motivo, "Rechazado");
});

test("FALLIDO con la causa cuando no llega a ningun destinatario", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a"), residente("b")],
    canales: ["CORREO"],
    enviadores: { CORREO: async () => ({ estado: "FALLIDO", motivo: "Servidor caido" }) },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 2 });
  assert.equal(r.estado, "FALLIDO");
  assert.match(r.causaFallo, /Servidor caido/);
  assert.equal(r.enviados, 0);
});

test("FALLIDO si los canales no estan configurados (CORREO sin enviador y WHATSAPP por defecto)", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a")],
    canales: ["CORREO", "WHATSAPP"],
    // Sin el CORREO real: la prueba no debe depender de que haya SMTP en el entorno.
    enviadores: { WHATSAPP: ENVIADORES_POR_DEFECTO.WHATSAPP },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 1 });
  assert.equal(r.estado, "FALLIDO");
  assert.match(r.causaFallo, /no esta configurado/);
  assert.equal(r.omitidos, 2);
});

test("con dos canales, ENVIADO si llega por uno aunque el otro no este configurado", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a")],
    canales: ["CORREO", "WHATSAPP"],
    enviadores: { ...ENVIADORES_POR_DEFECTO, CORREO: siempreEnvia },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 1 });
  assert.equal(r.estado, "ENVIADO");
  assert.equal(r.omitidos, 1);
});

test("la causa de fallo es corta: repite sin duplicar y se limita a 500 caracteres", () => {
  const filas = Array.from({ length: 10 }, (_, i) => ({
    nombre: `N${i}`,
    canal: "CORREO",
    estado: "FALLIDO",
    motivo: "x".repeat(300) + i,
  }));
  assert.ok(resumirEnvio({ filas, totalDestinatarios: 10 }).causaFallo.length <= 500);
});

test("un comunicado que ya empezo a enviarse (enviadoEn) queda bloqueado aunque siga en BORRADOR", () => {
  assert.equal(estaEmitido({ estado: "BORRADOR", enviadoEn: new Date() }), true);
  assert.equal(estaEmitido({ estado: "BORRADOR", enviadoEn: null }), false);
});

test("un envio reservado hace mas de 15 minutos y aun en BORRADOR se considera interrumpido", () => {
  const ahora = new Date("2026-11-14T12:00:00.000Z");
  const hace = (minutos, extraMs = 0) => new Date(ahora.getTime() - minutos * 60 * 1000 - extraMs);

  assert.equal(MINUTOS_ENVIO_INTERRUMPIDO, 15);
  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: hace(15, 1) }, ahora), true);
  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: hace(60) }, ahora), true);
});

test("hasta los 15 minutos exactos el envio todavia se considera en curso", () => {
  const ahora = new Date("2026-11-14T12:00:00.000Z");
  const hace = (minutos) => new Date(ahora.getTime() - minutos * 60 * 1000);

  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: hace(15) }, ahora), false);
  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: hace(1) }, ahora), false);
  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: ahora }, ahora), false);
});

test("un borrador sin reserva o un comunicado ya emitido nunca es un envio interrumpido", () => {
  const ahora = new Date("2026-11-14T12:00:00.000Z");
  const antiguo = new Date("2020-01-01T00:00:00.000Z");

  assert.equal(envioInterrumpido({ estado: "BORRADOR", enviadoEn: null }, ahora), false);
  assert.equal(envioInterrumpido({ estado: "ENVIADO", enviadoEn: antiguo }, ahora), false);
  assert.equal(envioInterrumpido({ estado: "FALLIDO", enviadoEn: antiguo }, ahora), false);
});

test("el limite del barrido es 15 minutos antes de la fecha actual que se le pasa", () => {
  const ahora = new Date("2026-11-14T12:00:00.000Z");
  assert.equal(limiteEnvioInterrumpido(ahora).toISOString(), "2026-11-14T11:45:00.000Z");
});

test("BUG-001: el HTML del correo escapa el titulo y el mensaje y respeta los saltos de linea", () => {
  const html = construirHtmlComunicado({ titulo: "Corte <b>de agua</b>", cuerpo: 'Linea 1\nLinea "2" & <script>alert(1)</script>' });
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /<h2>Corte &lt;b&gt;de agua&lt;\/b&gt;<\/h2>/);
  assert.match(html, /Linea 1<br>Linea &quot;2&quot; &amp; &lt;script&gt;/);
});

test("BUG-001: el enviador de correo manda titulo, mensaje y correo del residente y traduce el resultado", async () => {
  let recibido;
  const enviador = crearEnviadorCorreo(async (datos) => {
    recibido = datos;
    return { estado: "ENVIADO", motivo: "redirigido", destinatario: "ana@correo.com", destinoReal: "pruebas@x.com" };
  });
  const r = await enviador({ residente: residente("a", { email: "ana@correo.com" }), comunicado: { titulo: "Aviso", cuerpo: "Texto" } });
  assert.equal(recibido.to, "ana@correo.com");
  assert.equal(recibido.subject, "Aviso");
  assert.equal(recibido.text, "Texto");
  assert.match(recibido.html, /<h2>Aviso<\/h2>/);
  assert.deepEqual(r, { estado: "ENVIADO", motivo: "redirigido", contacto: "ana@correo.com", destinoReal: "pruebas@x.com" });
});

test("BUG-001: un residente sin correo valido se omite y queda en la lista de omitidos con el contacto usado", async () => {
  const enviar = async ({ to }) =>
    to === "ana@correo.com"
      ? { estado: "ENVIADO", motivo: null, destinatario: to, destinoReal: null }
      : { estado: "OMITIDO", motivo: to ? `El correo "${to}" no es valido` : "El destinatario no tiene correo registrado", destinatario: to ?? null, destinoReal: null };
  const filas = await ejecutarEnvio({
    residentes: [residente("a", { email: "ana@correo.com" }), residente("b", { email: null }), residente("c", { email: "malo@x" })],
    canales: ["CORREO"],
    enviadores: { CORREO: crearEnviadorCorreo(enviar) },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 3 });
  assert.equal(r.estado, "ENVIADO");
  assert.deepEqual([r.enviados, r.omitidos], [1, 2]);
  assert.equal(filas[0].email, "ana@correo.com");
  assert.equal(filas[1].email, null);
  assert.equal(filas[2].email, "malo@x");
  assert.match(r.omitidosLista[0].motivo, /no tiene correo/);
  assert.match(r.omitidosLista[1].motivo, /no es valido/);
});

test("BUG-001: el destinoReal de un envio redirigido queda en la fila del destinatario", async () => {
  const enviar = async ({ to }) => ({ estado: "ENVIADO", motivo: null, destinatario: to, destinoReal: "pruebas@x.com" });
  const filas = await ejecutarEnvio({
    residentes: [residente("a", { email: "ana@correo.com" })],
    canales: ["CORREO"],
    enviadores: { CORREO: crearEnviadorCorreo(enviar) },
    comunicado,
  });
  assert.equal(filas[0].email, "ana@correo.com");
  assert.equal(filas[0].destinoReal, "pruebas@x.com");
});

test("BUG-002: el mensaje de WhatsApp lleva el titulo y debajo el mensaje", () => {
  assert.equal(construirMensajeWhatsapp({ titulo: "Corte de agua", cuerpo: "Sabado 8:00" }), "Corte de agua\n\nSabado 8:00");
});

test("BUG-002: el enviador de WhatsApp manda el telefono del residente y traduce el resultado", async () => {
  let recibido;
  const enviador = crearEnviadorWhatsapp(async (datos) => {
    recibido = datos;
    return { estado: "ENVIADO", motivo: null, destinatario: "+59170123456", destinoReal: "+59170123456" };
  });
  const r = await enviador({
    residente: residente("a", { telefono: "70123456" }),
    comunicado: { titulo: "Aviso", cuerpo: "Texto" },
  });
  assert.equal(recibido.to, "70123456");
  assert.equal(recibido.body, "Aviso\n\nTexto");
  assert.deepEqual(r, { estado: "ENVIADO", motivo: null, contacto: "+59170123456", destinoReal: "+59170123456" });
});

test("BUG-002: un residente sin telefono valido se omite y el resto sigue; el telefono usado queda en la fila", async () => {
  const enviar = async ({ to }) =>
    to === "70123456"
      ? { estado: "ENVIADO", motivo: null, destinatario: "+59170123456", destinoReal: null }
      : { estado: "OMITIDO", motivo: "No es un celular boliviano: un fijo no recibe WhatsApp", destinatario: null, destinoReal: null };
  const filas = await ejecutarEnvio({
    residentes: [residente("a", { telefono: "70123456" }), residente("b", { telefono: "22345678" }), residente("c", { telefono: null })],
    canales: ["WHATSAPP"],
    enviadores: { WHATSAPP: crearEnviadorWhatsapp(enviar) },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 3 });
  assert.equal(r.estado, "ENVIADO");
  assert.deepEqual([r.enviados, r.omitidos], [1, 2]);
  assert.equal(filas[0].telefono, "+59170123456");
  assert.equal(filas[0].email, null);
  assert.equal(filas[1].telefono, null);
});

test("BUG-002: con WhatsApp sin configurar el canal se omite y el comunicado queda FALLIDO con esa causa", async () => {
  const filas = await ejecutarEnvio({
    residentes: [residente("a", { telefono: "70123456" })],
    canales: ["WHATSAPP"],
    enviadores: { WHATSAPP: crearEnviadorWhatsapp((datos) => enviarWhatsApp(datos, { env: {} })) },
    comunicado,
  });
  const r = resumirEnvio({ filas, totalDestinatarios: 1 });
  assert.equal(r.estado, "FALLIDO");
  assert.match(r.causaFallo, /WhatsApp no configurado/);
});
