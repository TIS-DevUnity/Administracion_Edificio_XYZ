const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./empleados.controller')

const router = Router()

// Empleados: GESTION registra y cambia; SUPERVISION solo consulta; CONSULTA no tiene acceso.
const GESTION = autorizar('ADMINISTRADOR')
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/empleados:
 *   post:
 *     summary: Registra un empleado del edificio (solo ADMINISTRADOR)
 *     description: |
 *       Todos los campos son obligatorios y los textos se guardan sin espacios sobrantes. El documento se guarda
 *       en mayusculas y no puede repetirse (409 DOCUMENTO_DUPLICADO). `sueldoBase` debe ser mayor que cero y
 *       `fechaIngreso` no puede ser futura (400 FECHA_INGRESO_INVALIDA). El empleado nace en estado ACTIVO.
 *     tags: [Empleados]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombres, apellidos, documento, cargo, fechaIngreso, telefono, sueldoBase]
 *             properties:
 *               nombres: { type: string, example: Juan Carlos }
 *               apellidos: { type: string, example: Mamani Quispe }
 *               documento: { type: string, example: 1234567 LP }
 *               cargo: { type: string, example: Conserje }
 *               fechaIngreso: { type: string, format: date, example: "2026-03-01" }
 *               telefono: { type: string, example: "+591 71234567" }
 *               sueldoBase: { type: number, example: 2500.50 }
 *     responses:
 *       201: { description: "{ empleado, mensaje }" }
 *       400: { description: "Campos faltantes (CAMPOS_OBLIGATORIOS), sueldo o telefono invalidos, o fecha invalida (FECHA_INGRESO_INVALIDA)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       409: { description: "Ya existe un empleado con ese documento (DOCUMENTO_DUPLICADO)" }
 *   get:
 *     summary: Lista los empleados con cargo, sueldo base y estado (solo ADMINISTRADOR y DIRECTORIO)
 *     description: Ordenados por apellidos y luego nombres. Paginado (50 por pagina por defecto, maximo 200).
 *     tags: [Empleados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [ACTIVO, INACTIVO] }
 *       - in: query
 *         name: q
 *         description: Busca en nombres, apellidos, documento y cargo, sin distinguir mayusculas
 *         schema: { type: string, example: mamani }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200: { description: "{ empleados: [{ id, nombres, apellidos, documento, cargo, fechaIngreso, telefono, sueldoBase, estado, estadoEtiqueta }], paginacion }" }
 *       400: { description: Estado invalido }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.post('/', autenticar, GESTION, controller.crear)
router.get('/', autenticar, SUPERVISION, controller.listar)

/**
 * @openapi
 * /api/financiero/empleados/{id}:
 *   get:
 *     summary: Detalle de un empleado con su resumen salarial (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Incluye la cantidad de nominas, el total de anticipos pendientes de descuento (monto menos lo ya
 *       descontado, en anticipos PENDIENTE o PARCIAL) y las ultimas 6 nominas.
 *     tags: [Empleados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ empleado, resumen: { cantidadNominas, anticiposPendientes, cantidadAnticiposPendientes, ultimasNominas: [{ id, periodo, sueldoNeto, estado }] } }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Empleado no encontrado }
 *   put:
 *     summary: Edita los datos de un empleado (solo ADMINISTRADOR)
 *     description: |
 *       Envie solo los campos a cambiar (al menos uno); cada uno se valida como en el alta. Un cambio de
 *       `sueldoBase` se aplica a las nominas futuras: las nominas ya generadas conservan el sueldo con el que
 *       se hicieron. La auditoria guarda el sueldo anterior y el nuevo.
 *     tags: [Empleados]
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
 *               nombres: { type: string, example: Juan Carlos }
 *               apellidos: { type: string, example: Mamani Quispe }
 *               documento: { type: string, example: 1234567 LP }
 *               cargo: { type: string, example: Encargado de mantenimiento }
 *               fechaIngreso: { type: string, format: date, example: "2026-03-01" }
 *               telefono: { type: string, example: "+591 71234567" }
 *               sueldoBase: { type: number, example: 2800 }
 *     responses:
 *       200: { description: "{ empleado, mensaje }" }
 *       400: { description: "Ningun campo (SIN_CAMBIOS), campo vacio o dato invalido" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Empleado no encontrado }
 *       409: { description: "Otro empleado ya tiene ese documento (DOCUMENTO_DUPLICADO)" }
 */
router.get('/:id', autenticar, SUPERVISION, controller.obtener)
router.put('/:id', autenticar, GESTION, controller.actualizar)

/**
 * @openapi
 * /api/financiero/empleados/{id}/estado:
 *   patch:
 *     summary: Activa o inactiva a un empleado (solo ADMINISTRADOR)
 *     description: |
 *       Un empleado inactivo no esta disponible para nominas nuevas y conserva todo su historial de pagos.
 *       No existe la eliminacion de empleados. Pedir el estado que ya tiene responde 200 sin cambios.
 *     tags: [Empleados]
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
 *             required: [estado]
 *             properties:
 *               estado: { type: string, enum: [ACTIVO, INACTIVO], example: INACTIVO }
 *     responses:
 *       200: { description: "{ empleado, mensaje }" }
 *       400: { description: Estado invalido }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Empleado no encontrado }
 */
router.patch('/:id/estado', autenticar, GESTION, controller.cambiarEstado)

module.exports = router
