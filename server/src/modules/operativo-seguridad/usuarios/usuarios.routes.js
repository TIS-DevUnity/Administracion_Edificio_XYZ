const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { permitir } = require("../../../middlewares/permisos");
const controller = require("./usuarios.controller");

const router = Router();

const GESTION = permitir("usuarios", "gestionar");
const CONSULTA = permitir("usuarios", "ver");

/**
 * @openapi
 * /api/usuarios:
 *   get:
 *     summary: Lista todos los usuarios del sistema
 *     tags: [Usuarios]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 *   post:
 *     summary: Crea un nuevo usuario (solo ADMINISTRADOR)
 *     tags: [Usuarios]
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
 *               email: { type: string }
 *               password: { type: string }
 *               rol: { type: string, enum: [ADMINISTRADOR, DIRECTORIO, CONSULTA] }
 *               copropietarioId: { type: string, nullable: true, description: "Copropietario al que se vincula el usuario (lo que ve el rol CONSULTA)" }
 *     responses:
 *       201: { description: Usuario creado }
 *       400: { description: Datos invalidos }
 *       409: { description: Email ya registrado }
 */
router.get("/", autenticar, CONSULTA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/usuarios/{id}:
 *   get:
 *     summary: Obtiene un usuario por id
 *     tags: [Usuarios]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Usuario no encontrado }
 *   put:
 *     summary: Actualiza datos de un usuario (solo ADMINISTRADOR)
 *     tags: [Usuarios]
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
 *               email: { type: string }
 *               rol: { type: string, enum: [ADMINISTRADOR, DIRECTORIO, CONSULTA] }
 *               copropietarioId: { type: string, nullable: true, description: "Vincula (id) o desvincula (null) al copropietario; si no se envia, no cambia" }
 *     responses:
 *       200: { description: Usuario actualizado }
 *       404: { description: Usuario no encontrado }
 */
router.get("/:id", autenticar, CONSULTA, controller.obtener);
router.put("/:id", autenticar, GESTION, controller.actualizar);

/**
 * @openapi
 * /api/usuarios/{id}/estado:
 *   patch:
 *     summary: Activa o desactiva un usuario (solo ADMINISTRADOR)
 *     tags: [Usuarios]
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
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Estado actualizado }
 *       404: { description: Usuario no encontrado }
 */
router.patch("/:id/estado", autenticar, GESTION, controller.cambiarEstado);

module.exports = router;
