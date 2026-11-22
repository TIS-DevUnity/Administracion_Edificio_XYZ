// Pruebas de las reglas de areas comunes (HU14). Se ejecutan con:
//   node --test server/src/modules/operativo-seguridad/areas-comunes/areas-comunes.util.test.js
// Son funciones puras: no tocan la base de datos.
const test = require("node:test");
const assert = require("node:assert/strict");
const util = require("./areas-comunes.util");

// Instante fijo: sabado 2026-11-14, 10:30 en Bolivia (UTC-4).
const AHORA = new Date("2026-11-14T14:30:00Z");
const HOY = "2026-11-14";

const horario = (diaSemana, horaInicio, horaFin, extra = {}) => ({ id: `${diaSemana}-${horaInicio}`, diaSemana, horaInicio, horaFin, activo: true, ...extra });
const fecha = (iso) => new Date(`${iso}T00:00:00Z`);
const reserva = (iso, horaInicio, horaFin, extra = {}) => ({ areaId: "a1", fecha: fecha(iso), horaInicio, horaFin, estado: "RESERVADA", vigente: true, ...extra });
const bloqueo = (iso, horaInicio = null, horaFin = null, extra = {}) => ({ id: "b1", areaId: "a1", fecha: fecha(iso), horaInicio, horaFin, motivo: "Mantenimiento", ...extra });
const codigoDe = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.codigo;
  }
  return null;
};

test("diaSemanaDe: 0 = domingo ... 6 = sabado", () => {
  assert.equal(util.diaSemanaDe("2026-11-14"), 6); // sabado
  assert.equal(util.diaSemanaDe("2026-11-15"), 0); // domingo
  assert.equal(util.diaSemanaDe("2026-11-16"), 1); // lunes
});

test("ahoraEnZona usa la hora de Bolivia, tambien cerca de la medianoche", () => {
  assert.deepEqual(util.ahoraEnZona(AHORA), { fecha: HOY, hora: "10:30" });
  // 02:00 UTC del 15 = 22:00 del 14 en Bolivia
  assert.deepEqual(util.ahoraEnZona(new Date("2026-11-15T02:00:00Z")), { fecha: "2026-11-14", hora: "22:00" });
  // 04:00 UTC = 00:00 en Bolivia (no debe salir "24:00")
  assert.deepEqual(util.ahoraEnZona(new Date("2026-11-15T04:00:00Z")), { fecha: "2026-11-15", hora: "00:00" });
});

test("turnosDelDia: solo los horarios activos de ese dia de la semana, ordenados por hora", () => {
  const horarios = [
    horario(6, "14:00", "19:00"),
    horario(6, "08:00", "13:00"),
    horario(6, "20:00", "22:00", { activo: false }),
    horario(0, "08:00", "13:00"),
  ];
  assert.deepEqual(util.turnosDelDia(horarios, "2026-11-14"), [
    { horaInicio: "08:00", horaFin: "13:00" },
    { horaInicio: "14:00", horaFin: "19:00" },
  ]);
  assert.deepEqual(util.turnosDelDia(horarios, "2026-11-16"), []); // lunes
});

test("buscarTurno exige horas exactas de un horario activo", () => {
  const horarios = [horario(6, "08:00", "13:00")];
  assert.ok(util.buscarTurno(horarios, "2026-11-14", { horaInicio: "08:00", horaFin: "13:00" }));
  assert.equal(util.buscarTurno(horarios, "2026-11-14", { horaInicio: "08:00", horaFin: "12:00" }), undefined);
  assert.equal(util.buscarTurno(horarios, "2026-11-14", { horaInicio: "09:00", horaFin: "13:00" }), undefined);
});

