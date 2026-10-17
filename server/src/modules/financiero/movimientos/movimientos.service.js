const crypto = require('crypto')
const prisma = require('../../../config/prisma')
const { supabase, STORAGE_BUCKET } = require('../../../config/supabase')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { Decimal, errorHttp, parsearMonto } = require('../expensas/saldo.util')

const CARPETA_COMPROBANTES = 'comprobantes-movimientos'
const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024 // 5 MB
const SEGUNDOS_ENLACE = 60 * 5
const VENTANA_REENVIO_MS = 60 * 1000 // misma solicitud repetida en menos de 1 minuto = reenvio
const MAX_CONCEPTO = 200
const MAX_CLAVE = 100
const MAX_NOMBRE_CATEGORIA = 60
const POR_PAGINA_DEFECTO = 50
const POR_PAGINA_MAXIMO = 200
const OPCIONES_TX = { timeout: 15000 }

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const ETIQUETA_TIPO = { EGRESO: 'Gasto', INGRESO: 'Ingreso' }

const MENSAJE_FORMATOS = 'Formato no permitido. Formatos aceptados: JPG, PNG o PDF (maximo 5 MB)'
const MENSAJE_TAMANIO = 'El comprobante supera el tamano maximo permitido de 5 MB'

// Formatos aceptados. Se detectan por el contenido del archivo (no por el tipo que declara el
// cliente), porque ese dato lo puede escribir cualquiera.
const FORMATOS_COMPROBANTE = [
  { mime: 'image/jpeg', extension: 'jpg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    extension: 'png',
    coincide: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  { mime: 'application/pdf', extension: 'pdf', coincide: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' }
]

const INCLUIR = {
  categoria: { select: { id: true, nombre: true, tipo: true } },
  registradoPor: { select: { id: true, nombre: true, apellido: true } }
}

// ---------------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------------

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')
}

/** Acepta "Gasto"/"Egreso" y "Ingreso" (sin importar mayusculas) y devuelve el valor de la base. */
function normalizarTipo(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (texto === 'GASTO' || texto === 'EGRESO') return 'EGRESO'
  if (texto === 'INGRESO') return 'INGRESO'
  throw errorHttp('tipo debe ser Gasto o Ingreso', 400)
}

/** YYYY-MM-DD estricto. Devuelve { texto, fecha } (fecha a medianoche UTC, como guarda la base). */
function parsearFechaMovimiento(valor, campo = 'fecha') {
  if (typeof valor !== 'string' || !SOLO_FECHA.test(valor.trim())) {
    throw errorHttp(`${campo} no tiene un formato valido (use YYYY-MM-DD)`, 400)
  }
  const texto = valor.trim()
  const fecha = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    throw errorHttp(`${campo} no es una fecha valida`, 400)
  }
  return { texto, fecha }
}

function validarConcepto(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw errorHttp('concepto es requerido', 400)
  }
  const texto = valor.trim()
  if (texto.length > MAX_CONCEPTO) {
    throw errorHttp(`concepto no puede superar ${MAX_CONCEPTO} caracteres`, 400)
  }
  return texto
}

function normalizarClave(valor) {
  if (vacio(valor)) return null
  if (typeof valor !== 'string' || valor.trim().length > MAX_CLAVE) {
    throw errorHttp(`La clave de solicitud (Idempotency-Key) debe ser un texto de hasta ${MAX_CLAVE} caracteres`, 400)
  }
  return valor.trim()
}

/** Avisa de todos los campos faltantes de una vez, no de uno en uno. */
function exigirCampos(datos, campos) {
  const faltantes = campos.filter((campo) => vacio(datos[campo]))
  if (faltantes.length) {
    throw errorHttp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: faltantes }
    })
  }
}

