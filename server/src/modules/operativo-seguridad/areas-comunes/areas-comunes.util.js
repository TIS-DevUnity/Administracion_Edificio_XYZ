// Reglas de las areas comunes (HU14). Son funciones puras: no tocan la base de datos.
// Hoy, la hora actual y el dia de la semana se calculan en America/La_Paz.
const { fechaEnZona, sumarDias, diasEntre } = require("../../financiero/expensas/mora.util");

// Cuantos dias hacia adelante se puede reservar (contando desde hoy).
const DIAS_MAXIMOS_ANTICIPACION = 60;
const DIAS_MAXIMOS_DISPONIBILIDAD = 31;
const ZONA_HORARIA = process.env.CRON_TIMEZONE || "America/La_Paz";

const ESTADOS_RESERVA = ["RESERVADA", "CANCELADA"];
const MAX_NOMBRE = 100;
const MAX_TEXTO = 2000;
const MAX_MOTIVO = 500;

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Error HTTP con codigo y datos opcionales (el middleware de errores los devuelve al cliente). */
function errorHttp(mensaje, status, extra = {}) {
  return Object.assign(new Error(mensaje), { status, ...extra });
}

function errorValidacion(errores) {
  return Object.assign(new Error(errores.join(". ")), { status: 400, errores });
}

// ---------------------------------------------------------------- fechas y horas

/** Fecha YYYY-MM-DD obligatoria y real (no acepta 2026-02-30). Devuelve el texto limpio. */
function validarFecha(valor, campo = "fecha") {
  if (valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "")) {
    throw errorHttp(`${campo} es requerida`, 400, { codigo: "FECHA_REQUERIDA" });
  }
  const texto = typeof valor === "string" ? valor.trim() : "";
  const fecha = SOLO_FECHA.test(texto) ? new Date(`${texto}T00:00:00Z`) : null;
  const real = fecha !== null && !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
  if (!real) {
    throw errorHttp(`${campo} debe ser una fecha valida con el formato YYYY-MM-DD`, 400, { codigo: "FECHA_INVALIDA" });
  }
  return texto;
}

function esHoraValida(valor) {
  return typeof valor === "string" && HORA.test(valor);
}

/** Hora HH:MM obligatoria. Devuelve el texto. */
function validarHora(valor, campo = "hora") {
  if (!esHoraValida(valor)) {
    throw errorHttp(`${campo} debe tener el formato HH:MM (00:00 a 23:59)`, 400, { codigo: "HORA_INVALIDA" });
  }
  return valor;
}

/** Valida una franja { horaInicio, horaFin }: formato HH:MM y horaFin posterior a horaInicio. */
function validarFranja({ horaInicio, horaFin } = {}) {
  validarHora(horaInicio, "horaInicio");
  validarHora(horaFin, "horaFin");
  if (horaFin <= horaInicio) {
    throw errorHttp("horaFin debe ser posterior a horaInicio", 400, { codigo: "FRANJA_INVALIDA" });
  }
  return { horaInicio, horaFin };
}

/** Dia de la semana de una fecha YYYY-MM-DD: 0 = domingo ... 6 = sabado. */
function diaSemanaDe(fechaIso) {
  return new Date(`${fechaIso}T00:00:00Z`).getUTCDay();
}

/** Fecha y hora actuales en hora de Bolivia: { fecha: "YYYY-MM-DD", hora: "HH:MM" }. */
function ahoraEnZona(ahora = new Date()) {
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ahora);
  return { fecha: fechaEnZona(ahora), hora };
}

