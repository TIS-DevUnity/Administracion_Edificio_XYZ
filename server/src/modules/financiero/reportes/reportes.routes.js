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

/**
 * @openapi
 * /api/financiero/reportes/flujo-caja:
 *   get:
 *     summary: Flujo de caja del edificio, vista previa en JSON (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Entradas y salidas de dinero entre `desde` y `hasta` (ambos inclusive), a nivel edificio. Las mismas
 *       fuentes que el saldo del edificio: ingresos por pagos de expensas (recibos) y por otros conceptos
 *       (ingresos extraordinarios, por categoria); egresos por categoria (gastos extraordinarios) y las lineas
 *       fijas de personal (sueldos de nominas pagadas y anticipos salariales). No depende de CAJA_BANCOS_ASIENTOS.
 *       `saldoInicial` es el saldo acumulado hasta el dia anterior a `desde`; `saldoFinal = saldoInicial +
 *       totalIngresos - totalEgresos`. `verificacion` compara ese saldo con el acumulado a `hasta` que informa el
 *       saldo del edificio. `movimientos` va de la fecha mas antigua a la mas reciente; `tipo` filtra solo esa
 *       lista (los totales y saldos siempre son completos). Sin movimientos: `vacio: true` y un `mensaje`.
 *       Cada generacion queda en la auditoria (entidad ReporteFinanciero), tambien si falla.
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
 *         name: tipo
 *         schema: { type: string, enum: [Ingreso, Gasto] }
 *     responses:
 *       200: { description: "{ titulo, tipoReporte, rango, tipo, generadoEn, generadoPor, vacio, mensaje, saldoInicial, saldoInicialAl, ingresos: { expensas, otros, totalOtros, total }, egresos: { porCategoria, personal: { sueldos, anticipos, total }, total }, totalIngresos, totalEgresos, saldoFinal, verificacion: { formula, saldoFinalCalculado, saldoEdificio, coincide }, movimientos }" }
 *       400: { description: "Fecha faltante o invalida (FECHA_REQUERIDA, FECHA_INVALIDA), desde posterior a hasta (RANGO_INVALIDO) o tipo invalido (TIPO_INVALIDO)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/flujo-caja', autenticar, SUPERVISION, controller.flujoCajaJson)

/**
 * @openapi
 * /api/financiero/reportes/flujo-caja/pdf:
 *   get:
 *     summary: Flujo de caja del edificio en PDF (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/flujo-caja` en A4 vertical: membrete "Edificio XYZ", titulo, rango de
 *       fechas, fecha y hora de emision, usuario generador, resumen con la verificacion, ingresos, egresos y los
 *       movimientos (la cabecera de cada tabla se repite si ocupa varias paginas). Se descarga por defecto; con
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
 *         name: tipo
 *         schema: { type: string, enum: [Ingreso, Gasto] }
 *       - in: query
 *         name: inline
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200:
 *         description: "PDF flujo-caja-DESDE-a-HASTA.pdf"
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       400: { description: "Mismos errores de validacion que la vista previa" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/flujo-caja/pdf', autenticar, SUPERVISION, controller.flujoCajaPdf)

/**
 * @openapi
 * /api/financiero/reportes/balance-general:
 *   get:
 *     summary: Balance general gerencial a la fecha de emision, vista previa en JSON (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Balance a hoy (hora de Bolivia), sin parametros. **Activos**: efectivo y bancos (el saldo del edificio,
 *       el mismo de saldo-edificio) y cuentas por cobrar (expensas pendientes con su mora aplicada, mas los anticipos
 *       a empleados pendientes de descontar). **Pasivos**: saldos a favor de residentes y sueldos por pagar de las
 *       nominas PENDIENTES. **Patrimonio**: activos menos pasivos. Cada bloque trae `grupos` con sus lineas y
 *       `subtotal`, y su `total`; `verificacion` comprueba que activos = pasivos + patrimonio. `nota` aclara que es un
 *       balance gerencial basado en lo registrado y lo que no incluye. Cada generacion queda en la auditoria
 *       (entidad ReporteFinanciero), tambien si falla.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ titulo, tipoReporte, fechaCorte, generadoEn, generadoPor, nota, activos: { grupos, total }, pasivos: { grupos, total }, patrimonio: { grupos, total }, verificacion: { formula, activos, pasivosMasPatrimonio, coincide } }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/balance-general', autenticar, SUPERVISION, controller.balanceGeneralJson)

/**
 * @openapi
 * /api/financiero/reportes/balance-general/pdf:
 *   get:
 *     summary: Balance general gerencial en PDF (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/balance-general` en A4 vertical: membrete "Edificio XYZ", titulo, fecha y
 *       hora de emision, usuario generador, la nota de limitaciones, activos, pasivos y patrimonio con sus
 *       subtotales y totales, y la verificacion. Se descarga por defecto; con `inline=true` se abre en el navegador.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: inline
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200:
 *         description: "PDF balance-general-YYYY-MM-DD.pdf"
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/balance-general/pdf', autenticar, SUPERVISION, controller.balanceGeneralPdf)

/**
 * @openapi
 * /api/financiero/reportes/morosos/excel:
 *   get:
 *     summary: Listado de morosos en Excel (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/morosos` (sale de la misma consulta) en un .xlsx con dos hojas: "Morosos"
 *       (una fila por inmueble, con totales) y "Detalle" (una fila por expensa). Los importes son numeros reales con
 *       formato de moneda de 2 decimales; cada hoja lleva titulo, fecha de generacion y usuario. La generacion
 *       queda en la auditoria con formato EXCEL.
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
 *     responses:
 *       200:
 *         description: "Excel listado-morosos-DESDE-a-HASTA.xlsx"
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       400: { description: "Mismos errores de validacion que la vista previa" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/morosos/excel', autenticar, SUPERVISION, controller.morososExcel)

/**
 * @openapi
 * /api/financiero/reportes/flujo-caja/excel:
 *   get:
 *     summary: Flujo de caja del edificio en Excel (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/flujo-caja` (sale de la misma consulta) en un .xlsx con tres hojas:
 *       "Resumen" (saldo inicial, ingresos, egresos, saldo final y verificacion), "Ingresos y egresos" (por concepto
 *       y categoria, con totales) y "Movimientos" (cronologicos, con egresos en negativo). Importes numericos con
 *       formato de moneda; cada hoja lleva titulo, fecha de generacion y usuario. Auditoria con formato EXCEL.
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
 *         name: tipo
 *         schema: { type: string, enum: [Ingreso, Gasto] }
 *     responses:
 *       200:
 *         description: "Excel flujo-caja-DESDE-a-HASTA.xlsx"
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       400: { description: "Mismos errores de validacion que la vista previa" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/flujo-caja/excel', autenticar, SUPERVISION, controller.flujoCajaExcel)

/**
 * @openapi
 * /api/financiero/reportes/balance-general/excel:
 *   get:
 *     summary: Balance general gerencial en Excel (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       El mismo contenido de `/reportes/balance-general` (sale de la misma consulta) en un .xlsx con dos hojas:
 *       "Balance" (activos, pasivos y patrimonio con subtotales, totales, verificacion y la nota de limitaciones) y
 *       "Datos" (las mismas lineas en una tabla plana). Importes numericos con formato de moneda; cada hoja lleva
 *       titulo, fecha de generacion y usuario. Auditoria con formato EXCEL.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "Excel balance-general-YYYY-MM-DD.xlsx"
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/balance-general/excel', autenticar, SUPERVISION, controller.balanceGeneralExcel)

/**
 * @openapi
 * /api/financiero/reportes/historial:
 *   get:
 *     summary: Historial de reportes financieros generados, con filtros y paginacion en el servidor (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Una fila por cada generacion registrada (entidad ReporteFinanciero), de la mas reciente a la mas antigua.
 *       Los filtros se aplican en la base antes de paginar, por eso `total` y `totalPaginas` son los de los filtros.
 *       **Por defecto no incluye las vistas previas** (formato JSON): se incluyen con `incluirVistaPrevia=true` o con
 *       `formato=JSON`. `desde` y `hasta` filtran por la fecha de generacion y cubren el dia completo en hora de
 *       Bolivia. No expone email ni IP. Consultar el historial no registra auditoria.
 *     tags: [Reportes financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [MOROSOS, FLUJO_CAJA, BALANCE_GENERAL] }
 *       - in: query
 *         name: formato
 *         schema: { type: string, enum: [JSON, PDF, EXCEL] }
 *         description: "JSON = vista previa. Si se envia, manda sobre incluirVistaPrevia"
 *       - in: query
 *         name: resultado
 *         schema: { type: string, enum: [EXITOSO, FALLIDO] }
 *       - in: query
 *         name: usuarioId
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *         description: Inicio del dia indicado (hora de Bolivia)
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *         description: Final del dia indicado (hora de Bolivia)
 *       - in: query
 *         name: incluirVistaPrevia
 *         schema: { type: string, enum: ["true", "false"], default: "false" }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200: { description: "{ datos: [{ id, tipo, formato, resultado, desde, hasta, usuario: { id, nombre } | null, fecha }], paginacion: { pagina, porPagina, total, totalPaginas } }" }
 *       400: { description: "Parametro invalido, con `codigo`: TIPO_INVALIDO, FORMATO_INVALIDO, RESULTADO_INVALIDO, FECHA_INVALIDA o RANGO_INVALIDO (desde posterior a hasta)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio (codigo SIN_PERMISO) }
 */
router.get('/historial', autenticar, SUPERVISION, controller.historial)

module.exports = router