/** La categoria debe existir, estar activa y ser del mismo tipo que el movimiento. */
async function resolverCategoria(db, categoriaId, tipo) {
  if (typeof categoriaId !== 'string' || !categoriaId.trim()) {
    throw errorHttp('categoriaId es requerido', 400)
  }
  const categoria = await db.categoriaMovimiento.findUnique({ where: { id: categoriaId.trim() } })
  if (!categoria) {
    throw errorHttp('La categoria seleccionada no existe', 400)
  }
  if (!categoria.activa) {
    throw errorHttp(`La categoria "${categoria.nombre}" esta desactivada`, 400)
  }
  if (categoria.tipo !== tipo) {
    throw errorHttp(
      `La categoria "${categoria.nombre}" es de ${ETIQUETA_TIPO[categoria.tipo].toLowerCase()}s y no se puede usar en un ${ETIQUETA_TIPO[tipo].toLowerCase()}`,
      400,
      { codigo: 'CATEGORIA_INCOMPATIBLE' }
    )
  }
  return categoria
}

function detectarFormato(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null
  return FORMATOS_COMPROBANTE.find((f) => f.coincide(buffer)) ?? null
}

/** Valida el archivo del comprobante (tamano y formato real). Devuelve el formato detectado. */
function validarComprobante(archivo) {
  if (archivo.size > MAX_COMPROBANTE_BYTES || archivo.buffer.length > MAX_COMPROBANTE_BYTES) {
    throw errorHttp(MENSAJE_TAMANIO, 400, { codigo: 'COMPROBANTE_MUY_GRANDE' })
  }
  const formato = detectarFormato(archivo.buffer)
  if (!formato) {
    throw errorHttp(MENSAJE_FORMATOS, 400, { codigo: 'COMPROBANTE_FORMATO' })
  }
  return formato
}

function nombreSeguro(nombre) {
  return String(nombre || 'comprobante').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

// ---------------------------------------------------------------------------
// Almacenamiento del comprobante
// ---------------------------------------------------------------------------

async function subirComprobante(archivo, formato) {
  const nombre = `${nombreSeguro(archivo.originalname).replace(/\.[^.]*$/, '')}.${formato.extension}`
  const comprobantePath = `${CARPETA_COMPROBANTES}/${crypto.randomUUID()}-${nombre}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(comprobantePath, archivo.buffer, { contentType: formato.mime, upsert: false })
  if (error) {
    throw errorHttp(`No se pudo subir el comprobante: ${error.message}`, 502)
  }
  return { comprobantePath, comprobanteMime: formato.mime, comprobanteNombre: nombre }
}

/** Borrar un archivo del storage es solo limpieza: si falla no se interrumpe nada. */
async function borrarArchivo(path) {
  if (!path) return
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([path])
  } catch (err) {
    console.warn(`[movimientos] No se pudo borrar ${path}: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

function fechaTexto(fecha) {
  return new Date(fecha).toISOString().slice(0, 10)
}

/** Forma publica de un movimiento: el tipo se ve claro (Gasto = sale dinero, Ingreso = entra). */
function presentar(movimiento) {
  const esIngreso = movimiento.tipo === 'INGRESO'
  const monto = new Decimal(movimiento.monto)
  return {
    id: movimiento.id,
    tipo: movimiento.tipo,
    tipoEtiqueta: ETIQUETA_TIPO[movimiento.tipo],
    esIngreso,
    efectoBalance: esIngreso ? 'ENTRADA' : 'SALIDA',
    monto: monto.toFixed(2),
    montoConSigno: (esIngreso ? monto : monto.negated()).toFixed(2),
    fecha: fechaTexto(movimiento.fecha),
    categoria: movimiento.categoria
      ? { id: movimiento.categoria.id, nombre: movimiento.categoria.nombre }
      : { id: movimiento.categoriaId },
    concepto: movimiento.concepto,
    tieneComprobante: Boolean(movimiento.comprobantePath),
    comprobante: movimiento.comprobantePath
      ? { nombre: movimiento.comprobanteNombre, mimeType: movimiento.comprobanteMime }
      : null,
    registradoPor: movimiento.registradoPor ?? null,
    createdAt: movimiento.createdAt,
    updatedAt: movimiento.updatedAt
  }
}

function detalleAuditoria(movimiento) {
  return {
    tipo: movimiento.tipo,
    categoria: movimiento.categoria?.nombre ?? movimiento.categoriaId,
    monto: new Decimal(movimiento.monto).toFixed(2),
    fecha: fechaTexto(movimiento.fecha),
    concepto: movimiento.concepto,
    comprobante: movimiento.comprobanteNombre ?? null
  }
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

async function listarCategorias({ tipo, incluirInactivas } = {}) {
  const tipoNormalizado = vacio(tipo) ? null : normalizarTipo(tipo)
  const categorias = await prisma.categoriaMovimiento.findMany({
    where: {
      ...(tipoNormalizado ? { tipo: tipoNormalizado } : {}),
      ...(incluirInactivas === 'true' ? {} : { activa: true })
    },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }]
  })
  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    tipoEtiqueta: ETIQUETA_TIPO[c.tipo],
    activa: c.activa
  }))
}

