const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const controller = require("./inmuebles.controller");

const router = Router();

const GESTION = autorizar("ADMINISTRADOR", "DIRECTORIO");
const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO", "CONSULTA");

/**
 * @openapi
 * /api/inmuebles:
 *   get:
 *     summary: Lista todos los inmuebles (departamentos, parqueos, bauleras)
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Registra un nuevo inmueble
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               codigo: { type: string }
 *               tipoInmuebleId: { type: string, description: "id de un registro en /api/tipos-inmueble" }
 *               piso: { type: string }
 *               areaM2: { type: number }
 *     responses:
 *       201: { description: Inmueble creado }
 *       400: { description: Datos invalidos }
 *       404: { description: Tipo de inmueble no encontrado }
 *       409: { description: Codigo ya registrado }
 */
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/inmuebles/{id}:
 *   get:
 *     summary: Obtiene un inmueble por id
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Inmueble no encontrado }
 *   put:
 *     summary: Actualiza datos de un inmueble
 *     tags: [Inmuebles]
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
 *               codigo: { type: string }
 *               tipoInmuebleId: { type: string, description: "id de un registro en /api/tipos-inmueble" }
 *               piso: { type: string }
 *               areaM2: { type: number }
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Inmueble actualizado }
 *       404: { description: Inmueble o tipo de inmueble no encontrado }
 *       409: { description: Codigo ya registrado }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);
router.put("/:id", autenticar, GESTION, controller.actualizar);

/**
 * @openapi
 * /api/inmuebles/{id}/ocupantes:
 *   get:
 *     summary: Historial de ocupantes (propietarios/inquilinos) de un inmueble
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Inmueble no encontrado }
 *   post:
 *     summary: Asigna un copropietario (propietario o inquilino) a un inmueble. Si ya habia un ocupante activo del mismo tipo (propietario/inquilino), se cierra automaticamente su fechaFin.
 *     tags: [Inmuebles]
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
 *               copropietarioId: { type: string }
 *               esPropietario: { type: boolean }
 *               fechaInicio: { type: string, format: date-time }
 *     responses:
 *       201: { description: Ocupante asignado }
 *       404: { description: Inmueble o copropietario no encontrado }
 */
router.get("/:id/ocupantes", autenticar, LECTURA, controller.listarOcupantes);
router.post("/:id/ocupantes", autenticar, GESTION, controller.asignarOcupante);

/**
 * @openapi
 * /api/inmuebles/{id}/ocupantes/{ocupanteId}:
 *   patch:
 *     summary: Da de baja a un ocupante (marca fechaFin)
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: ocupanteId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fechaFin: { type: string, format: date-time, description: "Fecha de desocupacion. Si no se envia, se usa la fecha actual." }
 *     responses:
 *       200: { description: Ocupante dado de baja }
 *       400: { description: fechaFin invalida o anterior a la fecha de inicio }
 *       404: { description: Ocupante no encontrado }
 *       409: { description: El ocupante ya fue dado de baja }
 */
router.patch("/:id/ocupantes/:ocupanteId", autenticar, GESTION, controller.darDeBajaOcupante);

module.exports = router;
