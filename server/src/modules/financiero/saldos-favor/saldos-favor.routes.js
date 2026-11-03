const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./saldos-favor.controller')

const router = Router()

// Solo consulta. Lo ven Administrador y Directorio: el listado incluye a todos los copropietarios,
// y CONSULTA solo puede ver lo suyo.
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/saldos-favor:
 *   get:
 *     summary: Lista los inmuebles que tienen saldo a favor (pagos anticipados) en una sola consulta
 *     description: |
 *       Devuelve todos los inmuebles con saldo a favor mayor a cero, sin consultar departamento por departamento.
 *       Ese saldo se va descontando solo de las expensas que se generan; aqui se ve lo que queda.
 *
 *       - `resumen`: cantidad de inmuebles con saldo y la suma de todos los saldos.
 *       - `saldos`: uno por inmueble, ordenado por codigo.
 *         - `saldoFavor`: lo que le queda hoy.
 *         - `totalAbonado`: todo lo que entrego por adelantado o en exceso.
 *         - `totalAplicado`: lo que ya se descontó de sus expensas.
 *         - `ultimoAbono`: fecha del ultimo pago anticipado o exceso.
 *         - `responsable`: propietario vigente (o inquilino si no hay), o null si nadie esta asignado.
 *
 *       Un inmueble cuyo saldo ya se consumio por completo no aparece. Para ver el detalle de un inmueble
 *       use `GET /api/financiero/inmuebles/{id}/saldo-favor/movimientos`.
 *       Solo Administrador y Directorio.
 *     tags: [Saldos a favor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ resumen: { cantidad, totalSaldoFavor }, saldos: [{ inmuebleId, codigo, piso, clase, responsable, saldoFavor, totalAbonado, totalAplicado, ultimoAbono }] }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/', autenticar, CONSULTA, controller.listar)

module.exports = router
