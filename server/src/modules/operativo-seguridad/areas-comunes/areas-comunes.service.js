const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { estaAlDia } = require("../../financiero/cuenta-residente/estado-pagos.service");
const util = require("./areas-comunes.util");

const { errorHttp } = util;

const CAMPOS_AREA = { id: true, nombre: true, descripcion: true, condiciones: true, activa: true, createdAt: true, updatedAt: true };
const CAMPOS_HORARIO = { id: true, diaSemana: true, horaInicio: true, horaFin: true, activo: true };
const ORDEN_HORARIOS = [{ diaSemana: "asc" }, { horaInicio: "asc" }];
const INCLUIR_RESERVA = {
  area: { select: { id: true, nombre: true } },
  copropietario: { select: { id: true, nombre: true, apellido: true } },
};

const esAdministrador = (rol) => rol === "ADMINISTRADOR";

function formatearBloqueo(bloqueo) {
  return {
    id: bloqueo.id,
    areaId: bloqueo.areaId,
    fecha: util.fechaIsoDe(bloqueo.fecha),
    horaInicio: bloqueo.horaInicio,
    horaFin: bloqueo.horaFin,
    motivo: bloqueo.motivo,
  };
}

async function exigirArea(id, { soloActiva = false } = {}) {
  const area = await prisma.areaComun.findUnique({ where: { id }, select: CAMPOS_AREA });
  if (!area || (soloActiva && !area.activa)) throw errorHttp("Area comun no encontrada", 404);
  return area;
}

// ---------------------------------------------------------------- consulta

/** Areas activas con sus horarios activos. */
async function listarAreas() {
  return prisma.areaComun.findMany({
    where: { activa: true },
    select: { ...CAMPOS_AREA, horarios: { where: { activo: true }, select: CAMPOS_HORARIO, orderBy: ORDEN_HORARIOS } },
    orderBy: { nombre: "asc" },
  });
}

/**
 * Un area con sus horarios y condiciones. Quien no es ADMINISTRADOR solo ve areas activas y sus horarios
 * activos; el ADMINISTRADOR ve tambien las inactivas y los horarios desactivados (para poder editarlos).
 */
async function obtenerArea(id, { rol }) {
  const admin = esAdministrador(rol);
  const area = await prisma.areaComun.findUnique({
    where: { id },
    select: {
      ...CAMPOS_AREA,
      horarios: { where: admin ? {} : { activo: true }, select: CAMPOS_HORARIO, orderBy: ORDEN_HORARIOS },
    },
  });
  if (!area || (!admin && !area.activa)) throw errorHttp("Area comun no encontrada", 404);
  return area;
}

/** Calendario de turnos del area por dia, con su estado. Un area inactiva muestra todo BLOQUEADO. */
async function disponibilidad(areaId, { desde, hasta }, { rol, ahora = new Date() } = {}) {
  const rango = util.validarRangoDisponibilidad({ desde, hasta });
  const area = await exigirArea(areaId, { soloActiva: !esAdministrador(rol) });

  const [horarios, bloqueos, reservas] = await Promise.all([
    prisma.horarioAreaComun.findMany({ where: { areaId, activo: true }, select: { ...CAMPOS_HORARIO } }),
    prisma.bloqueoAreaComun.findMany({
      where: { areaId, fecha: { gte: util.fechaParaGuardar(rango.desde), lte: util.fechaParaGuardar(rango.hasta) } },
    }),
    prisma.reservaAreaComun.findMany({
      where: {
        areaId,
        estado: "RESERVADA",
        vigente: true,
        fecha: { gte: util.fechaParaGuardar(rango.desde), lte: util.fechaParaGuardar(rango.hasta) },
      },
      select: { areaId: true, fecha: true, horaInicio: true, horaFin: true, estado: true, vigente: true },
    }),
  ]);

  return {
    area: { id: area.id, nombre: area.nombre, activa: area.activa },
    desde: rango.desde,
    hasta: rango.hasta,
    dias: util.construirDisponibilidad({ area, horarios, reservas, bloqueos, ...rango, ahora }),
  };
}

// ---------------------------------------------------------------- reservar y cancelar

/**
 * Reserva un turno para un copropietario. Orden de las comprobaciones: datos (400) -> area y turno
 * (404/400) -> turno libre (409 TURNO_NO_DISPONIBLE) -> al dia con sus pagos (409 NO_AL_DIA) -> crear.
 * La garantia final contra la doble reserva es la restriccion unica reserva_area_unica (P2002).
 */
