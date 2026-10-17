const { Router } = require('express')
const multer = require('multer')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./movimientos.controller')
const { MENSAJE_FORMATOS, MENSAJE_TAMANIO, MAX_COMPROBANTE_BYTES } = require('./movimientos.service')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

// Solo JPG, PNG o PDF de hasta 5 MB. El contenido real se vuelve a verificar en el servicio.
const subirComprobante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COMPROBANTE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const permitido = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)
    cb(permitido ? null : Object.assign(new Error(MENSAJE_FORMATOS), { status: 400 }), permitido)
  }
}).single('comprobante')

/**
 * Recibe el comprobante opcional. Si la solicitud es JSON normal no hace nada; si es multipart,
 * traduce los errores de multer a mensajes claros (archivo muy grande, formato no permitido).
 */
function recibirComprobante(req, res, next) {
  subirComprobante(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE' ? MENSAJE_TAMANIO : 'Envie el comprobante en el campo "comprobante" (un solo archivo)'
      return next(Object.assign(new Error(mensaje), { status: 400 }))
    }
    next(err)
  })
}

/**
 * @openapi
 * /api/financiero/movimientos/categorias:
 *   get:
 *     summary: Categorias para clasificar gastos e ingresos (cada una es de un solo tipo)
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         description: "Gasto (o EGRESO) o Ingreso: devuelve solo las categorias de ese tipo"
 *         schema: { type: string, enum: [GASTO, EGRESO, INGRESO] }
 *       - in: query
 *         name: incluirInactivas
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { description: "{ categorias: [{ id, nombre, tipo, tipoEtiqueta, activa }] }" }
 *       400: { description: Tipo invalido }
 *   post:
 *     summary: Crea una categoria (solo ADMINISTRADOR)
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo]
 *             properties:
 *               nombre: { type: string, example: Jardineria }
 *               tipo: { type: string, enum: [GASTO, INGRESO], example: GASTO }
 *     responses:
 *       201: { description: Categoria creada }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: Ya existe una categoria con ese nombre para ese tipo }
 */
router.get('/categorias', autenticar, CONSULTA, controller.listarCategorias)
router.post('/categorias', autenticar, GESTION, controller.crearCategoria)

/**
 * @openapi
 * /api/financiero/movimientos/categorias/{id}:
 *   patch:
 *     summary: Renombra o desactiva una categoria (solo ADMINISTRADOR)
 *     description: Una categoria desactivada no se puede elegir en movimientos nuevos; los ya registrados la conservan.
 *     tags: [Movimientos financieros]
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
 *               activa: { type: boolean }
 *     responses:
 *       200: { description: Categoria actualizada }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       404: { description: Categoria no encontrada }
 *       409: { description: Ya existe una categoria con ese nombre }
 */
router.patch('/categorias/:id', autenticar, GESTION, controller.actualizarCategoria)

/**
 * @openapi
 * /api/financiero/movimientos/balance:
 *   get:
 *     summary: Balance del edificio = ingresos - gastos extraordinarios (opcionalmente por rango de fechas)
 *     description: |
 *       Se calcula siempre a partir de los movimientos guardados, asi coincide con el listado.
 *       Un gasto disminuye el balance y un ingreso lo aumenta. Incluye el detalle por categoria.
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date, example: "2026-10-01" }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *     responses:
 *       200: { description: "{ rango, ingresos, gastos, balance, cantidadIngresos, cantidadGastos, porCategoria }" }
 *       400: { description: Fechas invalidas }
 */
router.get('/balance', autenticar, CONSULTA, controller.obtenerBalance)