function validarNombreCategoria(nombre) {
  if (typeof nombre !== 'string' || nombre.trim().length < 2) {
    throw errorHttp('nombre debe tener al menos 2 caracteres', 400)
  }
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (limpio.length > MAX_NOMBRE_CATEGORIA) {
    throw errorHttp(`nombre no puede superar ${MAX_NOMBRE_CATEGORIA} caracteres`, 400)
  }
  return limpio
}

async function crearCategoria({ nombre, tipo, usuarioId, ip }) {
  if (vacio(nombre) || vacio(tipo)) {
    const faltantes = [vacio(nombre) ? 'nombre' : null, vacio(tipo) ? 'tipo' : null].filter(Boolean)
    throw errorHttp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: faltantes }
    })
  }
  const tipoNormalizado = normalizarTipo(tipo)
  const nombreLimpio = validarNombreCategoria(nombre)

  const existente = await prisma.categoriaMovimiento.findFirst({
    where: { tipo: tipoNormalizado, nombre: { equals: nombreLimpio, mode: 'insensitive' } }
  })
  if (existente) {
    throw errorHttp(`Ya existe una categoria "${existente.nombre}" para ${ETIQUETA_TIPO[tipoNormalizado].toLowerCase()}s`, 409)
  }

  const categoria = await prisma.categoriaMovimiento.create({
    data: { nombre: nombreLimpio, tipo: tipoNormalizado }
  })
  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'CategoriaMovimiento',
    entidadId: categoria.id,
    detalle: { nombre: categoria.nombre, tipo: categoria.tipo },
    ip
  })
  return { id: categoria.id, nombre: categoria.nombre, tipo: categoria.tipo, tipoEtiqueta: ETIQUETA_TIPO[categoria.tipo], activa: categoria.activa }
}

