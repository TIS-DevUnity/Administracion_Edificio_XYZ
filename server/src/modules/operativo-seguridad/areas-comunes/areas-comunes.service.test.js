// Pruebas del servicio de areas comunes con una base en memoria (sin base de datos real). Se ejecutan con:
//   node --test server/src/modules/operativo-seguridad/areas-comunes/areas-comunes.service.test.js
// El prisma falso imita la restriccion unica reserva_area_unica: dos reservas con vigente = true en el mismo
// area, fecha y horaInicio lanzan P2002; las canceladas (vigente = null) no chocan.
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

let seq = 0;
const estado = { areas: [], horarios: [], bloqueos: [], reservas: [], auditorias: [], alDia: null, forzarP2002: false, consultasAlDia: 0 };

const iso = (f) => new Date(f).toISOString().slice(0, 10);
const AL_DIA = { alDia: true, deudaVencida: "0.00", detalle: [] };
const DEBE = {
  alDia: false,
  deudaVencida: "300.00",
  detalle: [{ concepto: "Expensa", periodo: "2026-10", monto: "300.00", vencimiento: "2026-10-10" }],
};

function reiniciar() {
  estado.areas = [{ id: "a1", nombre: "Salon", descripcion: null, condiciones: null, activa: true }];
  estado.horarios = [
    { id: "h1", areaId: "a1", diaSemana: 6, horaInicio: "08:00", horaFin: "13:00", activo: true },
    { id: "h2", areaId: "a1", diaSemana: 6, horaInicio: "14:00", horaFin: "19:00", activo: true },
    { id: "h3", areaId: "a1", diaSemana: 0, horaInicio: "08:00", horaFin: "13:00", activo: true },
  ];
  estado.bloqueos = [];
  estado.reservas = [];
  estado.auditorias = [];
  estado.alDia = AL_DIA;
  estado.forzarP2002 = false;
  estado.consultasAlDia = 0;
}

const coincide = (fila, where = {}) =>
  Object.entries(where).every(([campo, valor]) => {
    if (valor === undefined) return true;
    if (valor instanceof Date) return iso(fila[campo]) === iso(valor);
    if (valor && typeof valor === "object" && "not" in valor) return fila[campo] !== valor.not;
    if (valor && typeof valor === "object" && ("gte" in valor || "lte" in valor)) {
      const dia = iso(fila[campo]);
      return (!valor.gte || dia >= iso(valor.gte)) && (!valor.lte || dia <= iso(valor.lte));
    }
    return fila[campo] === valor;
  });

const conRelaciones = (r) => ({
  ...r,
  area: { id: r.areaId, nombre: estado.areas.find((a) => a.id === r.areaId)?.nombre },
  copropietario: { id: r.copropietarioId, nombre: "Ana", apellido: "Rojas" },
});

const db = {
  areaComun: { findUnique: async ({ where }) => estado.areas.find((a) => a.id === where.id) ?? null },
  horarioAreaComun: { findMany: async ({ where }) => estado.horarios.filter((h) => coincide(h, where)) },
  bloqueoAreaComun: {
    findMany: async ({ where }) => estado.bloqueos.filter((b) => coincide(b, where)),
    create: async ({ data }) => {
      const fila = { id: `b${++seq}`, ...data };
      estado.bloqueos.push(fila);
      return fila;
    },
  },
  reservaAreaComun: {
    findMany: async ({ where }) => estado.reservas.filter((r) => coincide(r, where)).map(conRelaciones),
    findFirst: async ({ where }) => estado.reservas.find((r) => coincide(r, where)) ?? null,
    findUnique: async ({ where }) => {
      const r = estado.reservas.find((x) => x.id === where.id);
      return r ? conRelaciones(r) : null;
    },
    create: async ({ data }) => {
      const choca = estado.reservas.some(
        (r) => r.vigente === true && r.areaId === data.areaId && iso(r.fecha) === iso(data.fecha) && r.horaInicio === data.horaInicio
      );
      if (estado.forzarP2002 || choca) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: "reserva_area_unica" } });
      const fila = { id: `r${++seq}`, estado: "RESERVADA", vigente: true, canceladaEn: null, motivoCancelacion: null, createdAt: new Date(), ...data };
      estado.reservas.push(fila);
      return conRelaciones(fila);
    },
    updateMany: async ({ where, data }) => {
      const filas = estado.reservas.filter((r) => coincide(r, where));
      filas.forEach((r) => Object.assign(r, data));
      return { count: filas.length };
    },
  },
};

