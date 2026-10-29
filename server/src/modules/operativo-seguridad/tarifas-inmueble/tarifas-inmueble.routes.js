const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { permitir } = require("../../../middlewares/permisos");
const controller = require("./tarifas-inmueble.controller");

const router = Router();

const LECTURA = permitir("tarifasInmueble", "ver");
const GESTION = permitir("tarifasInmueble", "gestionar");

/**
 * @openapi
 * /api/tarifas-inmueble:
 *   get:
 *     summary: Lista la tarifa mensual general de baulera y parqueo
 *     description: |
 *       Es la cuota que paga cada baulera y cada parqueo que no tenga un monto propio
 *       (`cuotaMensual` en el inmueble). Se suma a la expensa del departamento de quien los
 *       ocupa. Una clase sin definir (`definida: false`) vale 0 y no se cobra.
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "OK: { tarifas: [{ clase, monto, definida, updatedAt }] }" }
 */
router.get("/", autenticar, LECTURA, controller.listar);

/**
 * @openapi
 * /api/tarifas-inmueble/{clase}:
 *   put:
 *     summary: Define o edita la tarifa mensual de una clase (solo ADMINISTRADOR)
 *     description: |
 *       Rige desde la proxima expensa que se genere; las expensas ya generadas no cambian.
 *       Un monto de 0 deja a la clase sin cobro. Cada cambio queda en la auditoria.
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: clase
 *         required: true
 *         schema: { type: string, enum: [PARQUEO, BAULERA] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto]
 *             properties:
 *               monto: { type: number, example: 50, description: "0 o mas, maximo 2 decimales" }
 *     responses:
 *       200: { description: Tarifa actualizada }
 *       400: { description: Clase o monto invalidos }
 *       403: { description: Sin permisos }
 */
router.put("/:clase", autenticar, GESTION, controller.actualizar);

module.exports = router;
