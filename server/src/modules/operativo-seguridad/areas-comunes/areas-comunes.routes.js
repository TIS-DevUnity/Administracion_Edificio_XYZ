const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const { PERMISOS, permitir } = require("../../../middlewares/permisos");
const controller = require("./areas-comunes.controller");

const router = Router();

const LECTURA = permitir("areasComunes", "ver");
const RESERVAR = permitir("areasComunes", "reservar");
const GESTION = permitir("areasComunes", "gestionar");
// Cancelar: el copropietario las suyas y el administrador cualquiera (el servicio distingue).
const CANCELAR = autorizar(...PERMISOS.areasComunes.reservar, ...PERMISOS.areasComunes.gestionar);

/**
 * @openapi
 * /api/areas-comunes:
 *   get:
 *     summary: Areas comunes activas, con sus horarios activos
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ areas: [{ id, nombre, descripcion, condiciones, activa, horarios }] }" }
 *   post:
 *     summary: Crea un area comun (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string, maxLength: 100, example: "Salon de eventos" }
 *               descripcion: { type: string, maxLength: 2000 }
 *               condiciones: { type: string, maxLength: 2000 }
 *               activa: { type: boolean, default: true }
 *     responses:
 *       201: { description: Area creada }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: "NOMBRE_DUPLICADO" }
 */
router.get("/", autenticar, LECTURA, controller.listarAreas);
router.post("/", autenticar, GESTION, controller.crearArea);

/**
 * @openapi
 * /api/areas-comunes/mis-reservas:
 *   get:
 *     summary: Reservas del copropietario autenticado, las proximas primero (solo CONSULTA)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [RESERVADA, CANCELADA] }
 *     responses:
 *       200: { description: "{ reservas: [...] }" }
 *       400: { description: Estado invalido }
 *       403: { description: Sin permisos o usuario sin copropietario vinculado }
 */
router.get("/mis-reservas", autenticar, RESERVAR, controller.misReservas);

/**
 * @openapi
 * /api/areas-comunes/reservas:
 *   get:
 *     summary: Todas las reservas (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: areaId, schema: { type: string } }
 *       - { in: query, name: fecha, schema: { type: string, example: "2026-12-05" } }
 *       - { in: query, name: estado, schema: { type: string, enum: [RESERVADA, CANCELADA] } }
 *     responses:
 *       200: { description: "{ reservas: [...] }" }
 *       400: { description: Fecha o estado invalidos }
 *       403: { description: Sin permisos }
 */
router.get("/reservas", autenticar, GESTION, controller.listarReservas);

/**
 * @openapi
 * /api/areas-comunes/reservas/{reservaId}/cancelar:
 *   post:
 *     summary: Cancela una reserva. El copropietario solo las suyas y antes de que empiece el turno; el ADMINISTRADOR cualquiera, con motivo obligatorio
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: reservaId, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo: { type: string, maxLength: 500, description: "Opcional para el copropietario, obligatorio para el administrador" }
 *     responses:
 *       200: { description: Reserva cancelada }
 *       400: { description: "MOTIVO_REQUERIDO (administrador sin motivo)" }
 *       403: { description: "RESERVA_AJENA" }
 *       404: { description: Reserva no encontrada }
 *       409: { description: "YA_CANCELADA o TURNO_INICIADO" }
 */
router.post("/reservas/:reservaId/cancelar", autenticar, CANCELAR, controller.cancelar);

/**
 * @openapi
 * /api/areas-comunes/{id}:
 *   get:
 *     summary: Area con sus horarios y condiciones. Quien no es ADMINISTRADOR solo ve areas activas y horarios activos
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ area }" }
 *       404: { description: Area no encontrada }
 *   put:
 *     summary: Edita un area, incluida su bandera activa (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string, nullable: true }
 *               condiciones: { type: string, nullable: true }
 *               activa: { type: boolean }
 *     responses:
 *       200: { description: Area actualizada }
 *       400: { description: Datos invalidos }
 *       404: { description: Area no encontrada }
 *       409: { description: "NOMBRE_DUPLICADO" }
 */
router.get("/:id", autenticar, LECTURA, controller.obtenerArea);
router.put("/:id", autenticar, GESTION, controller.actualizarArea);

/**
 * @openapi
 * /api/areas-comunes/{id}/disponibilidad:
 *   get:
 *     summary: Calendario de turnos por dia con estado DISPONIBLE, RESERVADO, BLOQUEADO o PASADO (maximo 31 dias)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: desde, required: true, schema: { type: string, example: "2026-12-01" } }
 *       - { in: query, name: hasta, required: true, schema: { type: string, example: "2026-12-31" } }
 *     responses:
 *       200: { description: "{ area, desde, hasta, dias: [{ fecha, diaSemana, turnos: [{ horaInicio, horaFin, estado }] }] }" }
 *       400: { description: "Fechas invalidas, desde > hasta o rango de mas de 31 dias" }
 *       404: { description: Area no encontrada }
 */