const dobles = {
  "../../../config/prisma": db,
  "../auditoria/auditoria.service": { registrarAuditoria: async (a) => void estado.auditorias.push(a) },
  "../../financiero/cuenta-residente/estado-pagos.service": {
    estaAlDia: async () => {
      estado.consultasAlDia += 1;
      return estado.alDia;
    },
  },
};
const cargarOriginal = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, "/").endsWith("/areas-comunes/areas-comunes.service.js") && request in dobles) {
    return dobles[request];
  }
  return cargarOriginal.call(this, request, parent, isMain);
};

const service = require("./areas-comunes.service");

// Sabado 2026-11-14, 10:30 en Bolivia.
const AHORA = new Date("2026-11-14T14:30:00Z");
const TURNO = { areaId: "a1", fecha: "2026-11-15", horaInicio: "08:00", horaFin: "13:00" }; // domingo
const reservarComo = (copropietarioId, extra = {}) => service.reservar({ ...TURNO, copropietarioId, actorId: `u-${copropietarioId}`, ip: "1.1.1.1", ahora: AHORA, ...extra });
const fallo = async (promesa) => {
  try {
    await promesa;
  } catch (err) {
    return err;
  }
  assert.fail("debia fallar");
};
const vigentes = () => estado.reservas.filter((r) => r.estado === "RESERVADA" && r.vigente === true);

test("reservar OK: crea la reserva vigente y la audita", async () => {
  reiniciar();
  const reserva = await reservarComo("c1");
  assert.equal(reserva.estado, "RESERVADA");
  assert.equal(reserva.fecha, "2026-11-15");
  assert.equal(reserva.area.nombre, "Salon");
  assert.equal(vigentes().length, 1);
  assert.equal(estado.reservas[0].vigente, true);
  assert.equal(estado.auditorias.length, 1);
  assert.equal(estado.auditorias[0].entidad, "ReservaAreaComun");
  assert.equal(estado.auditorias[0].accion, "CREATE");
  assert.equal(estado.auditorias[0].usuarioId, "u-c1");
});

test("reservar con deuda vencida: 409 NO_AL_DIA con deudaVencida y detalle, y no crea nada", async () => {
  reiniciar();
  estado.alDia = DEBE;
  const err = await fallo(reservarComo("c1"));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "NO_AL_DIA");
  assert.equal(err.datos.deudaVencida, "300.00");
  assert.equal(err.datos.detalle.length, 1);
  assert.equal(estado.reservas.length, 0);
  assert.equal(estado.auditorias.length, 0);
});

test("turno ocupado: 409 TURNO_NO_DISPONIBLE (RESERVADO)", async () => {
  reiniciar();
  await reservarComo("c1");
  const err = await fallo(reservarComo("c2"));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "TURNO_NO_DISPONIBLE");
  assert.equal(err.detalle.motivo, "RESERVADO");
  assert.equal(vigentes().length, 1);
});

test("P2002 al crear (carrera entre dos peticiones): 409 TURNO_NO_DISPONIBLE", async () => {
  reiniciar();
  estado.forzarP2002 = true;
  const err = await fallo(reservarComo("c1"));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "TURNO_NO_DISPONIBLE");
  assert.equal(estado.auditorias.length, 0);
});