/** Fecha de calendario (YYYY-MM-DD) de una columna @db.Date (medianoche UTC). */
function fechaIsoDe(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

/** Fecha YYYY-MM-DD como se guarda en una columna @db.Date. */
function fechaParaGuardar(fechaIso) {
  return new Date(`${fechaIso}T00:00:00Z`);
}

/** true si el turno ya empezo (o ya paso) en el instante `ahora`. */
function turnoYaEmpezado({ fecha, horaInicio }, ahora = new Date()) {
  const actual = ahoraEnZona(ahora);
  if (fecha < actual.fecha) return true;
  return fecha === actual.fecha && horaInicio <= actual.hora;
}

/**
 * La fecha debe ser hoy o posterior y no pasar de DIAS_MAXIMOS_ANTICIPACION dias desde hoy.
 * Un turno de hoy que ya empezo se descarta aparte (turnoYaEmpezado).
 */
function validarVentana(fecha, ahora = new Date()) {
  const hoy = fechaEnZona(ahora);
  if (fecha < hoy) {
    throw errorHttp("No se puede reservar en una fecha pasada", 400, { codigo: "FECHA_PASADA" });
  }
  if (diasEntre(hoy, fecha) > DIAS_MAXIMOS_ANTICIPACION) {
    throw errorHttp(
      `Solo se puede reservar con hasta ${DIAS_MAXIMOS_ANTICIPACION} dias de anticipacion (hasta el ${sumarDias(hoy, DIAS_MAXIMOS_ANTICIPACION)})`,
      400,
      { codigo: "FUERA_DE_VENTANA", detalle: { fechaMaxima: sumarDias(hoy, DIAS_MAXIMOS_ANTICIPACION) } }
    );
  }
}

/** Rango del calendario de disponibilidad: fechas validas, desde <= hasta y como maximo 31 dias. */
function validarRangoDisponibilidad({ desde, hasta } = {}) {
  const d = validarFecha(desde, "desde");
  const h = validarFecha(hasta, "hasta");
  if (d > h) {
    throw errorHttp("desde no puede ser posterior a hasta", 400, { codigo: "RANGO_INVALIDO" });
  }
  if (diasEntre(d, h) + 1 > DIAS_MAXIMOS_DISPONIBILIDAD) {
    throw errorHttp(`El rango no puede superar ${DIAS_MAXIMOS_DISPONIBILIDAD} dias`, 400, { codigo: "RANGO_MUY_GRANDE" });
  }
  return { desde: d, hasta: h };
}

/** Lista de fechas YYYY-MM-DD de `desde` a `hasta`, ambas incluidas. */
function fechasEntre(desde, hasta) {
  const fechas = [];
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) fechas.push(dia);
  return fechas;
}

// ---------------------------------------------------------------- solapamientos y turnos

/** Dos franjas [inicio, fin) se solapan si cada una empieza antes de que termine la otra. */
function franjasSeSolapan(a, b) {
  return a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
}

/** true si `nuevo` se solapa con algun horario de `existentes` del mismo dia (ignora `ignorarId`). */
function hayHorarioSolapado(nuevo, existentes = [], ignorarId = null) {
  return existentes.some(
    (h) => h.id !== ignorarId && h.diaSemana === nuevo.diaSemana && franjasSeSolapan(h, nuevo)
  );
}

/** Valida un horario semanal { diaSemana, horaInicio, horaFin }. */
function validarHorario({ diaSemana, horaInicio, horaFin } = {}) {
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    throw errorHttp("diaSemana debe ser un entero de 0 (domingo) a 6 (sabado)", 400, { codigo: "DIA_INVALIDO" });
  }
  validarFranja({ horaInicio, horaFin });
  return { diaSemana, horaInicio, horaFin };
}

