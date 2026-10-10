const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const controller = require("./copropietarios.controller");

const router = Router();

const GESTION = autorizar("ADMINISTRADOR", "DIRECTORIO");
const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO", "CONSULTA");

/**
 * @openapi
 * /api/copropietarios:
 *   get:
 *     summary: Lista todos los copropietarios
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
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/copropietarios/{id}:
 *   get:
 *     summary: Obtiene un copropietario por id
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
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
router.get("/:id", autenticar, LECTURA, controller.obtener);
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
 *       Una persona puede tener un departamento sin baulera ni parqueo, o solo un parqueo; cada
 *       inmueble aparece por separado.
 *     tags: [Copropietarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ copropietario, vigentes, anteriores, resumen }" }
 *       404: { description: Copropietario no encontrado }
 */
router.get("/:id/inmuebles", autenticar, LECTURA, controller.listarInmuebles);

module.exports = router;