/**
 * @openapi
 * /api/financiero/movimientos:
 *   get:
 *     summary: Lista los gastos e ingresos registrados (mas recientes primero) con sus totales
 *     description: |
 *       Cada movimiento trae tipo (`tipoEtiqueta`: Gasto o Ingreso), fecha, categoria, concepto y
 *       monto. `montoConSigno` es negativo en los gastos. `resumen` suma todo lo que cumple el
 *       filtro, no solo la pagina mostrada.
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [GASTO, EGRESO, INGRESO] }
 *       - in: query
 *         name: categoriaId
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200: { description: "{ rango, movimientos, resumen, paginacion }" }
 *       400: { description: Filtros invalidos }
 *   post:
 *     summary: Registra un gasto o un ingreso extraordinario (solo ADMINISTRADOR)
 *     description: |
 *       Campos obligatorios: tipo, monto, fecha, categoriaId y concepto (si falta alguno, la respuesta
 *       los lista todos). El monto debe ser mayor que cero, la fecha YYYY-MM-DD y la categoria del
 *       mismo tipo que el movimiento. El comprobante es opcional (JPG, PNG o PDF de hasta 5 MB): se puede
 *       enviar en la misma solicitud como `multipart/form-data` (campo `comprobante`) o despues con
 *       `POST /{id}/comprobante`.
 *
 *       Reenvios: si la misma solicitud llega otra vez (misma cabecera `Idempotency-Key`, o los
 *       mismos datos en menos de un minuto) no se registra dos veces: responde 200 con `duplicado: true`.
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         description: Texto unico por solicitud (por ejemplo un UUID) para evitar registros duplicados por reenvio
 *         schema: { type: string, maxLength: 100 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, monto, fecha, categoriaId, concepto]
 *             properties:
 *               tipo: { type: string, enum: [GASTO, INGRESO], example: GASTO }
 *               monto: { type: number, example: 250.5 }
 *               fecha: { type: string, example: "2026-10-17" }
 *               categoriaId: { type: string, description: "Id de una categoria del mismo tipo (ver /categorias)" }
 *               concepto: { type: string, example: Reparacion de la bomba de agua }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tipo, monto, fecha, categoriaId, concepto]
 *             properties:
 *               tipo: { type: string }
 *               monto: { type: string }
 *               fecha: { type: string }
 *               categoriaId: { type: string }
 *               concepto: { type: string }
 *               comprobante: { type: string, format: binary, description: "JPG, PNG o PDF, maximo 5 MB (opcional)" }
 *     responses:
 *       201: { description: Movimiento registrado }
 *       200: { description: La solicitud ya estaba registrada (duplicado true), no se registro de nuevo }
 *       400: { description: "Campos faltantes o invalidos, categoria incompatible, comprobante con formato o tamano no permitido" }
 *       403: { description: Sin permisos }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, recibirComprobante, controller.crear)

/**
 * @openapi
 * /api/financiero/movimientos/{id}:
 *   get:
 *     summary: Detalle de un movimiento con todos sus datos y la informacion de su comprobante
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ movimiento } (tieneComprobante y comprobante indican si hay archivo adjunto)" }
 *       404: { description: Movimiento no encontrado }
 *   put:
 *     summary: Edita un movimiento (solo ADMINISTRADOR)
 *     description: |
 *       Cambia solo los campos que se envian. Un campo obligatorio enviado vacio se rechaza, igual que un
 *       comprobante con formato o tamano no permitido. Tambien acepta `multipart/form-data` para
 *       reemplazar el comprobante. El balance se actualiza solo.
 *     tags: [Movimientos financieros]
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
 *               tipo: { type: string, enum: [GASTO, INGRESO] }
 *               monto: { type: number }
 *               fecha: { type: string }
 *               categoriaId: { type: string }
 *               concepto: { type: string }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               tipo: { type: string }
 *               monto: { type: string }
 *               fecha: { type: string }
 *               categoriaId: { type: string }
 *               concepto: { type: string }
 *               comprobante: { type: string, format: binary }
 *     responses:
 *       200: { description: Movimiento actualizado }
 *       400: { description: Datos obligatorios vacios, valores invalidos o comprobante no permitido }
 *       403: { description: Sin permisos }
 *       404: { description: Movimiento no encontrado }
 */
router.get('/:id', autenticar, CONSULTA, controller.obtener)
router.put('/:id', autenticar, GESTION, recibirComprobante, controller.actualizar)

/**
 * @openapi
 * /api/financiero/movimientos/{id}/comprobante:
 *   post:
 *     summary: Adjunta (o reemplaza) el comprobante de un movimiento (solo ADMINISTRADOR)
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [comprobante]
 *             properties:
 *               comprobante: { type: string, format: binary, description: "JPG, PNG o PDF, maximo 5 MB" }
 *     responses:
 *       201: { description: Comprobante adjuntado }
 *       400: { description: "Falta el archivo, formato no permitido (acepta JPG, PNG o PDF) o supera 5 MB" }
 *       404: { description: Movimiento no encontrado }
 *   get:
 *     summary: Enlace temporal (5 minutos) para ver o descargar el comprobante de un movimiento
 *     description: Con `descargar=true` el archivo se entrega tal cual como descarga, sin alterarlo.
 *     tags: [Movimientos financieros]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: descargar
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { description: Enlace firmado, nombre y tipo del archivo }
 *       404: { description: Movimiento no encontrado o sin comprobante adjunto }
 */
router.post('/:id/comprobante', autenticar, GESTION, recibirComprobante, controller.adjuntarComprobante)
router.get('/:id/comprobante', autenticar, CONSULTA, controller.obtenerComprobante)

module.exports = router
