const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const { soloSuCopropietario } = require('../../../middlewares/acceso-propio')
const controller = require('./cuenta-residente.controller')

const router = Router()

const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/copropietarios/{id}/cuenta:
 *   get:
 *     summary: Cuenta consolidada de un residente - inmuebles, cargo mensual por concepto, deuda y saldo a favor
 *     description: |
 *       Reune todo lo que la persona tiene asociado hoy (departamentos, bauleras y parqueos).
 *
 *       - `cargoMensual.conceptos`: lo que se le cobra cada mes, una linea por concepto
 *         (departamento, parqueo, baulera) y `total`. Los cargos de baulera y parqueo se suman a
 *         la expensa de su primer departamento (`extrasEnDepartamento`) y no llevan agua.
 *       - `departamentos`: deuda pendiente y saldo a favor de cada departamento a su cargo.
 *       - `resumen`: deuda, saldo a favor y saldo neto consolidados (positivo = debe).
 *       - `avisos`: situaciones que conviene revisar (por ejemplo, baulera sin departamento).
 *
 *       Un cambio de tarifa o de monto propio rige desde la proxima expensa generada.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id del copropietario
 *         schema: { type: string }
 *     responses:
 *       200: { description: Cuenta consolidada }
 *       401: { description: No autenticado }
 *       403: { description: Sin permisos }
 *       404: { description: Copropietario no encontrado }
 */
router.get('/:id/cuenta', autenticar, CONSULTA, soloSuCopropietario(), controller.obtenerCuenta)

module.exports = router