test("dos peticiones simultaneas: solo una reserva vigente", async () => {
  reiniciar();
  const resultados = await Promise.allSettled([reservarComo("c1"), reservarComo("c2")]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  const rechazada = resultados.find((r) => r.status === "rejected");
  assert.equal(rechazada.reason.codigo, "TURNO_NO_DISPONIBLE");
  assert.equal(vigentes().length, 1);
});

test("area bloqueada (todo el dia o franja que cruza el turno): 409 TURNO_NO_DISPONIBLE (BLOQUEADO)", async () => {
  for (const bloqueo of [{ horaInicio: null, horaFin: null }, { horaInicio: "12:00", horaFin: "15:00" }]) {
    reiniciar();
    estado.bloqueos.push({ id: "b0", areaId: "a1", fecha: new Date("2026-11-15T00:00:00Z"), motivo: "Mantenimiento", ...bloqueo });
    const err = await fallo(reservarComo("c1"));
    assert.equal(err.codigo, "TURNO_NO_DISPONIBLE");
    assert.equal(err.detalle.motivo, "BLOQUEADO");
    assert.equal(estado.reservas.length, 0);
  }
});

test("un bloqueo que no toca el turno no impide reservar", async () => {
  reiniciar();
  estado.bloqueos.push({ id: "b0", areaId: "a1", fecha: new Date("2026-11-15T00:00:00Z"), horaInicio: "13:00", horaFin: "15:00", motivo: "x" });
  assert.equal((await reservarComo("c1")).estado, "RESERVADA");
});

test("area inactiva: 409 TURNO_NO_DISPONIBLE (AREA_INACTIVA)", async () => {
  reiniciar();
  estado.areas[0].activa = false;
  const err = await fallo(reservarComo("c1"));
  assert.equal(err.codigo, "TURNO_NO_DISPONIBLE");
  assert.equal(err.detalle.motivo, "AREA_INACTIVA");
});

test("turno inexistente (horas que no coinciden con un horario activo): 400 TURNO_INEXISTENTE", async () => {
  reiniciar();
  let err = await fallo(reservarComo("c1", { horaFin: "12:00" }));
  assert.equal(err.status, 400);
  assert.equal(err.codigo, "TURNO_INEXISTENTE");
  assert.deepEqual(err.detalle.turnosDelDia, [{ horaInicio: "08:00", horaFin: "13:00" }]);
  // Un dia sin horarios (lunes)
  err = await fallo(reservarComo("c1", { fecha: "2026-11-16" }));
  assert.equal(err.codigo, "TURNO_INEXISTENTE");
  // Un horario desactivado deja de ser un turno
  estado.horarios.find((h) => h.id === "h3").activo = false;
  err = await fallo(reservarComo("c1"));
  assert.equal(err.codigo, "TURNO_INEXISTENTE");
});

test("turno ya iniciado hoy, fecha pasada y fuera de la ventana de 60 dias", async () => {
  reiniciar();
  let err = await fallo(reservarComo("c1", { fecha: "2026-11-14", horaInicio: "08:00", horaFin: "13:00" })); // sabado 08:00, ahora 10:30
  assert.equal(err.codigo, "TURNO_NO_DISPONIBLE");
  assert.equal(err.detalle.motivo, "TURNO_INICIADO");
  err = await fallo(reservarComo("c1", { fecha: "2026-11-07" }));
  assert.equal(err.codigo, "FECHA_PASADA");
  err = await fallo(reservarComo("c1", { fecha: "2027-01-24" })); // domingo, hoy + 71
  assert.equal(err.codigo, "FUERA_DE_VENTANA");
  // Hoy mas tarde si se puede
  assert.equal((await reservarComo("c1", { fecha: "2026-11-14", horaInicio: "14:00", horaFin: "19:00" })).horaInicio, "14:00");
});

test("datos invalidos: no consulta la base ni los pagos", async () => {
  reiniciar();
  assert.equal((await fallo(reservarComo("c1", { fecha: "2026-02-30" }))).codigo, "FECHA_INVALIDA");
  assert.equal((await fallo(reservarComo("c1", { horaInicio: "8am" }))).codigo, "HORA_INVALIDA");
  assert.equal(estado.consultasAlDia, 0);
});

test("cancelar la propia: CANCELADA, vigente NULL, canceladaEn y motivo", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  const cancelada = await service.cancelar(id, { motivo: "Viaje", rol: "CONSULTA", actorId: "u-c1", copropietarioId: "c1", ahora: AHORA });
  assert.equal(cancelada.estado, "CANCELADA");
  const fila = estado.reservas.find((r) => r.id === id);
  assert.equal(fila.vigente, null); // nunca false
  assert.deepEqual(fila.canceladaEn, AHORA);
  assert.equal(fila.motivoCancelacion, "Viaje");
  assert.equal(estado.auditorias.at(-1).accion, "CANCEL");
});

test("cancelar sin motivo (copropietario): permitido", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  await service.cancelar(id, { rol: "CONSULTA", actorId: "u-c1", copropietarioId: "c1", ahora: AHORA });
  assert.equal(estado.reservas[0].motivoCancelacion, null);
  assert.equal(estado.reservas[0].vigente, null);
});

test("cancelar la reserva de otro: 403 RESERVA_AJENA y sigue vigente", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  const err = await fallo(service.cancelar(id, { rol: "CONSULTA", actorId: "u-c2", copropietarioId: "c2", ahora: AHORA }));
  assert.equal(err.status, 403);
  assert.equal(err.codigo, "RESERVA_AJENA");
  assert.equal(vigentes().length, 1);
});

test("cancelar dos veces: 409 YA_CANCELADA", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  const datos = { rol: "CONSULTA", actorId: "u-c1", copropietarioId: "c1", ahora: AHORA };
  await service.cancelar(id, datos);
  const err = await fallo(service.cancelar(id, datos));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "YA_CANCELADA");
});

