const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const cuentas = require('./cuentas.controller')

const router = Router()

// Caja y bancos: GESTION registra y cambia; SUPERVISION solo consulta.
const GESTION = autorizar('ADMINISTRADOR')
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas:
 *   get:
 *     summary: Cuentas de caja y de banco del edificio
 *     description: |
 *       La caja recibe el efectivo y las cuentas de banco el resto de los medios de pago. Por defecto solo
 *       trae las activas. `esPorDefecto` marca la cuenta que se usa cuando un cobro o movimiento no indica
 *       cuenta (una por tipo). `datosPendientes` es true mientras la cuenta conserve los datos de marcador
 *       de la migracion (POR DEFINIR): hay que completarlos con PATCH.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [CAJA, BANCO] }
 *       - in: query
 *         name: incluirInactivas
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { description: "{ cuentas: [{ id, nombre, tipo, tipoEtiqueta, banco, numeroCuenta, esPorDefecto, activa, saldoInicial, tieneMovimientos, datosPendientes }] }" }
 *       400: { description: Tipo invalido }
 *       403: { description: Solo Administrador o Directorio }
 *   post:
 *     summary: Crea una cuenta de caja o de banco (solo ADMINISTRADOR)
 *     description: |
 *       Una cuenta de banco exige `banco` y `numeroCuenta`; una caja no los lleva. El nombre y el numero de
 *       cuenta no se repiten. La primera cuenta de cada tipo queda como cuenta por defecto; con
 *       `esPorDefecto: true` la nueva reemplaza a la actual. El tipo no se puede cambiar despues.
 *       `saldoInicial` (por defecto 0, puede ser negativo) es el saldo con el que arranca la cuenta.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo]
 *             properties:
 *               nombre: { type: string, example: Banco Union cuenta corriente }
 *               tipo: { type: string, enum: [CAJA, BANCO] }
 *               banco: { type: string, example: Banco Union }
 *               numeroCuenta: { type: string, example: "10000123456" }
 *               saldoInicial: { type: number, example: 0 }
 *               esPorDefecto: { type: boolean }
 *     responses:
 *       201: { description: "{ cuenta, mensaje }" }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: Ya existe una cuenta con ese nombre o numero de cuenta }
 */
router.get('/cuentas', autenticar, SUPERVISION, cuentas.listar)
router.post('/cuentas', autenticar, GESTION, cuentas.crear)

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas/{id}:
 *   get:
 *     summary: Detalle de una cuenta
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ cuenta }" }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Cuenta no encontrada }
 *   patch:
 *     summary: Edita una cuenta (solo ADMINISTRADOR)
 *     description: |
 *       Solo cambian los campos enviados. Sirve tambien para reemplazar los datos de marcador del banco
 *       creado por la migracion (nombre, banco y numeroCuenta). El tipo no se puede cambiar (se desactiva
 *       la cuenta y se crea otra) y la cuenta por defecto se cambia con POST /cuentas/{id}/por-defecto.
 *       Reglas: no se desactiva la cuenta por defecto ni una con movimientos PENDIENTE o CON_DIFERENCIA;
 *       el saldo inicial no se cambia cuando la cuenta ya tiene periodos cerrados.
 *     tags: [Caja y bancos]
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
 *               banco: { type: string }
 *               numeroCuenta: { type: string }
 *               saldoInicial: { type: number }
 *               activa: { type: boolean }
 *     responses:
 *       200: { description: "{ cuenta, mensaje }" }
 *       400: { description: Datos invalidos o campo no editable (tipo, esPorDefecto) }
 *       403: { description: Sin permisos }
 *       404: { description: Cuenta no encontrada }
 *       409:
 *         description: |
 *           Nombre o numero duplicado, o codigo CUENTA_POR_DEFECTO_NO_DESACTIVABLE, CUENTA_CON_PENDIENTES
 *           o SALDO_INICIAL_BLOQUEADO
 */
router.get('/cuentas/:id', autenticar, SUPERVISION, cuentas.obtener)
router.patch('/cuentas/:id', autenticar, GESTION, cuentas.actualizar)

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas/{id}/por-defecto:
 *   post:
 *     summary: Designa la cuenta por defecto de su tipo (solo ADMINISTRADOR)
 *     description: |
 *       Es la cuenta que reciben los cobros y movimientos cuando no se indica `cuentaId`: el efectivo va a
 *       la caja por defecto y el resto de los medios al banco por defecto. La anterior deja de serlo en la
 *       misma operacion. La cuenta debe estar activa.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ cuenta, anterior, mensaje }" }
 *       403: { description: Sin permisos }
 *       404: { description: Cuenta no encontrada }
 *       409: { description: "Cuenta desactivada (codigo CUENTA_INACTIVA)" }
 */
router.post('/cuentas/:id/por-defecto', autenticar, GESTION, cuentas.designarPorDefecto)

module.exports = router