test("bloqueo de todo el dia cubre cualquier turno; el parcial solo los que se solapan", () => {
  const manana = { horaInicio: "08:00", horaFin: "13:00" };
  const tarde = { horaInicio: "14:00", horaFin: "19:00" };
  assert.equal(util.bloqueoCubreTurno(bloqueo(HOY), manana), true);
  assert.equal(util.bloqueoCubreTurno(bloqueo(HOY), tarde), true);
  const parcial = bloqueo(HOY, "12:00", "15:00");
  assert.equal(util.bloqueoCubreTurno(parcial, manana), true); // 12-13 se solapa
  assert.equal(util.bloqueoCubreTurno(parcial, tarde), true); // 14-15 se solapa
  // Franjas contiguas no se solapan
  assert.equal(util.bloqueoCubreTurno(bloqueo(HOY, "13:00", "14:00"), manana), false);
  assert.equal(util.bloqueoCubreTurno(bloqueo(HOY, "13:00", "14:00"), tarde), false);
});

test("reservasEnConflicto: solo vigentes, del area y fecha, y que el bloqueo cubra", () => {
  const reservas = [
    reserva(HOY, "08:00", "13:00"),
    reserva(HOY, "14:00", "19:00"),
    reserva(HOY, "08:00", "13:00", { estado: "CANCELADA", vigente: null }),
    reserva("2026-11-21", "08:00", "13:00"),
    reserva(HOY, "08:00", "13:00", { areaId: "otra" }),
  ];
  assert.equal(util.reservasEnConflicto(bloqueo(HOY), reservas).length, 2);
  const soloManana = util.reservasEnConflicto(bloqueo(HOY, "09:00", "10:00"), reservas);
  assert.equal(soloManana.length, 1);
  assert.equal(soloManana[0].horaInicio, "08:00");
  assert.equal(util.reservasEnConflicto(bloqueo(HOY, "13:00", "14:00"), reservas).length, 0);
});

test("turnoYaEmpezado: dia pasado, hoy en curso, hoy futuro y dia futuro", () => {
  assert.equal(util.turnoYaEmpezado({ fecha: "2026-11-13", horaInicio: "20:00" }, AHORA), true);
  assert.equal(util.turnoYaEmpezado({ fecha: HOY, horaInicio: "08:00" }, AHORA), true); // ya paso
  assert.equal(util.turnoYaEmpezado({ fecha: HOY, horaInicio: "10:30" }, AHORA), true); // empieza justo ahora
  assert.equal(util.turnoYaEmpezado({ fecha: HOY, horaInicio: "10:31" }, AHORA), false);
  assert.equal(util.turnoYaEmpezado({ fecha: HOY, horaInicio: "14:00" }, AHORA), false);
  assert.equal(util.turnoYaEmpezado({ fecha: "2026-11-15", horaInicio: "00:00" }, AHORA), false);
});

test("validarVentana: hoy y 60 dias pasan; 61 y fechas pasadas fallan", () => {
  assert.equal(codigoDe(() => util.validarVentana(HOY, AHORA)), null);
  assert.equal(util.DIAS_MAXIMOS_ANTICIPACION, 60);
  assert.equal(codigoDe(() => util.validarVentana("2027-01-13", AHORA)), null); // hoy + 60
  assert.equal(codigoDe(() => util.validarVentana("2027-01-14", AHORA)), "FUERA_DE_VENTANA"); // hoy + 61
  assert.equal(codigoDe(() => util.validarVentana("2026-11-13", AHORA)), "FECHA_PASADA");
});

test("validarFecha: formato y fechas reales", () => {
  assert.equal(util.validarFecha(" 2026-11-14 "), "2026-11-14");
  assert.equal(codigoDe(() => util.validarFecha(undefined)), "FECHA_REQUERIDA");
  assert.equal(codigoDe(() => util.validarFecha("")), "FECHA_REQUERIDA");
  assert.equal(codigoDe(() => util.validarFecha("14/11/2026")), "FECHA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFecha("2026-02-30")), "FECHA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFecha("2026-13-01")), "FECHA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFecha(20261114)), "FECHA_INVALIDA");
});