/** Turnos reservables de una fecha: los horarios activos del area para ese dia de la semana, por hora. */
function turnosDelDia(horarios = [], fechaIso) {
  const dia = diaSemanaDe(fechaIso);
  return horarios
    .filter((h) => h.activo !== false && h.diaSemana === dia)
    .map((h) => ({ horaInicio: h.horaInicio, horaFin: h.horaFin }))
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

/** El horario activo cuyas horas son exactamente las del turno pedido (o undefined). */
function buscarTurno(horarios, fechaIso, { horaInicio, horaFin }) {
  return turnosDelDia(horarios, fechaIso).find((t) => t.horaInicio === horaInicio && t.horaFin === horaFin);
}

/** true si el bloqueo cubre el turno: sin horas = todo el dia; con horas, si se solapan. */
function bloqueoCubreTurno(bloqueo, turno) {
  if (!bloqueo.horaInicio || !bloqueo.horaFin) return true;
  return franjasSeSolapan(bloqueo, turno);
}

/** Reservas vigentes (RESERVADA, vigente true) que se solapan con un bloqueo de su misma area y fecha. */
function reservasEnConflicto(bloqueo, reservas = []) {
  return reservas.filter(
    (r) =>
      r.estado === "RESERVADA" &&
      r.vigente === true &&
      r.areaId === bloqueo.areaId &&
      fechaIsoDe(r.fecha) === fechaIsoDe(bloqueo.fecha) &&
      bloqueoCubreTurno(bloqueo, r)
  );
}

/**
 * Estado de un turno. Orden: PASADO (ya empezo) > BLOQUEADO (area inactiva o bloqueo) > RESERVADO > DISPONIBLE.
 * `reservas` y `bloqueos` son los de esa area; aqui se filtran por fecha.
 */
function estadoDelTurno({ area, fecha, turno, reservas = [], bloqueos = [], ahora = new Date() }) {
  if (turnoYaEmpezado({ fecha, horaInicio: turno.horaInicio }, ahora)) return { estado: "PASADO" };
  if (area.activa === false) return { estado: "BLOQUEADO", motivo: "Area inactiva" };
  const bloqueo = bloqueos.find((b) => fechaIsoDe(b.fecha) === fecha && bloqueoCubreTurno(b, turno));
  if (bloqueo) return { estado: "BLOQUEADO", motivo: bloqueo.motivo, bloqueoId: bloqueo.id };
  const reservada = reservas.some(
    (r) =>
      r.estado === "RESERVADA" && r.vigente === true && fechaIsoDe(r.fecha) === fecha && r.horaInicio === turno.horaInicio
  );
  if (reservada) return { estado: "RESERVADO" };
  return { estado: "DISPONIBLE" };
}

/** Calendario: por cada dia del rango, sus turnos con estado DISPONIBLE | RESERVADO | BLOQUEADO | PASADO. */
function construirDisponibilidad({ area, horarios, reservas, bloqueos, desde, hasta, ahora = new Date() }) {
  return fechasEntre(desde, hasta).map((fecha) => ({
    fecha,
    diaSemana: diaSemanaDe(fecha),
    turnos: turnosDelDia(horarios, fecha).map((turno) => ({
      ...turno,
      ...estadoDelTurno({ area, fecha, turno, reservas, bloqueos, ahora }),
    })),
  }));
}

// ---------------------------------------------------------------- areas, bloqueos y cancelaciones

function textoONull(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

/**
 * Valida los datos de un area. En la creacion `nombre` es obligatorio; en la edicion (`parcial`) solo se
 * validan los campos enviados. Devuelve los campos a guardar.
 */
function validarArea({ nombre, descripcion, condiciones, activa } = {}, { parcial = false } = {}) {
  const errores = [];
  const datos = {};

  if (nombre !== undefined || !parcial) {
    const limpio = textoONull(nombre);
    if (!limpio) errores.push("nombre es requerido");
    else if (limpio.length > MAX_NOMBRE) errores.push(`nombre no puede superar ${MAX_NOMBRE} caracteres`);
    else datos.nombre = limpio;
  }
  for (const [campo, valor] of [["descripcion", descripcion], ["condiciones", condiciones]]) {
    if (valor === undefined) continue;
    if (valor !== null && typeof valor !== "string") errores.push(`${campo} debe ser un texto`);
    else if (typeof valor === "string" && valor.trim().length > MAX_TEXTO) {
      errores.push(`${campo} no puede superar ${MAX_TEXTO} caracteres`);
    } else datos[campo] = valor === null ? null : textoONull(valor);
  }
  if (activa !== undefined) {
    if (typeof activa !== "boolean") errores.push("activa debe ser verdadero o falso");
    else datos.activa = activa;
  }
  if (parcial && errores.length === 0 && Object.keys(datos).length === 0) {
    errores.push("No hay campos para actualizar");
  }
  if (errores.length > 0) throw errorValidacion(errores);
  return datos;
}

/** Valida un bloqueo: fecha, motivo y, o ninguna hora (todo el dia), o las dos (franja). */
function validarBloqueo({ fecha, horaInicio, horaFin, motivo } = {}) {
  const fechaLimpia = validarFecha(fecha, "fecha");
  const motivoLimpio = textoONull(motivo);
  if (!motivoLimpio) throw errorHttp("motivo es requerido", 400, { codigo: "MOTIVO_REQUERIDO" });
  if (motivoLimpio.length > MAX_MOTIVO) throw errorHttp(`motivo no puede superar ${MAX_MOTIVO} caracteres`, 400);

  const sinInicio = horaInicio === undefined || horaInicio === null;
  const sinFin = horaFin === undefined || horaFin === null;
  if (sinInicio && sinFin) return { fecha: fechaLimpia, horaInicio: null, horaFin: null, motivo: motivoLimpio };
  if (sinInicio !== sinFin) {
    throw errorHttp("Envie horaInicio y horaFin juntas, o ninguna para bloquear todo el dia", 400, { codigo: "FRANJA_INCOMPLETA" });
  }
  validarFranja({ horaInicio, horaFin });
  return { fecha: fechaLimpia, horaInicio, horaFin, motivo: motivoLimpio };
}

/** Motivo de cancelacion: opcional para el copropietario y obligatorio para el administrador. */
function validarMotivoCancelacion(motivo, { obligatorio = false } = {}) {
  if (motivo !== undefined && motivo !== null && typeof motivo !== "string") {
    throw errorHttp("motivo debe ser un texto", 400);
  }
  const limpio = textoONull(motivo);
  if (obligatorio && !limpio) {
    throw errorHttp("El administrador debe indicar el motivo de la cancelacion", 400, { codigo: "MOTIVO_REQUERIDO" });
  }
  if (limpio && limpio.length > MAX_MOTIVO) throw errorHttp(`motivo no puede superar ${MAX_MOTIVO} caracteres`, 400);
  return limpio;
}

function validarEstadoReserva(estado) {
  if (estado === undefined || estado === null || estado === "") return undefined;
  if (!ESTADOS_RESERVA.includes(estado)) {
    throw errorHttp(`estado invalido. Valores permitidos: ${ESTADOS_RESERVA.join(", ")}`, 400, { codigo: "ESTADO_INVALIDO" });
  }
  return estado;
}

/** Forma publica de una reserva (la fecha como YYYY-MM-DD). */
function formatearReserva(reserva) {
  return {
    id: reserva.id,
    areaId: reserva.areaId,
    ...(reserva.area ? { area: { id: reserva.area.id, nombre: reserva.area.nombre } } : {}),
    copropietarioId: reserva.copropietarioId,
    ...(reserva.copropietario
      ? { copropietario: { id: reserva.copropietario.id, nombre: reserva.copropietario.nombre, apellido: reserva.copropietario.apellido } }
      : {}),
    fecha: fechaIsoDe(reserva.fecha),
    horaInicio: reserva.horaInicio,
    horaFin: reserva.horaFin,
    estado: reserva.estado,
    canceladaEn: reserva.canceladaEn ?? null,
    motivoCancelacion: reserva.motivoCancelacion ?? null,
    createdAt: reserva.createdAt,
  };
}

/** Mis reservas: primero las que aun no empiezan (la mas proxima primero), despues las pasadas (la mas reciente primero). */
function ordenarMisReservas(reservas, ahora = new Date()) {
  const clave = (r) => `${fechaIsoDe(r.fecha)}T${r.horaInicio}`;
  const futuras = [];
  const pasadas = [];
  for (const r of reservas) {
    (turnoYaEmpezado({ fecha: fechaIsoDe(r.fecha), horaInicio: r.horaInicio }, ahora) ? pasadas : futuras).push(r);
  }
  futuras.sort((a, b) => clave(a).localeCompare(clave(b)));
  pasadas.sort((a, b) => clave(b).localeCompare(clave(a)));
  return [...futuras, ...pasadas];
}

/** true si el error de Prisma es una violacion de restriccion unica (P2002). */
function esViolacionUnica(err) {
  return err?.code === "P2002";
}

module.exports = {
  DIAS_MAXIMOS_ANTICIPACION,
  DIAS_MAXIMOS_DISPONIBILIDAD,
  ESTADOS_RESERVA,
  errorHttp,
  errorValidacion,
  validarFecha,
  validarHora,
  validarFranja,
  esHoraValida,
  diaSemanaDe,
  ahoraEnZona,
  fechaIsoDe,
  fechaParaGuardar,
  turnoYaEmpezado,
  validarVentana,
  validarRangoDisponibilidad,
  fechasEntre,
  franjasSeSolapan,
  hayHorarioSolapado,
  validarHorario,
  turnosDelDia,
  buscarTurno,
  bloqueoCubreTurno,
  reservasEnConflicto,
  estadoDelTurno,
  construirDisponibilidad,
  validarArea,
  validarBloqueo,
  validarMotivoCancelacion,
  validarEstadoReserva,
  formatearReserva,
  ordenarMisReservas,
  esViolacionUnica,
};