async function actualizarCategoria(id, { nombre, activa, usuarioId, ip }) {
  const antes = await prisma.categoriaMovimiento.findUnique({ where: { id } })
  if (!antes) {
    throw errorHttp('Categoria no encontrada', 404)
  }
  const data = {}
  if (nombre !== undefined) data.nombre = validarNombreCategoria(nombre)
  if (activa !== undefined) {
    if (typeof activa !== 'boolean') throw errorHttp('activa debe ser true o false', 400)
    data.activa = activa
  }
  if (Object.keys(data).length === 0) {
    throw errorHttp('Envie al menos uno de: nombre, activa', 400)
  }
  if (data.nombre && data.nombre.toLowerCase() !== antes.nombre.toLowerCase()) {
    const conflicto = await prisma.categoriaMovimiento.findFirst({
      where: { tipo: antes.tipo, nombre: { equals: data.nombre, mode: 'insensitive' }, id: { not: id } }
    })
    if (conflicto) {
      throw errorHttp(`Ya existe una categoria "${conflicto.nombre}" para ${ETIQUETA_TIPO[antes.tipo].toLowerCase()}s`, 409)
    }
  }

  const categoria = await prisma.categoriaMovimiento.update({ where: { id }, data })
  await registrarAuditoria({
    usuarioId,
    accion: 'UPDATE',
    entidad: 'CategoriaMovimiento',
    entidadId: id,
    detalle: {
      ...(data.nombre !== undefined ? { nombre: { antes: antes.nombre, despues: categoria.nombre } } : {}),
      ...(data.activa !== undefined ? { activa: { antes: antes.activa, despues: categoria.activa } } : {})
    },
    ip
  })
  return { id: categoria.id, nombre: categoria.nombre, tipo: categoria.tipo, tipoEtiqueta: ETIQUETA_TIPO[categoria.tipo], activa: categoria.activa }
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

/**
 * Registra un gasto o un ingreso extraordinario.
 *
 * Reenvios: si llega la misma solicitud otra vez (misma clave `Idempotency-Key`, o los mismos
 * datos de la misma persona en menos de un minuto) no se registra de nuevo: se devuelve el
 * movimiento ya guardado con `duplicado: true`, asi el balance no cuenta dos veces.
 */
async function crear({ datos, archivo, claveSolicitud, usuarioId, ip }) {
  exigirCampos(datos, ['tipo', 'monto', 'fecha', 'categoriaId', 'concepto'])

  const tipo = normalizarTipo(datos.tipo)
  const monto = parsearMonto(datos.monto, 'monto')
  const { fecha, texto: fechaIso } = parsearFechaMovimiento(datos.fecha)
  const concepto = validarConcepto(datos.concepto)
  const categoria = await resolverCategoria(prisma, datos.categoriaId, tipo)
  const clave = normalizarClave(claveSolicitud)
  const formato = archivo ? validarComprobante(archivo) : null

  const huella = crypto
    .createHash('sha256')
    .update([usuarioId ?? '', tipo, monto.toFixed(2), fechaIso, categoria.id, concepto.toLowerCase()].join('|'))
    .digest('hex')

  // Primero se sube el archivo: si falla, no queda ningun movimiento a medias.
  const subido = archivo ? await subirComprobante(archivo, formato) : null

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // Serializa solicitudes identicas simultaneas para que la segunda vea a la primera.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${huella}))`

      if (clave) {
        const porClave = await tx.movimientoFinanciero.findUnique({ where: { claveSolicitud: clave }, include: INCLUIR })
        if (porClave) return { movimiento: porClave, duplicado: true }
      }
      const reciente = await tx.movimientoFinanciero.findFirst({
        where: { huella, createdAt: { gte: new Date(Date.now() - VENTANA_REENVIO_MS) } },
        include: INCLUIR
      })
      if (reciente) return { movimiento: reciente, duplicado: true }

      const creado = await tx.movimientoFinanciero.create({
        data: {
          tipo,
          categoriaId: categoria.id,
          monto,
          concepto,
          fecha,
          claveSolicitud: clave,
          huella,
          registradoPorId: usuarioId ?? null,
          ...(subido ?? {})
        },
        include: INCLUIR
      })
      return { movimiento: creado, duplicado: false }
    }, OPCIONES_TX)
  } catch (err) {
    await borrarArchivo(subido?.comprobantePath)
    if (err.code === 'P2002' && clave) {
      // Dos solicitudes con la misma clave llegaron a la vez: gana la primera.
      const existente = await prisma.movimientoFinanciero.findUnique({ where: { claveSolicitud: clave }, include: INCLUIR })
      if (existente) return { movimiento: presentar(existente), duplicado: true }
    }
    throw err
  }

  if (resultado.duplicado) {
    await borrarArchivo(subido?.comprobantePath)
    return { movimiento: presentar(resultado.movimiento), duplicado: true }
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'MovimientoFinanciero',
    entidadId: resultado.movimiento.id,
    detalle: detalleAuditoria(resultado.movimiento),
    ip
  })

  return { movimiento: presentar(resultado.movimiento), duplicado: false }
}

function normalizarPagina(pagina, porPagina) {
  const numeroPagina = Math.max(1, Number.parseInt(pagina, 10) || 1)
  const tamanio = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Number.parseInt(porPagina, 10) || POR_PAGINA_DEFECTO))
  return { numeroPagina, tamanio }
}

/** Filtro por fechas (inclusive). Si el inicio es posterior al fin, se rechaza. */
function filtroFechas(desde, hasta) {
  const inicio = vacio(desde) ? null : parsearFechaMovimiento(desde, 'desde')
  const fin = vacio(hasta) ? null : parsearFechaMovimiento(hasta, 'hasta')
  if (inicio && fin && inicio.fecha > fin.fecha) {
    throw errorHttp('El rango de fechas no es valido: desde es posterior a hasta', 400)
  }
  return {
    rango: { desde: inicio?.texto ?? null, hasta: fin?.texto ?? null },
    where: inicio || fin ? { fecha: { ...(inicio ? { gte: inicio.fecha } : {}), ...(fin ? { lte: fin.fecha } : {}) } } : {}
  }
}

