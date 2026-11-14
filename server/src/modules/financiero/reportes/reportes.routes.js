const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./reportes.controller')

const router = Router()

// Reportes financieros: solo SUPERVISION (ADMINISTRADOR y DIRECTORIO); CONSULTA no tiene acceso.
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/reportes/morosos:
 *   get:
 *     summary: Listado de morosos, vista previa en JSON (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Una fila por inmueble con deuda vencida. Entran las expensas cuyo vencimiento cae entre `desde` y `hasta`
 *       (ambos inclusive), ya vencidas (vencimiento anterior a hoy, hora de Bolivia), con saldo pendiente mayor que
 *       cero y fuera de un plan de pagos. Cada fila trae el responsable de pago (el de la expensa mas reciente),
 *       el periodo de la deuda (de la expensa mas antigua a la mas reciente), los dias de mora de la mas antigua,
 *       `montoPendiente` (ya restados los pagos parciales), `interesMora` (solo la mora ya aplicada, sin estimar)
 *       y `totalAcumulado`; las expensas individuales van en `expensas`. `totales` consolida todo.
 *       Sin resultados: `vacio: true`, `filas: []` y un `mensaje`. Es de solo lectura; cada generacion queda en
 *       la auditoria (entidad ReporteFinanciero), tambien si falla.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *       - in: query
 *         name: orden
 *         schema: { type: string, enum: [monto, antiguedad], default: monto }
 *         description: "monto = mayor total acumulado primero; antiguedad = mayor atraso primero"
 *     responses:
 *       200: { description: "{ titulo, tipoReporte, rango, orden, generadoEn, generadoPor, vacio, mensaje, filas: [{ inmueble, responsable, periodoDeuda, diasMora, montoPendiente, interesMora, totalAcumulado, expensas }], totales }" }
 *       400: { description: "Fecha faltante o invalida (FECHA_REQUERIDA, FECHA_INVALIDA), desde posterior a hasta (RANGO_INVALIDO) u orden invalido (ORDEN_INVALIDO)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/morosos', autenticar, SUPERVISION, controller.morosos)

/**
 * @openapi
 * /api/financiero/reportes/morosos/pdf:
 *   get:
 *     summary: Listado de morosos en PDF (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/morosos` en A4 horizontal: membrete "Edificio XYZ", titulo, rango de
 *       fechas, fecha y hora de emision, usuario generador y la tabla con sus totales (la cabecera se repite si
 *       ocupa varias paginas). Sin morosos dice el mismo mensaje de la vista previa. Se descarga por defecto; con
 *       `inline=true` se abre en el navegador.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *       - in: query
 *         name: orden
 *         schema: { type: string, enum: [monto, antiguedad], default: monto }
 *       - in: query
 *         name: inline
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200:
 *         description: "PDF listado-morosos-DESDE-a-HASTA.pdf"
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       400: { description: "Mismos errores de validacion que la vista previa" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/morosos/pdf', autenticar, SUPERVISION, controller.morososPdf)

module.exports = router