test("cancelar una reserva que no existe: 404", async () => {
  reiniciar();
  const err = await fallo(service.cancelar("nada", { rol: "CONSULTA", copropietarioId: "c1", ahora: AHORA }));
  assert.equal(err.status, 404);
});

test("cancelar un turno que ya empezo (copropietario): 409 TURNO_INICIADO", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  const despues = new Date("2026-11-15T13:00:00Z"); // domingo 09:00 en Bolivia, turno desde las 08:00
  const err = await fallo(service.cancelar(id, { rol: "CONSULTA", actorId: "u-c1", copropietarioId: "c1", ahora: despues }));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "TURNO_INICIADO");
  assert.equal(vigentes().length, 1);
});

test("administrador cancela cualquiera con motivo; sin motivo falla", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  let err = await fallo(service.cancelar(id, { rol: "ADMINISTRADOR", actorId: "admin", ahora: AHORA }));
  assert.equal(err.status, 400);
  assert.equal(err.codigo, "MOTIVO_REQUERIDO");
  assert.equal(vigentes().length, 1);
  const cancelada = await service.cancelar(id, { motivo: "Evento del edificio", rol: "ADMINISTRADOR", actorId: "admin", ahora: AHORA });
  assert.equal(cancelada.estado, "CANCELADA");
  assert.equal(cancelada.motivoCancelacion, "Evento del edificio");
  assert.equal(estado.auditorias.at(-1).detalle.comoAdministrador, true);
});

test("reservar de nuevo el turno tras cancelar", async () => {
  reiniciar();
  const primera = await reservarComo("c1");
  await service.cancelar(primera.id, { rol: "CONSULTA", actorId: "u-c1", copropietarioId: "c1", ahora: AHORA });
  const segunda = await reservarComo("c2");
  assert.notEqual(segunda.id, primera.id);
  assert.equal(vigentes().length, 1);
  assert.equal(estado.reservas.length, 2); // la cancelada queda como historial
  assert.equal(vigentes()[0].copropietarioId, "c2");
});

test("crear bloqueo con reservas en conflicto: 409 RESERVAS_EN_CONFLICTO con la lista y sin cancelarlas", async () => {
  reiniciar();
  await reservarComo("c1");
  const err = await fallo(service.crearBloqueo("a1", { fecha: "2026-11-15", motivo: "Pintura" }, { actorId: "admin" }));
  assert.equal(err.status, 409);
  assert.equal(err.codigo, "RESERVAS_EN_CONFLICTO");
  assert.equal(err.datos.reservas.length, 1);
  assert.equal(err.datos.reservas[0].horaInicio, "08:00");
  assert.equal(vigentes().length, 1); // no se cancelo automaticamente
  assert.equal(estado.bloqueos.length, 0);
});

test("crear bloqueo parcial que no toca la reserva: se crea; con reserva cancelada tambien", async () => {
  reiniciar();
  const { id } = await reservarComo("c1");
  const ok = await service.crearBloqueo("a1", { fecha: "2026-11-15", horaInicio: "14:00", horaFin: "16:00", motivo: "Limpieza" }, { actorId: "admin" });
  assert.equal(ok.horaInicio, "14:00");
  await service.cancelar(id, { motivo: "x", rol: "ADMINISTRADOR", actorId: "admin", ahora: AHORA });
  const todoElDia = await service.crearBloqueo("a1", { fecha: "2026-11-15", motivo: "Pintura" }, { actorId: "admin" });
  assert.equal(todoElDia.horaInicio, null);
  assert.equal(estado.bloqueos.length, 2);
  assert.equal(estado.auditorias.filter((a) => a.entidad === "BloqueoAreaComun").length, 2);
});

test("disponibilidad refleja la reserva y el bloqueo", async () => {
  reiniciar();
  await reservarComo("c1");
  estado.bloqueos.push({ id: "b0", areaId: "a1", fecha: new Date("2026-11-14T00:00:00Z"), horaInicio: "14:00", horaFin: "15:00", motivo: "Limpieza" });
  const r = await service.disponibilidad("a1", { desde: "2026-11-14", hasta: "2026-11-15" }, { rol: "CONSULTA", ahora: AHORA });
  assert.deepEqual(r.dias[0].turnos.map((t) => t.estado), ["PASADO", "BLOQUEADO"]);
  assert.deepEqual(r.dias[1].turnos.map((t) => t.estado), ["RESERVADO"]);
});