async function reservar({ areaId, copropietarioId, fecha, horaInicio, horaFin, actorId, ip, ahora = new Date() }) {
  const fechaIso = util.validarFecha(fecha, "fecha");
  util.validarFranja({ horaInicio, horaFin });
  util.validarVentana(fechaIso, ahora);

  const area = await exigirArea(areaId);
  if (!area.activa) {
    throw errorHttp("El area no esta disponible", 409, { codigo: "TURNO_NO_DISPONIBLE", detalle: { motivo: "AREA_INACTIVA" } });
  }

  const horarios = await prisma.horarioAreaComun.findMany({ where: { areaId, activo: true }, select: CAMPOS_HORARIO });
  const turno = util.buscarTurno(horarios, fechaIso, { horaInicio, horaFin });
  if (!turno) {
    throw errorHttp("Ese turno no existe: use exactamente las horas de un horario del area para ese dia", 400, {
      codigo: "TURNO_INEXISTENTE",
      detalle: { turnosDelDia: util.turnosDelDia(horarios, fechaIso) },
    });
  }
  if (util.turnoYaEmpezado({ fecha: fechaIso, horaInicio }, ahora)) {
    throw errorHttp("El turno ya empezo", 409, { codigo: "TURNO_NO_DISPONIBLE", detalle: { motivo: "TURNO_INICIADO" } });
  }

  const fechaGuardada = util.fechaParaGuardar(fechaIso);
  const [bloqueos, ocupada] = await Promise.all([
    prisma.bloqueoAreaComun.findMany({ where: { areaId, fecha: fechaGuardada } }),
    prisma.reservaAreaComun.findFirst({
      where: { areaId, fecha: fechaGuardada, horaInicio, estado: "RESERVADA", vigente: true },
      select: { id: true },
    }),
  ]);
  const bloqueo = bloqueos.find((b) => util.bloqueoCubreTurno(b, turno));
  if (bloqueo) {
    throw errorHttp("El area esta bloqueada en ese turno", 409, {
      codigo: "TURNO_NO_DISPONIBLE",
      detalle: { motivo: "BLOQUEADO", motivoBloqueo: bloqueo.motivo },
    });
  }
  if (ocupada) throw turnoOcupado();

  const estado = await estaAlDia(copropietarioId);
  if (!estado.alDia) {
    throw errorHttp("Debe estar al dia con sus pagos para reservar un area comun", 409, {
      codigo: "NO_AL_DIA",
      datos: { deudaVencida: estado.deudaVencida, detalle: estado.detalle },
    });
  }

  let reserva;
  try {
    reserva = await prisma.reservaAreaComun.create({
      data: { areaId, copropietarioId, fecha: fechaGuardada, horaInicio, horaFin },
      include: INCLUIR_RESERVA,
    });
  } catch (err) {
    if (util.esViolacionUnica(err)) throw turnoOcupado();
    throw err;
  }

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "ReservaAreaComun",
    entidadId: reserva.id,
    detalle: { area: area.nombre, copropietarioId, fecha: fechaIso, horaInicio, horaFin },
    ip,
  });
  return util.formatearReserva(reserva);
}

function turnoOcupado() {
  return errorHttp("Ese turno ya esta reservado", 409, { codigo: "TURNO_NO_DISPONIBLE", detalle: { motivo: "RESERVADO" } });
}

/**
 * Cancela una reserva (estado CANCELADA, vigente NULL). El copropietario solo cancela las suyas y antes de
 * que empiece el turno; el ADMINISTRADOR cancela cualquiera y debe indicar el motivo.
 */
async function cancelar(reservaId, { motivo, rol, actorId, copropietarioId, ip, ahora = new Date() }) {
  const admin = esAdministrador(rol);
  const motivoLimpio = util.validarMotivoCancelacion(motivo, { obligatorio: admin });

  const reserva = await prisma.reservaAreaComun.findUnique({ where: { id: reservaId }, include: INCLUIR_RESERVA });
  if (!reserva) throw errorHttp("Reserva no encontrada", 404);
  if (!admin && reserva.copropietarioId !== copropietarioId) {
    throw errorHttp("Solo puede cancelar sus propias reservas", 403, { codigo: "RESERVA_AJENA" });
  }
  if (reserva.estado === "CANCELADA") {
    throw errorHttp("La reserva ya estaba cancelada", 409, { codigo: "YA_CANCELADA" });
  }
  if (!admin && util.turnoYaEmpezado({ fecha: util.fechaIsoDe(reserva.fecha), horaInicio: reserva.horaInicio }, ahora)) {
    throw errorHttp("El turno ya empezo: no se puede cancelar", 409, { codigo: "TURNO_INICIADO" });
  }

  // Condicionada al estado actual: si otra peticion la cancelo en medio, no se cancela dos veces.
  const { count } = await prisma.reservaAreaComun.updateMany({
    where: { id: reservaId, estado: "RESERVADA", vigente: true },
    data: { estado: "CANCELADA", vigente: null, canceladaEn: ahora, motivoCancelacion: motivoLimpio },
  });
  if (count === 0) throw errorHttp("La reserva ya estaba cancelada", 409, { codigo: "YA_CANCELADA" });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CANCEL",
    entidad: "ReservaAreaComun",
    entidadId: reservaId,
    detalle: {
      area: reserva.area.nombre,
      copropietarioId: reserva.copropietarioId,
      fecha: util.fechaIsoDe(reserva.fecha),
      horaInicio: reserva.horaInicio,
      horaFin: reserva.horaFin,
      motivo: motivoLimpio,
      comoAdministrador: admin,
    },
    ip,
  });

  return util.formatearReserva({ ...reserva, estado: "CANCELADA", vigente: null, canceladaEn: ahora, motivoCancelacion: motivoLimpio });
}