/** Ingresos, gastos y balance (ingresos - gastos) de un conjunto de movimientos. */
async function totales(where) {
  const grupos = await prisma.movimientoFinanciero.groupBy({ by: ['tipo'], where, _sum: { monto: true }, _count: { _all: true } })
  const sumaDe = (tipo) => new Decimal(grupos.find((g) => g.tipo === tipo)?._sum.monto ?? 0)
  const cantidadDe = (tipo) => grupos.find((g) => g.tipo === tipo)?._count._all ?? 0
  const ingresos = sumaDe('INGRESO')
  const gastos = sumaDe('EGRESO')
  return {
    ingresos: ingresos.toFixed(2),
    gastos: gastos.toFixed(2),
    balance: ingresos.minus(gastos).toFixed(2),
    cantidadIngresos: cantidadDe('INGRESO'),
    cantidadGastos: cantidadDe('EGRESO')
  }
}

async function listar({ tipo, categoriaId, desde, hasta, pagina, porPagina } = {}) {
  const tipoNormalizado = vacio(tipo) ? null : normalizarTipo(tipo)
  const { rango, where: whereFechas } = filtroFechas(desde, hasta)
  const where = {
    ...(tipoNormalizado ? { tipo: tipoNormalizado } : {}),
    ...(vacio(categoriaId) ? {} : { categoriaId: String(categoriaId) }),
    ...whereFechas
  }
  const { numeroPagina, tamanio } = normalizarPagina(pagina, porPagina)

  const [movimientos, total, resumen] = await Promise.all([
    prisma.movimientoFinanciero.findMany({
      where,
      include: INCLUIR,
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      skip: (numeroPagina - 1) * tamanio,
      take: tamanio
    }),
    prisma.movimientoFinanciero.count({ where }),
    totales(where)
  ])

  return {
    rango,
    movimientos: movimientos.map(presentar),
    // Totales de TODO lo que cumple el filtro, no solo de la pagina que se muestra.
    resumen,
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total, totalPaginas: Math.ceil(total / tamanio) }
  }
}

async function buscar(id) {
  const movimiento = await prisma.movimientoFinanciero.findUnique({ where: { id }, include: INCLUIR })
  if (!movimiento) {
    throw errorHttp('Movimiento no encontrado', 404)
  }
  return movimiento
}

async function obtener(id) {
  return presentar(await buscar(id))
}

/**
 * Balance del edificio: ingresos - gastos, calculado siempre desde los movimientos guardados
 * (no hay un saldo aparte que pueda desfasarse). Opcionalmente por rango de fechas.
 */