router.get("/:id/disponibilidad", autenticar, LECTURA, controller.disponibilidad);

/**
 * @openapi
 * /api/areas-comunes/{id}/reservas:
 *   post:
 *     summary: Reserva un turno del area (solo CONSULTA). Las horas deben ser exactamente las de un horario activo de ese dia; hasta 60 dias de anticipacion
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, horaInicio, horaFin]
 *             properties:
 *               fecha: { type: string, example: "2026-12-05" }
 *               horaInicio: { type: string, example: "14:00" }
 *               horaFin: { type: string, example: "18:00" }
 *     responses:
 *       201: { description: "{ reserva }" }
 *       400: { description: "FECHA_INVALIDA, HORA_INVALIDA, FECHA_PASADA, FUERA_DE_VENTANA o TURNO_INEXISTENTE" }
 *       403: { description: Sin permisos o usuario sin copropietario vinculado }
 *       404: { description: Area no encontrada }
 *       409: { description: "TURNO_NO_DISPONIBLE, o NO_AL_DIA (con deudaVencida y detalle)" }
 */
router.post("/:id/reservas", autenticar, RESERVAR, controller.reservar);

/**
 * @openapi
 * /api/areas-comunes/{id}/horarios:
 *   post:
 *     summary: Agrega un horario semanal al area (solo ADMINISTRADOR). Cada horario activo es un turno reservable
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diaSemana, horaInicio, horaFin]
 *             properties:
 *               diaSemana: { type: integer, minimum: 0, maximum: 6, description: "0 = domingo ... 6 = sabado" }
 *               horaInicio: { type: string, example: "08:00" }
 *               horaFin: { type: string, example: "12:00" }
 *     responses:
 *       201: { description: "{ horario }" }
 *       400: { description: Datos invalidos }
 *       404: { description: Area no encontrada }
 *       409: { description: "HORARIO_SOLAPADO" }
 */
router.post("/:id/horarios", autenticar, GESTION, controller.crearHorario);

/**
 * @openapi
 * /api/areas-comunes/{id}/horarios/{horarioId}:
 *   put:
 *     summary: Edita un horario (solo ADMINISTRADOR); `activo` lo activa o desactiva
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: horarioId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               diaSemana: { type: integer, minimum: 0, maximum: 6 }
 *               horaInicio: { type: string }
 *               horaFin: { type: string }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: "{ horario }" }
 *       400: { description: Datos invalidos }
 *       404: { description: Horario no encontrado }
 *       409: { description: "HORARIO_SOLAPADO" }
 *   delete:
 *     summary: Elimina un horario (solo ADMINISTRADOR). Las reservas ya hechas no se modifican
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: horarioId, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Eliminado }
 *       404: { description: Horario no encontrado }
 */
router.put("/:id/horarios/:horarioId", autenticar, GESTION, controller.actualizarHorario);
router.delete("/:id/horarios/:horarioId", autenticar, GESTION, controller.eliminarHorario);

/**
 * @openapi
 * /api/areas-comunes/{id}/bloqueos:
 *   get:
 *     summary: Bloqueos del area, opcionalmente en un rango de fechas (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: desde, schema: { type: string } }
 *       - { in: query, name: hasta, schema: { type: string } }
 *     responses:
 *       200: { description: "{ bloqueos: [{ id, fecha, horaInicio, horaFin, motivo }] }" }
 *   post:
 *     summary: Bloquea el area un dia (sin horas) o una franja (con horaInicio y horaFin) (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, motivo]
 *             properties:
 *               fecha: { type: string, example: "2026-12-05" }
 *               horaInicio: { type: string, nullable: true }
 *               horaFin: { type: string, nullable: true }
 *               motivo: { type: string, maxLength: 500, example: "Mantenimiento" }
 *     responses:
 *       201: { description: "{ bloqueo }" }
 *       400: { description: Datos invalidos }
 *       404: { description: Area no encontrada }
 *       409: { description: "RESERVAS_EN_CONFLICTO: coincide con reservas vigentes (se devuelven en `reservas`, no se cancelan)" }
 */
router.get("/:id/bloqueos", autenticar, GESTION, controller.listarBloqueos);
router.post("/:id/bloqueos", autenticar, GESTION, controller.crearBloqueo);

/**
 * @openapi
 * /api/areas-comunes/{id}/bloqueos/{bloqueoId}:
 *   delete:
 *     summary: Elimina un bloqueo (solo ADMINISTRADOR)
 *     tags: [Areas comunes]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: bloqueoId, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Eliminado }
 *       404: { description: Bloqueo no encontrado }
 */
router.delete("/:id/bloqueos/:bloqueoId", autenticar, GESTION, controller.eliminarBloqueo);

module.exports = router;
