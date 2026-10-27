const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { permitir } = require("../../../middlewares/permisos");
const { soloSuCopropietario } = require("../../../middlewares/acceso-propio");
const controller = require("./copropietarios.controller");

const router = Router();

const GESTION = permitir("copropietarios", "gestionar");
const LECTURA = permitir("copropietarios", "ver");
const LISTAR = permitir("copropietarios", "listar");

/**
 * @openapi
 * /api/copropietarios:
 *   get:
 *     summary: Lista todos los copropietarios (Administrador y Directorio; CONSULTA recibe 403)
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 *   post:
 *     summary: Registra un nuevo copropietario
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               apellido: { type: string }
 *               ci: { type: string }
 *               email: { type: string }
 *               telefono: { type: string }
 *     responses:
 *       201: { description: Copropietario creado }
 *       400: { description: Datos invalidos }
 *       409: { description: CI ya registrado }
 */
router.get("/", autenticar, LISTAR, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/copropietarios/{id}:
 *   get:
 *     summary: Obtiene un copropietario por id (CONSULTA solo puede pedir el suyo; si no, 403)
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: CONSULTA pidiendo informacion de otra persona }
 *       404: { description: Copropietario no encontrado }
 *   put:
 *     summary: Actualiza datos de un copropietario
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               apellido: { type: string }
 *               ci: { type: string }
 *               email: { type: string }
 *               telefono: { type: string }
 *     responses:
 *       200: { description: Copropietario actualizado }
 *       404: { description: Copropietario no encontrado }
 *       409: { description: CI ya registrado }
 */
router.get("/:id", autenticar, LECTURA, soloSuCopropietario(), controller.obtener);
router.put("/:id", autenticar, GESTION, controller.actualizar);

/**
 * @openapi
 * /api/copropietarios/{id}/inmuebles:
 *   get:
 *     summary: Inmuebles de una persona - los que tiene asociados hoy y el historial de asociaciones anteriores
 *     description: |
 *       `vigentes` son las asociaciones en curso y `anteriores` las que ya terminaron. Cada
 *       inmueble trae clase (DEPARTAMENTO, BAULERA, PARQUEO), tipo (A, B, C; solo departamentos),
 *       piso, rol (PROPIETARIO o INQUILINO) y fechas. `resumen` cuenta los vigentes por clase.
 *
 *       Cada inmueble trae `cargoMensual` (lo que suma por mes: expensa fija del tipo en un
 *       departamento; `cuotaMensual` propia o tarifa de la clase en baulera y parqueo) y
 *       `resumen.cargoMensualTotal` suma los vigentes. Es referencial: el cobro real y el
 *       desglose por concepto estan en `GET /api/financiero/copropietarios/{id}/cuenta`.
 *       Una persona puede tener un departamento sin baulera ni parqueo, o solo un parqueo; cada
 *       inmueble aparece por separado.
 *
 *       Apartado "Inmuebles y ocupacion": `departamentos`, `bauleras` y `parqueos` traen solo lo que la
 *       persona ocupa hoy (identificador, piso, tipo A/B/C, `estadoOcupacion`, tipo de relacion `rol` y su
 *       cargo propio); lo que no ocupa no aparece. `resumen` cuenta cuantos tiene de cada clase.
 *       `anteriores` es el historial de ocupacion (ya finalizadas, con fecha de inicio y fin) y
 *       `programadas` las que empiezan mas adelante.
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ copropietario, vigentes, departamentos, bauleras, parqueos, anteriores, programadas, resumen }" }
 *       403: { description: CONSULTA pidiendo informacion de otra persona }
 *       404: { description: Copropietario no encontrado }
 */
router.get("/:id/inmuebles", autenticar, LECTURA, soloSuCopropietario(), controller.listarInmuebles);

module.exports = router;
