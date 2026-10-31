const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./anticipos.controller')

const router = Router()

// Anticipos: GESTION registra; SUPERVISION solo consulta; CONSULTA no tiene acceso.
// Un anticipo no se edita ni se elimina: el egreso ya salio de caja y el historial es inmutable.
const GESTION = autorizar('ADMINISTRADOR')
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/anticipos:
 *   post:
 *     summary: Registra un anticipo salarial a un empleado activo (solo ADMINISTRADOR)
 *     description: |
 *       El anticipo nace PENDIENTE y se descuenta automaticamente en la PROXIMA nomina que se genere para el
 *       empleado (del mas antiguo al mas nuevo, hasta donde alcance el sueldo; el resto sigue pendiente). Un
 *       anticipo registrado despues de generar la nomina de su mes NO modifica esa nomina: queda pendiente para
 *       la siguiente. El empleado debe existir (404) y estar ACTIVO (409 EMPLEADO_INACTIVO). `monto` debe ser
 *       mayor que cero y `fecha` no puede ser futura. `metodoPago`: EFECTIVO, TRANSFERENCIA, TARJETA o CHEQUE
 *       (SALDO_A_FAVOR no aplica).
 *
 *       Con CAJA_BANCOS_ASIENTOS activo se registra tambien el egreso en el libro de caja: sale de la cuenta
 *       `cuentaId` o, si no se indica, de la cuenta por defecto del metodo de pago (efectivo: caja; el resto:
 *       banco); una cuenta indicada debe ser del tipo que corresponde al metodo. Si el mes de la fecha ya esta
 *       cerrado se rechaza (409 PERIODO_CERRADO) y no se guarda nada. Con el interruptor apagado el anticipo se
 *       registra igual, sin movimiento de caja.
 *     tags: [Anticipos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [empleadoId, monto, fecha, metodoPago, descripcion]
 *             properties:
 *               empleadoId: { type: string, example: "b1f6c0de-3a52-4c1e-9a77-0c1d2e3f4a5b" }
 *               monto: { type: number, example: 500 }
 *               fecha: { type: string, format: date, example: "2026-10-15" }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE], example: EFECTIVO }
 *               descripcion: { type: string, example: Anticipo por gastos medicos }
 *               cuentaId: { type: string, description: "Opcional. Cuenta de caja o banco de la que sale el dinero" }
 *     responses:
 *       201: { description: "{ anticipo, mensaje }" }
 *       400: { description: "Campos faltantes (CAMPOS_OBLIGATORIOS), monto, fecha (FECHA_ANTICIPO_INVALIDA), metodo (METODO_PAGO_INVALIDO) o cuenta incompatible (CUENTA_INCOMPATIBLE)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Empleado no encontrado }
 *       409: { description: "Empleado inactivo (EMPLEADO_INACTIVO), mes de caja cerrado (PERIODO_CERRADO), cuenta inactiva o sin cuenta por defecto" }
 *   get:
 *     summary: Lista los anticipos con su saldo pendiente (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Mas recientes primero. Cada anticipo trae `montoDescontado`, `saldoPendiente` (monto menos lo ya descontado)
 *       y `estado` (PENDIENTE, PARCIAL o DESCONTADO). `resumen` totaliza TODO el filtro, no solo la pagina.
 *       Paginado (50 por pagina por defecto, maximo 200).
 *     tags: [Anticipos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: empleadoId
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [PENDIENTE, PARCIAL, DESCONTADO] }
 *       - in: query
 *         name: desde
 *         description: Fecha del anticipo, inclusive
 *         schema: { type: string, format: date, example: "2026-10-01" }
 *       - in: query
 *         name: hasta
 *         description: Fecha del anticipo, inclusive
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200: { description: "{ anticipos: [{ id, empleado, monto, montoDescontado, saldoPendiente, fecha, metodoPago, descripcion, estado }], resumen: { cantidad, totalOtorgado, totalDescontado, totalPendiente }, paginacion }" }
 *       400: { description: Estado o fechas invalidas (RANGO_INVALIDO si desde es posterior a hasta) }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.post('/', autenticar, GESTION, controller.crear)
router.get('/', autenticar, SUPERVISION, controller.listar)

/**
 * @openapi
 * /api/financiero/anticipos/pendientes:
 *   get:
 *     summary: Control de anticipos pendientes de descuento, por empleado (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Por cada empleado con anticipos PENDIENTE o PARCIAL: cuantos son y cuanto falta por descontar (monto menos
 *       lo ya descontado). `totalGeneral` suma a todos los empleados. Los ya descontados por completo no aparecen.
 *     tags: [Anticipos]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ pendientes: [{ empleado, cantidad, totalPendiente }], cantidadEmpleados, totalGeneral }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/pendientes', autenticar, SUPERVISION, controller.pendientes)

/**
 * @openapi
 * /api/financiero/anticipos/{id}:
 *   get:
 *     summary: Detalle de un anticipo con las nominas donde se descontó (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Incluye al empleado, el saldo pendiente, las aplicaciones (nomina, periodo, monto aplicado y estado de la
 *       nomina) y el asiento de caja del egreso (null si se registro con los asientos apagados). No existe la
 *       edicion ni la eliminacion de anticipos.
 *     tags: [Anticipos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ anticipo: { ..., empleado, aplicaciones: [{ nominaId, periodo, estadoNomina, montoAplicado }], asiento } }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Anticipo no encontrado }
 */
router.get('/:id', autenticar, SUPERVISION, controller.obtener)

module.exports = router