test("validarFranja: HH:MM y horaFin posterior a horaInicio", () => {
  assert.deepEqual(util.validarFranja({ horaInicio: "08:00", horaFin: "12:00" }), { horaInicio: "08:00", horaFin: "12:00" });
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "8:00", horaFin: "12:00" })), "HORA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "08:00", horaFin: "24:00" })), "HORA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "08:60", horaFin: "12:00" })), "HORA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "08:00" })), "HORA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "12:00", horaFin: "12:00" })), "FRANJA_INVALIDA");
  assert.equal(codigoDe(() => util.validarFranja({ horaInicio: "13:00", horaFin: "12:00" })), "FRANJA_INVALIDA");
});

test("validarHorario: dia de la semana entero entre 0 y 6", () => {
  assert.equal(util.validarHorario({ diaSemana: 0, horaInicio: "08:00", horaFin: "09:00" }).diaSemana, 0);
  assert.equal(codigoDe(() => util.validarHorario({ diaSemana: 7, horaInicio: "08:00", horaFin: "09:00" })), "DIA_INVALIDO");
  assert.equal(codigoDe(() => util.validarHorario({ diaSemana: "1", horaInicio: "08:00", horaFin: "09:00" })), "DIA_INVALIDO");
  assert.equal(codigoDe(() => util.validarHorario({ diaSemana: 1.5, horaInicio: "08:00", horaFin: "09:00" })), "DIA_INVALIDO");
});

test("validarBloqueo: todo el dia sin horas, franja con las dos, motivo obligatorio", () => {
  assert.deepEqual(util.validarBloqueo({ fecha: HOY, motivo: " Pintura " }), { fecha: HOY, horaInicio: null, horaFin: null, motivo: "Pintura" });
  assert.equal(util.validarBloqueo({ fecha: HOY, horaInicio: "09:00", horaFin: "11:00", motivo: "x" }).horaFin, "11:00");
  assert.equal(codigoDe(() => util.validarBloqueo({ fecha: HOY, motivo: "  " })), "MOTIVO_REQUERIDO");
  assert.equal(codigoDe(() => util.validarBloqueo({ fecha: HOY, horaInicio: "09:00", motivo: "x" })), "FRANJA_INCOMPLETA");
  assert.equal(codigoDe(() => util.validarBloqueo({ fecha: HOY, horaInicio: "11:00", horaFin: "09:00", motivo: "x" })), "FRANJA_INVALIDA");
  assert.equal(codigoDe(() => util.validarBloqueo({ fecha: "mal", motivo: "x" })), "FECHA_INVALIDA");
});

test("hayHorarioSolapado: mismo dia y franjas que se cruzan; contiguos y otros dias no", () => {
  const existentes = [horario(6, "08:00", "13:00"), horario(0, "08:00", "13:00")];
  assert.equal(util.hayHorarioSolapado({ diaSemana: 6, horaInicio: "12:00", horaFin: "15:00" }, existentes), true);
  assert.equal(util.hayHorarioSolapado({ diaSemana: 6, horaInicio: "09:00", horaFin: "10:00" }, existentes), true); // contenido
  assert.equal(util.hayHorarioSolapado({ diaSemana: 6, horaInicio: "13:00", horaFin: "15:00" }, existentes), false); // contiguo
  assert.equal(util.hayHorarioSolapado({ diaSemana: 1, horaInicio: "08:00", horaFin: "13:00" }, existentes), false);
  // Al editar, el horario no choca consigo mismo
  assert.equal(util.hayHorarioSolapado({ diaSemana: 6, horaInicio: "08:00", horaFin: "12:00" }, existentes, existentes[0].id), false);
});

test("validarRangoDisponibilidad: maximo 31 dias y desde <= hasta", () => {
  assert.deepEqual(util.validarRangoDisponibilidad({ desde: "2026-12-01", hasta: "2026-12-31" }), { desde: "2026-12-01", hasta: "2026-12-31" });
  assert.equal(codigoDe(() => util.validarRangoDisponibilidad({ desde: "2026-12-01", hasta: "2027-01-01" })), "RANGO_MUY_GRANDE");
  assert.equal(codigoDe(() => util.validarRangoDisponibilidad({ desde: "2026-12-05", hasta: "2026-12-01" })), "RANGO_INVALIDO");
  assert.equal(codigoDe(() => util.validarRangoDisponibilidad({ hasta: "2026-12-01" })), "FECHA_REQUERIDA");
});

