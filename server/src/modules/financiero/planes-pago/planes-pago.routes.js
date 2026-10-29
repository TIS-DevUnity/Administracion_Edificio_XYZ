const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const { soloSuPlanDePago } = require('../../../middlewares/acceso-propio')
const controller = require('./planes-pago.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/planes-pago:
 *   get:
 *     summary: Lista los planes de pago en cuotas (mas recientes primero)
 *     tags: [Planes de pago]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: inmuebleId
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [ACTIVO, COMPLETADO, CANCELADO] }
 *     responses:
 *       200: { description: "{ planes }" }
 *       400: { description: Estado invalido }
 *   post:
 *     summary: Registra un plan de pagos en cuotas para un departamento (solo ADMINISTRADOR)
 *     description: |
 *       Divide la deuda de un departamento (mora incluida) en varias cuotas. Sin `expensaIds` cubre toda su
 *       deuda pendiente; con `expensaIds` solo esas expensas. El importe total acordado (`montoTotal`,
 *       opcional) debe ser igual a esa deuda y la suma de las cuotas debe ser igual al total.
 *
 *       Cuotas: una lista (`cuotas`: importe y fecha de vencimiento de cada una) o `cantidadCuotas` +
 *       `primerVencimiento` para cuotas iguales una por mes. Entre 2 y 60 cuotas, con fechas en orden y la
 *       primera no anterior a hoy.
 *
 *       Mientras el plan este activo, las expensas que cubre se cobran por cuotas: no entran en el pago normal,
 *       no generan mora nueva y no se les cambia el agua. Cada cuota tiene su estado: PENDIENTE, PARCIAL,
 *       PAGADA o VENCIDA (no se pago a tiempo; no genera mora aparte).
 *     tags: [Planes de pago]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inmuebleId]
 *             properties:
 *               inmuebleId: { type: string }
 *               expensaIds: { type: array, items: { type: string }, description: "Opcional: por defecto toda la deuda pendiente" }
 *               montoTotal: { type: number, description: "Opcional: debe ser igual a la deuda incluida", example: 900 }
 *               cuotas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     monto: { type: number, example: 300 }
 *                     fechaVencimiento: { type: string, example: "2026-11-15" }
 *               cantidadCuotas: { type: integer, example: 3, description: "Alternativa a `cuotas`" }
 *               primerVencimiento: { type: string, example: "2026-11-15", description: "Con cantidadCuotas" }
 *               observacion: { type: string, maxLength: 300 }
 *     responses:
 *       201: { description: Plan registrado, con sus cuotas }
 *       400: { description: "Datos invalidos: la suma de las cuotas no coincide con el total, fechas fuera de orden, etc." }
 *       403: { description: Sin permisos }
 *       404: { description: Inmueble no encontrado }
 *       409: { description: "Sin deuda pendiente, expensas ya pagadas o ya incluidas en otro plan" }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, controller.crear)

/**
 * @openapi
 * /api/financiero/planes-pago/{id}:
 *   get:
 *     summary: Detalle de un plan - cada cuota con su importe, vencimiento, pagado, saldo y estado
 *     description: |
 *       `saldoPendiente` es el saldo total del acuerdo. Cada cuota trae los pagos (recibos) que se le
 *       aplicaron; `expensas` muestra lo que falta de cada expensa cubierta por el plan.
 *     tags: [Planes de pago]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ plan }" }
 *       404: { description: Plan no encontrado }
 */
router.get('/:id', autenticar, CONSULTA, soloSuPlanDePago(), controller.obtener)

/**
 * @openapi
 * /api/financiero/planes-pago/{id}/pagos:
 *   post:
 *     summary: Registra un pago al plan (solo ADMINISTRADOR)
 *     description: |
 *       El monto se aplica a las cuotas de la mas antigua a la mas nueva y cubre las expensas del plan (la
 *       mas antigua primero y, en cada una, primero la mora). Actualiza el saldo de cada cuota y el saldo
 *       total del acuerdo; genera un recibo con folio. No puede superar el saldo del plan. Al pagar la
 *       ultima cuota el plan queda COMPLETADO. Con la cabecera `Idempotency-Key`, reenviar la misma
 *       solicitud no cobra dos veces (responde 200 con `duplicado: true`).
 *     tags: [Planes de pago]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string, maxLength: 100 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto, metodoPago]
 *             properties:
 *               monto: { type: number, example: 300 }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string, maxLength: 200 }
 *               fechaPago: { type: string, example: "2026-11-15", description: "YYYY-MM-DD, no puede ser futura. Opcional" }
 *               cuentaId: { type: string, description: "Opcional. Cuenta de caja o banco que recibe el dinero. Solo se aplica cuando los asientos estan activos (CAJA_BANCOS_ASIENTOS=true); con la variable apagada se ignora. Si se omite: el efectivo va a la caja por defecto y el resto de los metodos al banco por defecto. Debe estar activa y ser del tipo que corresponde al metodo (EFECTIVO a una caja; los demas a una cuenta de banco)." }
 *     responses:
 *       201: { description: "Pago registrado: recibo, aplicacionesCuotas, aplicacionesExpensas y el plan actualizado" }
 *       200: { description: El pago ya estaba registrado (duplicado true) }
 *       400: { description: "Datos invalidos; con asientos activos, tambien cuentaId inexistente o incompatible con el metodo (codigo CUENTA_INCOMPATIBLE)" }
 *       404: { description: Plan no encontrado }
 *       409: { description: "El plan no esta activo o el monto supera el saldo del plan. Con asientos activos, tambien codigos PERIODO_CERRADO (la fecha cae en un mes ya cerrado), CUENTA_INACTIVA y CUENTA_POR_DEFECTO_FALTANTE" }
 */
router.post('/:id/pagos', autenticar, GESTION, controller.registrarPago)

/**
 * @openapi
 * /api/financiero/planes-pago/{id}/cancelar:
 *   post:
 *     summary: Cancela un plan que todavia no recibio pagos (solo ADMINISTRADOR)
 *     description: Sus expensas vuelven al cobro normal. Un plan con pagos registrados no se puede cancelar.
 *     tags: [Planes de pago]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Plan cancelado }
 *       404: { description: Plan no encontrado }
 *       409: { description: El plan no esta activo o ya tiene pagos }
 */
router.post('/:id/cancelar', autenticar, GESTION, controller.cancelar)

module.exports = router