/** Reservas del copropietario: las proximas primero y luego las pasadas. */
async function misReservas(copropietarioId, { estado, ahora = new Date() } = {}) {
  const estadoValido = util.validarEstadoReserva(estado);
  const reservas = await prisma.reservaAreaComun.findMany({
    where: { copropietarioId, ...(estadoValido ? { estado: estadoValido } : {}) },
    include: INCLUIR_RESERVA,
  });
  return util.ordenarMisReservas(reservas, ahora).map(util.formatearReserva);
}

/** Todas las reservas (ADMINISTRADOR), filtrables por area, fecha y estado. */
async function listarReservas({ areaId, fecha, estado } = {}) {
  const estadoValido = util.validarEstadoReserva(estado);
  const fechaIso = fecha ? util.validarFecha(fecha, "fecha") : null;
  const reservas = await prisma.reservaAreaComun.findMany({
    where: {
      ...(areaId ? { areaId } : {}),
      ...(fechaIso ? { fecha: util.fechaParaGuardar(fechaIso) } : {}),
      ...(estadoValido ? { estado: estadoValido } : {}),
    },
    include: INCLUIR_RESERVA,
    orderBy: [{ fecha: "desc" }, { horaInicio: "asc" }],
  });
  return reservas.map(util.formatearReserva);
}

// ---------------------------------------------------------------- administracion

async function crearArea(datos, { actorId, ip }) {
  const data = util.validarArea(datos);
  let area;
  try {
    area = await prisma.areaComun.create({ data, select: CAMPOS_AREA });
  } catch (err) {
    if (util.esViolacionUnica(err)) throw errorHttp("Ya existe un area con ese nombre", 409, { codigo: "NOMBRE_DUPLICADO" });
    throw err;
  }
  await registrarAuditoria({ usuarioId: actorId, accion: "CREATE", entidad: "AreaComun", entidadId: area.id, detalle: { nombre: area.nombre }, ip });
  return area;
}

async function actualizarArea(id, datos, { actorId, ip }) {
  const data = util.validarArea(datos, { parcial: true });
  const antes = await exigirArea(id);
  let area;
  try {
    area = await prisma.areaComun.update({ where: { id }, data, select: CAMPOS_AREA });
  } catch (err) {
    if (util.esViolacionUnica(err)) throw errorHttp("Ya existe un area con ese nombre", 409, { codigo: "NOMBRE_DUPLICADO" });
    throw err;
  }
  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "AreaComun",
    entidadId: id,
    detalle: { antes: Object.fromEntries(Object.keys(data).map((c) => [c, antes[c]])), despues: data },
    ip,
  });
  return area;
}

async function exigirHorarioLibre(areaId, horario, ignorarId = null) {
  const existentes = await prisma.horarioAreaComun.findMany({
    where: { areaId, diaSemana: horario.diaSemana },
    select: { id: true, diaSemana: true, horaInicio: true, horaFin: true },
  });
  if (util.hayHorarioSolapado(horario, existentes, ignorarId)) {
    throw errorHttp("El horario se solapa con otro horario del area en ese dia", 409, { codigo: "HORARIO_SOLAPADO" });
  }
}

async function crearHorario(areaId, datos, { actorId, ip }) {
  const horario = util.validarHorario(datos ?? {});
  await exigirArea(areaId);
  await exigirHorarioLibre(areaId, horario);
  let creado;
  try {
    creado = await prisma.horarioAreaComun.create({ data: { areaId, ...horario }, select: CAMPOS_HORARIO });
  } catch (err) {
    if (util.esViolacionUnica(err)) throw errorHttp("Ya existe un horario con esa hora de inicio en ese dia", 409, { codigo: "HORARIO_SOLAPADO" });
    throw err;
  }
  await registrarAuditoria({ usuarioId: actorId, accion: "CREATE", entidad: "HorarioAreaComun", entidadId: creado.id, detalle: { areaId, ...horario }, ip });
  return creado;
}

async function exigirHorario(areaId, horarioId) {
  const horario = await prisma.horarioAreaComun.findFirst({ where: { id: horarioId, areaId }, select: CAMPOS_HORARIO });
  if (!horario) throw errorHttp("Horario no encontrado", 404);
  return horario;
}