test("construirDisponibilidad: DISPONIBLE, RESERVADO, BLOQUEADO y PASADO", () => {
  const area = { id: "a1", activa: true };
  const horarios = [horario(6, "08:00", "13:00"), horario(6, "14:00", "19:00"), horario(0, "08:00", "13:00"), horario(0, "14:00", "19:00")];
  const dias = util.construirDisponibilidad({
    area,
    horarios,
    reservas: [reserva("2026-11-15", "08:00", "13:00")],
    bloqueos: [bloqueo("2026-11-15", "14:00", "16:00")],
    desde: "2026-11-14",
    hasta: "2026-11-16",
    ahora: AHORA, // sabado 10:30
  });
  assert.equal(dias.length, 3);
  const estados = (d) => dias[d].turnos.map((t) => t.estado);
  assert.deepEqual(estados(0), ["PASADO", "DISPONIBLE"]); // sabado: 08:00 ya empezo, 14:00 no
  assert.deepEqual(estados(1), ["RESERVADO", "BLOQUEADO"]); // domingo
  assert.equal(dias[1].turnos[1].motivo, "Mantenimiento");
  assert.deepEqual(dias[2].turnos, []); // lunes sin horarios
  assert.equal(dias[0].diaSemana, 6);
});

test("area inactiva: todos los turnos futuros quedan BLOQUEADO", () => {
  const dias = util.construirDisponibilidad({
    area: { activa: false },
    horarios: [horario(0, "08:00", "13:00")],
    reservas: [],
    bloqueos: [],
    desde: "2026-11-15",
    hasta: "2026-11-15",
    ahora: AHORA,
  });
  assert.equal(dias[0].turnos[0].estado, "BLOQUEADO");
});

test("una reserva cancelada no ocupa el turno", () => {
  const dias = util.construirDisponibilidad({
    area: { activa: true },
    horarios: [horario(0, "08:00", "13:00")],
    reservas: [reserva("2026-11-15", "08:00", "13:00", { estado: "CANCELADA", vigente: null })],
    bloqueos: [],
    desde: "2026-11-15",
    hasta: "2026-11-15",
    ahora: AHORA,
  });
  assert.equal(dias[0].turnos[0].estado, "DISPONIBLE");
});

test("ordenarMisReservas: proximas primero (mas cercana antes) y luego pasadas (mas reciente antes)", () => {
  const r = (id, iso, h) => ({ id, fecha: fecha(iso), horaInicio: h });
  const orden = util.ordenarMisReservas(
    [r("pasada-vieja", "2026-10-01", "08:00"), r("lejana", "2026-12-20", "08:00"), r("pasada-reciente", "2026-11-14", "08:00"), r("cercana", "2026-11-14", "14:00")],
    AHORA
  );
  assert.deepEqual(orden.map((x) => x.id), ["cercana", "lejana", "pasada-reciente", "pasada-vieja"]);
});

test("validarMotivoCancelacion: obligatorio solo para el administrador", () => {
  assert.equal(util.validarMotivoCancelacion(undefined), null);
  assert.equal(util.validarMotivoCancelacion(" no puedo ir "), "no puedo ir");
  assert.equal(codigoDe(() => util.validarMotivoCancelacion("  ", { obligatorio: true })), "MOTIVO_REQUERIDO");
});

test("validarArea: creacion exige nombre; edicion parcial exige algun campo", () => {
  assert.deepEqual(util.validarArea({ nombre: " Gimnasio ", activa: true }), { nombre: "Gimnasio", activa: true });
  assert.throws(() => util.validarArea({}), /nombre es requerido/);
  assert.deepEqual(util.validarArea({ activa: false }, { parcial: true }), { activa: false });
  assert.throws(() => util.validarArea({}, { parcial: true }), /No hay campos/);
  assert.throws(() => util.validarArea({ activa: "si" }, { parcial: true }), /activa/);
});
