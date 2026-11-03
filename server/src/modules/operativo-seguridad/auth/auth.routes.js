const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const { limitarLogin } = require("../../../middlewares/login-limiter");
const controller = require("./auth.controller");

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Autentica un usuario y devuelve un JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login exitoso }
 *       401: { description: Credenciales invalidas }
 *       429: { description: Demasiados intentos fallidos; reintentar en 15 minutos }
 */
router.post("/login", limitarLogin, controller.login);

/**
 * @openapi
 * /api/auth/perfil:
 *   get:
 *     summary: Devuelve los datos del usuario autenticado (ruta protegida de prueba)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { description: No autenticado }
 */
router.get("/perfil", autenticar, controller.perfil);

/**
 * @openapi
 * /api/auth/solo-admin:
 *   get:
 *     summary: Ruta de prueba de RBAC, solo accesible por rol ADMINISTRADOR
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 */
router.get("/solo-admin", autenticar, autorizar("ADMINISTRADOR"), (req, res) => {
  res.json({ mensaje: "Acceso concedido a ADMINISTRADOR", usuario: req.usuario });
});

module.exports = router;