async function actualizarHorario(areaId, horarioId, datos = {}, { actorId, ip }) {
  const actual = await exigirHorario(areaId, horarioId);
  const horario = util.validarHorario({
    diaSemana: datos.diaSemana ?? actual.diaSemana,
    horaInicio: datos.horaInicio ?? actual.horaInicio,
    horaFin: datos.horaFin ?? actual.horaFin,
  });
  if (datos.activo !== undefined && typeof datos.activo !== "boolean") {
    throw errorHttp("activo debe ser verdadero o falso", 400);
  }
  await exigirHorarioLibre(areaId, horario, horarioId);
  let actualizado;
  try {
    actualizado = await prisma.horarioAreaComun.update({
      where: { id: horarioId },
      data: { ...horario, ...(datos.activo !== undefined ? { activo: datos.activo } : {}) },
      select: CAMPOS_HORARIO,
    });
  } catch (err) {
    if (util.esViolacionUnica(err)) throw errorHttp("Ya existe un horario con esa hora de inicio en ese dia", 409, { codigo: "HORARIO_SOLAPADO" });
    throw err;
  }
  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "HorarioAreaComun",
    entidadId: horarioId,
    detalle: { areaId, antes: actual, despues: actualizado },
    ip,
  });
  return actualizado;
}

/** Elimina el horario. Las reservas ya hechas no se tocan (guardan sus propias horas). */
async function eliminarHorario(areaId, horarioId, { actorId, ip }) {
  const actual = await exigirHorario(areaId, horarioId);
  await prisma.horarioAreaComun.delete({ where: { id: horarioId } });
  await registrarAuditoria({ usuarioId: actorId, accion: "DELETE", entidad: "HorarioAreaComun", entidadId: horarioId, detalle: { areaId, ...actual }, ip });
}

async function listarBloqueos(areaId, { desde, hasta } = {}) {
  await exigirArea(areaId);
  const rango = desde || hasta ? util.validarRangoDisponibilidad({ desde, hasta }) : null;
  const bloqueos = await prisma.bloqueoAreaComun.findMany({
    where: {
      areaId,
      ...(rango ? { fecha: { gte: util.fechaParaGuardar(rango.desde), lte: util.fechaParaGuardar(rango.hasta) } } : {}),
    },
    orderBy: [{ fecha: "asc" }, { horaInicio: "asc" }],
  });
  return bloqueos.map(formatearBloqueo);
}

/**
 * Crea un bloqueo. Si coincide con reservas vigentes responde 409 con esa lista: no las cancela; el
 * administrador decide (las cancela una por una y vuelve a bloquear).
 */
async function crearBloqueo(areaId, datos, { actorId, ip }) {
  const bloqueo = util.validarBloqueo(datos ?? {});
  await exigirArea(areaId);
  const fecha = util.fechaParaGuardar(bloqueo.fecha);

  const vigentes = await prisma.reservaAreaComun.findMany({
    where: { areaId, fecha, estado: "RESERVADA", vigente: true },
    include: INCLUIR_RESERVA,
  });
  const enConflicto = util.reservasEnConflicto({ ...bloqueo, areaId, fecha }, vigentes);
  if (enConflicto.length > 0) {
    throw errorHttp("El bloqueo coincide con reservas vigentes: cancelelas antes de bloquear", 409, {
      codigo: "RESERVAS_EN_CONFLICTO",
      datos: { reservas: enConflicto.map(util.formatearReserva) },
    });
  }

  const creado = await prisma.bloqueoAreaComun.create({ data: { areaId, ...bloqueo, fecha, creadoPorId: actorId } });
  await registrarAuditoria({ usuarioId: actorId, accion: "CREATE", entidad: "BloqueoAreaComun", entidadId: creado.id, detalle: { areaId, ...bloqueo }, ip });
  return formatearBloqueo(creado);
}

async function eliminarBloqueo(areaId, bloqueoId, { actorId, ip }) {
  const actual = await prisma.bloqueoAreaComun.findFirst({ where: { id: bloqueoId, areaId } });
  if (!actual) throw errorHttp("Bloqueo no encontrado", 404);
  await prisma.bloqueoAreaComun.delete({ where: { id: bloqueoId } });
  await registrarAuditoria({ usuarioId: actorId, accion: "DELETE", entidad: "BloqueoAreaComun", entidadId: bloqueoId, detalle: { areaId, ...formatearBloqueo(actual) }, ip });
}

module.exports = {
  listarAreas,
  obtenerArea,
  disponibilidad,
  reservar,
  cancelar,
  misReservas,
  listarReservas,
  crearArea,
  actualizarArea,
  crearHorario,
  actualizarHorario,
  eliminarHorario,
  listarBloqueos,
  crearBloqueo,
  eliminarBloqueo,
};
