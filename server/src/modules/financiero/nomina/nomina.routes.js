const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./nomina.controller')

const router = Router()

// Nomina: GESTION genera y cambia conceptos; SUPERVISION solo consulta; CONSULTA no tiene acceso.
const GESTION = autorizar('ADMINISTRADOR')
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/nomina/generar:
 *   post:
 *     summary: Genera la nomina de un periodo mensual (solo ADMINISTRADOR)
 *     description: |
 *       Crea una nomina PENDIENTE por cada empleado ACTIVO que ya habia ingresado a mas tardar el ultimo dia del
 *       periodo y que todavia no tenga nomina de ese periodo. Cada nomina guarda una copia del sueldo base actual
 *       del empleado: un cambio de sueldo posterior no la altera. Es idempotente: repetir la generacion omite las
 *       nominas que ya existen. Los empleados inactivos no entran; sus nominas anteriores se conservan.
 *       No se puede generar un periodo posterior al mes actual (hora de Bolivia).
 *
 *       Descuento de anticipos: al crear cada nomina se descuentan los anticipos PENDIENTE o PARCIAL del empleado
 *       con fecha hasta el ultimo dia del periodo, del mas antiguo al mas nuevo y hasta donde alcance el sueldo base
 *       (el neto nunca queda negativo). Lo que no cabe queda pendiente para la nomina siguiente. Solo se tocan las
 *       nominas que esta llamada creo: una nomina ya generada no se modifica, y un anticipo registrado despues de
 *       generar la de su mes se descuenta en la siguiente. `totalAnticipos` y `sueldoNeto` de la respuesta ya
 *       incluyen el descuento.
 *       Responde 201 si se creo alguna nomina y 200 si no habia nada nuevo.
 *     tags: [Nómina]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [periodo]
 *             properties:
 *               periodo: { type: string, example: "2026-10", description: "Mes en formato YYYY-MM" }
 *     responses:
 *       201: { description: "{ periodo, creadas, omitidas, nominas: [...], mensaje }" }
 *       200: { description: "Ya estaban generadas todas las nominas del periodo (creadas: 0)" }
 *       400: { description: "Periodo faltante o invalido (PERIODO_INVALIDO) o posterior al mes actual (PERIODO_FUTURO)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 */
router.post('/generar', autenticar, GESTION, controller.generar)

/**
 * @openapi
 * /api/financiero/nomina:
 *   get:
 *     summary: Lista las nominas con el resumen de pendientes y pagadas (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Mas recientes primero y, dentro de un periodo, por apellidos y nombres del empleado. Paginado (50 por
 *       pagina por defecto, maximo 200). `resumen` cuenta y suma el sueldo neto de TODO el filtro, no solo de la
 *       pagina, separando pendientes y pagadas.
 *     tags: [Nómina]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: periodo
 *         schema: { type: string, example: "2026-10" }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [PENDIENTE, PAGADA] }
 *       - in: query
 *         name: q
 *         description: Busca en nombres, apellidos o documento del empleado, sin distinguir mayusculas
 *         schema: { type: string, example: mamani }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200: { description: "{ nominas: [{ id, periodo, estado, sueldoBase, totalBonos, totalHorasExtra, totalDescuentos, totalAnticipos, sueldoNeto, empleado }], resumen: { cantidad, pendientes: { cantidad, total }, pagadas: { cantidad, total } }, paginacion }" }
 *       400: { description: Periodo o estado invalido }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/', autenticar, SUPERVISION, controller.listar)

/**
 * @openapi
 * /api/financiero/nomina/{id}:
 *   get:
 *     summary: Detalle de una nomina con sus conceptos y anticipos descontados (solo ADMINISTRADOR y DIRECTORIO)
 *     description: |
 *       Incluye al empleado, los conceptos (en lista y agrupados en bonos, horas extra y descuentos) y los
 *       anticipos aplicados a la nomina. Todos los montos son texto con 2 decimales.
 *     tags: [Nómina]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ nomina: { ..., empleado, conceptos, conceptosPorTipo, anticiposAplicados: [{ anticipoId, fecha, montoAnticipo, montoAplicado }] } }" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Nomina no encontrada }
 */
router.get('/:id', autenticar, SUPERVISION, controller.obtener)

/**
 * @openapi
 * /api/financiero/nomina/{id}/conceptos:
 *   post:
 *     summary: Agrega un bono, hora extra o descuento a una nomina pendiente (solo ADMINISTRADOR)
 *     description: |
 *       El sueldo neto se recalcula en el servidor: sueldo base + bonos + horas extra - descuentos - anticipos.
 *       `monto` debe ser mayor que cero. La HORA_EXTRA exige ademas `horas` (mayor que cero, hasta 744 y 2
 *       decimales): el Administrador ingresa las horas y el monto. BONO y DESCUENTO no admiten `horas`.
 *       Si el neto quedara negativo se rechaza y no se guarda nada (400 NETO_NEGATIVO). Una nomina pagada no
 *       admite cambios (409 NOMINA_PAGADA).
 *     tags: [Nómina]
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
 *             required: [tipo, descripcion, monto]
 *             properties:
 *               tipo: { type: string, enum: [BONO, HORA_EXTRA, DESCUENTO], example: HORA_EXTRA }
 *               descripcion: { type: string, example: Turno nocturno del fin de semana }
 *               monto: { type: number, example: 180.50 }
 *               horas: { type: number, example: 8.5, description: "Solo y obligatorio en HORA_EXTRA" }
 *     responses:
 *       201: { description: "{ nomina } completa y recalculada" }
 *       400: { description: "Datos invalidos, HORAS_REQUERIDAS, HORAS_NO_APLICA o NETO_NEGATIVO (con el detalle del calculo)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Nomina no encontrada }
 *       409: { description: "La nomina ya esta pagada (NOMINA_PAGADA)" }
 */
router.post('/:id/conceptos', autenticar, GESTION, controller.agregarConcepto)

/**
 * @openapi
 * /api/financiero/nomina/{id}/conceptos/{conceptoId}:
 *   patch:
 *     summary: Edita la descripcion, el monto o las horas de un concepto (solo ADMINISTRADOR)
 *     description: |
 *       Envie al menos uno de `descripcion`, `monto` y `horas`; los demas conservan su valor y el resultado se
 *       valida con las mismas reglas que el alta. El tipo no se cambia (quite el concepto y agregue otro). El
 *       neto se recalcula y, si quedara negativo, no se guarda el cambio (400 NETO_NEGATIVO).
 *     tags: [Nómina]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: conceptoId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descripcion: { type: string, example: Bono por puntualidad }
 *               monto: { type: number, example: 200 }
 *               horas: { type: number, example: 10 }
 *     responses:
 *       200: { description: "{ nomina } completa y recalculada" }
 *       400: { description: "Datos invalidos, SIN_CAMBIOS, HORAS_REQUERIDAS, HORAS_NO_APLICA o NETO_NEGATIVO" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Nomina o concepto no encontrado (el concepto debe ser de esa nomina) }
 *       409: { description: "La nomina ya esta pagada (NOMINA_PAGADA)" }
 *   delete:
 *     summary: Quita un concepto de una nomina pendiente (solo ADMINISTRADOR)
 *     description: |
 *       Solo se quitan conceptos; las nominas no se eliminan. El neto se recalcula y, si al quitar un bono
 *       quedara negativo, no se guarda el cambio (400 NETO_NEGATIVO).
 *     tags: [Nómina]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: conceptoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ nomina } completa y recalculada" }
 *       400: { description: "NETO_NEGATIVO: quitar el bono dejaria el sueldo neto por debajo de cero" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Nomina o concepto no encontrado }
 *       409: { description: "La nomina ya esta pagada (NOMINA_PAGADA)" }
 */
router.patch('/:id/conceptos/:conceptoId', autenticar, GESTION, controller.editarConcepto)
router.delete('/:id/conceptos/:conceptoId', autenticar, GESTION, controller.quitarConcepto)

/**
 * @openapi
 * /api/financiero/nomina/{id}/pagar:
 *   post:
 *     summary: Confirma el pago de una nomina pendiente (solo ADMINISTRADOR)
 *     description: |
 *       Revise antes los conceptos y el sueldo neto. `monto` debe ser IGUAL al sueldo neto de la nomina
 *       (400 MONTO_NO_COINCIDE): no hay pagos parciales. `fechaPago` no puede ser futura. `metodoPago`:
 *       EFECTIVO, TRANSFERENCIA, TARJETA o CHEQUE (SALDO_A_FAVOR no aplica: 400 METODO_PAGO_INVALIDO).
 *       La nomina pasa a PAGADA y queda inmutable: no se edita, no se anula ni se elimina, y tampoco sus
 *       conceptos ni los anticipos descontados. Pagar una nomina ya pagada da 409 NOMINA_YA_PAGADA, tambien
 *       con dos solicitudes simultaneas. Un empleado inactivo puede cobrar una nomina pendiente que ya existia.
 *
 *       Con CAJA_BANCOS_ASIENTOS activo el pago se registra como egreso del edificio en la cuenta `cuentaId` o,
 *       si no se indica, en la cuenta por defecto del metodo de pago (efectivo: caja; el resto: banco); una
 *       cuenta indicada debe ser del tipo que corresponde al metodo. Si el mes de `fechaPago` ya esta cerrado se
 *       rechaza (409 PERIODO_CERRADO) y no se guarda nada. Con el interruptor apagado el pago se confirma
 *       igual, sin movimiento de caja. Los pagos de nomina siempre cuentan como gasto de personal en el saldo
 *       del edificio.
 *
 *       Si el sueldo neto es 0 (los anticipos consumieron todo el sueldo) se confirma con `monto: 0`; la nomina
 *       queda PAGADA con monto pagado 0 y NO se crea movimiento de caja porque no hay dinero que mover.
 *     tags: [Nómina]
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
 *             required: [fechaPago, monto, metodoPago]
 *             properties:
 *               fechaPago: { type: string, format: date, example: "2026-10-31" }
 *               monto: { type: number, example: 2520.50, description: "Igual al sueldo neto de la nomina" }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE], example: TRANSFERENCIA }
 *               cuentaId: { type: string, description: "Opcional. Cuenta de caja o banco de la que sale el dinero" }
 *     responses:
 *       200: { description: "{ nomina (completa, PAGADA), asiento: { id, cuentaId, cuenta, periodo, estado } o null, mensaje }" }
 *       400: { description: "Campos faltantes (CAMPOS_OBLIGATORIOS), fecha (FECHA_PAGO_INVALIDA), metodo (METODO_PAGO_INVALIDO), monto distinto del neto (MONTO_NO_COINCIDE, con detalle { sueldoNeto, monto }) o cuenta incompatible (CUENTA_INCOMPATIBLE)" }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador }
 *       404: { description: Nomina no encontrada }
 *       409: { description: "Nomina ya pagada (NOMINA_YA_PAGADA), mes de caja cerrado (PERIODO_CERRADO), cuenta inactiva o sin cuenta por defecto" }
 */
router.post('/:id/pagar', autenticar, GESTION, controller.pagar)

module.exports = router