async function obtenerBalance({ desde, hasta } = {}) {
  const { rango, where } = filtroFechas(desde, hasta)
  const [general, porCategoria] = await Promise.all([
    totales(where),
    prisma.movimientoFinanciero.groupBy({ by: ['categoriaId', 'tipo'], where, _sum: { monto: true }, _count: { _all: true } })
  ])
  const categorias = await prisma.categoriaMovimiento.findMany({
    where: { id: { in: porCategoria.map((g) => g.categoriaId) } }
  })
  const nombreDe = new Map(categorias.map((c) => [c.id, c.nombre]))

  return {
    rango,
    ...general,
    porCategoria: porCategoria
      .map((g) => ({
        categoriaId: g.categoriaId,
        categoria: nombreDe.get(g.categoriaId) ?? null,
        tipo: g.tipo,
        tipoEtiqueta: ETIQUETA_TIPO[g.tipo],
        total: new Decimal(g._sum.monto ?? 0).toFixed(2),
        cantidad: g._count._all
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.categoria.localeCompare(b.categoria))
  }
}

/**
 * Edita un movimiento. Solo cambian los campos que se envian; un campo obligatorio enviado vacio
 * se rechaza. El balance se recalcula solo porque siempre sale de los movimientos guardados.
 */
async function actualizar(id, { datos, archivo, usuarioId, ip }) {
  const campos = ['tipo', 'monto', 'fecha', 'categoriaId', 'concepto']
  const vacios = campos.filter((campo) => datos[campo] !== undefined && vacio(datos[campo]))
  if (vacios.length) {
    throw errorHttp(`Los campos obligatorios no pueden quedar vacios: ${vacios.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: vacios }
    })
  }
  if (!campos.some((campo) => datos[campo] !== undefined) && !archivo) {
    throw errorHttp(`Envie al menos uno de: ${campos.join(', ')} o un comprobante`, 400)
  }

  const formato = archivo ? validarComprobante(archivo) : null
  const antes = await buscar(id)

  const tipo = datos.tipo !== undefined ? normalizarTipo(datos.tipo) : antes.tipo
  const categoriaId = datos.categoriaId !== undefined ? String(datos.categoriaId).trim() : antes.categoriaId
  const data = {}
  if (datos.tipo !== undefined) data.tipo = tipo
  if (datos.monto !== undefined) data.monto = parsearMonto(datos.monto, 'monto')
  if (datos.fecha !== undefined) data.fecha = parsearFechaMovimiento(datos.fecha).fecha
  if (datos.concepto !== undefined) data.concepto = validarConcepto(datos.concepto)
  if (datos.categoriaId !== undefined || datos.tipo !== undefined) {
    // El tipo y la categoria tienen que seguir siendo compatibles despues del cambio.
    const categoria = await resolverCategoria(prisma, categoriaId, tipo)
    data.categoriaId = categoria.id
  }

  const subido = archivo ? await subirComprobante(archivo, formato) : null
  if (subido) Object.assign(data, subido)

  let despues
  try {
    despues = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "movimientos_financieros" WHERE "id" = ${id} FOR UPDATE`
      return tx.movimientoFinanciero.update({ where: { id }, data, include: INCLUIR })
    }, OPCIONES_TX)
  } catch (err) {
    await borrarArchivo(subido?.comprobantePath)
    throw err
  }

  // El comprobante anterior ya no se usa: borrarlo es solo limpieza.
  if (subido) await borrarArchivo(antes.comprobantePath)

  const cambios = {}
  const antesDetalle = detalleAuditoria(antes)
  const despuesDetalle = detalleAuditoria(despues)
  for (const campo of Object.keys(antesDetalle)) {
    if (antesDetalle[campo] !== despuesDetalle[campo]) {
      cambios[campo] = { antes: antesDetalle[campo], despues: despuesDetalle[campo] }
    }
  }
  if (Object.keys(cambios).length > 0) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'MovimientoFinanciero',
      entidadId: id,
      detalle: cambios,
      ip
    })
  }

  return presentar(despues)
}

/** Adjunta (o reemplaza) el comprobante de un movimiento ya registrado. */
async function adjuntarComprobante(id, { archivo, usuarioId, ip }) {
  if (!archivo) {
    throw errorHttp('El archivo del comprobante es requerido (campo "comprobante")', 400)
  }
  return actualizar(id, { datos: {}, archivo, usuarioId, ip })
}

/**
 * Enlace temporal (5 minutos) para ver o descargar el comprobante. Con `descargar` el archivo se
 * entrega tal cual, sin modificarlo, como descarga.
 */
async function obtenerEnlaceComprobante(id, { descargar = false } = {}) {
  const movimiento = await buscar(id)
  if (!movimiento.comprobantePath) {
    throw errorHttp('El movimiento no tiene comprobante adjunto', 404)
  }
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(movimiento.comprobantePath, SEGUNDOS_ENLACE, descargar ? { download: movimiento.comprobanteNombre } : undefined)
  if (error) {
    throw errorHttp(`No se pudo generar el enlace del comprobante: ${error.message}`, 502)
  }
  return {
    movimientoId: movimiento.id,
    nombre: movimiento.comprobanteNombre,
    mimeType: movimiento.comprobanteMime,
    descarga: Boolean(descargar),
    url: data.signedUrl,
    venceEnSegundos: SEGUNDOS_ENLACE
  }
}

module.exports = {
  MENSAJE_FORMATOS,
  MENSAJE_TAMANIO,
  MAX_COMPROBANTE_BYTES,
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  crear,
  listar,
  obtener,
  obtenerBalance,
  actualizar,
  adjuntarComprobante,
  obtenerEnlaceComprobante
}
