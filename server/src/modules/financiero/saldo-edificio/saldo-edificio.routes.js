const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./saldo-edificio.controller')

const router = Router()

// Solo consulta: el saldo se calcula, no se edita. Lo ven Administrador y Directorio: el historial
// del saldo muestra los pagos de cada departamento, y CONSULTA solo puede ver los suyos.
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/saldo-edificio:
 *   get:
 *     summary: Consultar saldo del edificio - cuanto dinero tiene, de donde viene y en que se gasto
 *     description: |
 *       Resumen del dinero del edificio en una sola consulta, sin revisar los pagos uno por uno.
 *
 *       - `saldoActual`: ingresos - gastos, acumulado hasta `hasta` (o todo lo registrado si no se indica).
 *       - `totalIngresos` y `totalGastos`: lo registrado en el rango pedido (sin rango, todo). `saldoDelPeriodo`
 *         es su diferencia. Con rango, `saldoActual` sigue siendo el acumulado.
 *       - `ingresos`: de donde viene la plata, `pagosDeExpensas` (dinero que realmente entro, segun los recibos y
 *         su fecha de pago) mas `extraordinarios` (ingresos registrados en Gastos e ingresos extraordinarios).
 *       - `gastos`: en que se gasto: `extraordinarios` y `personal` (nominas pagadas mas anticipos salariales).
 *       - `gastosPersonal`: detalle de los gastos de personal del rango, `{ nominas, anticipos, total, cantidadNominas,
 *         cantidadAnticipos }`. Las nominas pagadas suman su monto pagado en la fecha de pago y los anticipos su monto
 *         en su fecha (cuando salen, no cuando se descuentan); no hay doble conteo porque la nomina paga el sueldo
 *         neto, ya sin los anticipos. Se cuentan siempre, con o sin el libro de caja activo. `totalGastos` los incluye.
 *       - `movimientos`: historial mezclado de ingresos y gastos (fecha, concepto, tipo y monto), el mas
 *         reciente primero y paginado. `origen` es PAGO_EXPENSA, EXTRAORDINARIO, PAGO_NOMINA o ANTICIPO_SALARIAL.
 *       - `pendienteDeCobro`: lo que los residentes todavia deben y el saldo a favor que tienen adelantado.
 *         Es solo informativo: **no forma parte del saldo del edificio**.
 *
 *       Un pago cubierto con saldo a favor no suma como ingreso (esa plata ya se conto cuando se entrego como
 *       anticipo o exceso) y una expensa sin pagar es una deuda, no un ingreso. Todo se calcula en cada consulta,
 *       asi que al registrar o corregir un pago o un movimiento el saldo cambia solo. Los sueldos pagados y los
 *       anticipos al personal se descuentan como gastos de personal. El saldo no se puede editar.
 *       Solo Administrador y Directorio: el historial muestra los pagos de cada departamento.
 *     tags: [Saldo del edificio]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date, example: "2026-10-01" }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *       - in: query
 *         name: tipo
 *         description: Filtra solo el historial
 *         schema: { type: string, enum: [INGRESO, GASTO] }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200: { description: "{ rango, saldoActual, totalIngresos, totalGastos, saldoDelPeriodo, ingresos, gastos, gastosPersonal, pendienteDeCobro, movimientos, paginacion }" }
 *       400: { description: Fechas o tipo invalidos }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/', autenticar, CONSULTA, controller.obtener)

module.exports = router
