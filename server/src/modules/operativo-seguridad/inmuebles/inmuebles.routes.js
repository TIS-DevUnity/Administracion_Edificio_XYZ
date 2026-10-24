const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { permitir } = require("../../../middlewares/permisos");
const controller = require("./inmuebles.controller");

const router = Router();

const GESTION = permitir("inmuebles", "gestionar");
const LECTURA = permitir("inmuebles", "ver");

/**
 * @openapi
 * /api/inmuebles:
 *   get:
 *     summary: Lista todos los inmuebles (departamentos, parqueos, bauleras)
 *     description: |
 *       Cada inmueble trae `clase` (DEPARTAMENTO, BAULERA o PARQUEO) y `asignado` (tiene un
 *       ocupante vigente). Solo el departamento tiene tipo (A, B, C...). En baulera y parqueo
 *       `tipoInmuebleId` es null y `tipoInmueble` es un objeto de compatibilidad con la clase
 *       como nombre y monto 0.
 *
 *       `cargoMensual` es lo que el inmueble suma cada mes a la cuenta de quien lo ocupa: la
 *       expensa fija del tipo en un departamento; en baulera y parqueo su `cuotaMensual`
 *       propia o, si no tiene (null), la tarifa de su clase (`/api/tarifas-inmueble`).
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Registra un nuevo inmueble
 *     description: |
 *       Un departamento (clase por defecto) requiere `tipoInmuebleId`. Una baulera o un parqueo
 *       no tienen tipo: no se debe enviar `tipoInmuebleId`. Opcionalmente una baulera o un
 *       parqueo puede llevar `cuotaMensual` propia, que reemplaza a la tarifa de su clase.
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo]
 *             properties:
 *               codigo: { type: string }
 *               clase: { type: string, enum: [DEPARTAMENTO, BAULERA, PARQUEO], default: DEPARTAMENTO }
 *               tipoInmuebleId: { type: string, description: "Solo departamentos: id de un registro en /api/tipos-inmueble" }
 *               piso: { type: string }
 *               areaM2: { type: number }
 *               cuotaMensual: { type: number, nullable: true, description: "Solo baulera y parqueo. Monto propio mensual (0 = exento). Sin valor usa la tarifa de la clase." }
 *     responses:
 *       201: { description: Inmueble creado }
 *       400: { description: Datos invalidos (falta el tipo de un departamento, se envio tipo a una baulera o parqueo, o cuotaMensual en un departamento o invalida) }
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
 *               clase: { type: string, enum: [DEPARTAMENTO, BAULERA, PARQUEO] }
 *               tipoInmuebleId: { type: string, description: "Solo departamentos: id de un registro en /api/tipos-inmueble. Al pasar a baulera o parqueo el tipo se quita." }
 *               piso: { type: string }
 *               areaM2: { type: number }
 *               activo: { type: boolean }
 *               cuotaMensual: { type: number, nullable: true, description: "Solo baulera y parqueo. Monto propio mensual (0 = exento); null lo quita y vuelve a la tarifa de la clase. Rige desde la proxima expensa." }
 *     responses:
 *       200: { description: Inmueble actualizado }
 *       400: { description: Datos invalidos (un departamento necesita tipo; baulera y parqueo no lo tienen) }
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
 *       409: { description: "El inmueble esta inactivo (codigo INMUEBLE_INACTIVO) o la persona ya esta asociada con esa misma relacion (codigo ASOCIACION_DUPLICADA)" }
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
