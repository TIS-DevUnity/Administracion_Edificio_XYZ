/**
 * Historial de reportes financieros generados (HU13). Lee las filas que deja registrar-generacion.service.js en
 * HistorialAuditoria (entidad ReporteFinanciero, accion GENERATE) y las devuelve ya mapeadas, con filtros y
 * paginacion aplicados en la base. Consultarlo NO registra auditoria. No expone email ni ip.
 *
 * Las funciones de arriba son puras (validan, arman el `where`, mapean); solo `listarHistorial` toca la base.
 */
const { errorHttp } = require('../expensas/saldo.util')
const { validarFecha } = require('./morosos.util')

const ENTIDAD = 'ReporteFinanciero'
const ACCION = 'GENERATE'
const TIPOS = ['MOROSOS', 'FLUJO_CAJA', 'BALANCE_GENERAL']
const FORMATOS = ['JSON', 'PDF', 'EXCEL']
const FORMATOS_DE_ARCHIVO = FORMATOS.filter((f) => f !== 'JSON')
const RESULTADOS = ['EXITOSO', 'FALLIDO']
const POR_PAGINA_DEFECTO = 20
const POR_PAGINA_MAXIMO = 100

const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** Valor de una lista cerrada (sin importar mayusculas), o null si no se envio. Lanza 400 con `codigo` si no es valido. */
function enumerado(valor, permitidos, campo, codigo) {
  if (vacio(valor)) return null
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!permitidos.includes(texto)) {
    throw errorHttp(`${campo} debe ser uno de: ${permitidos.join(', ')}`, 400, { codigo })
  }
  return texto
}

/** Fecha opcional YYYY-MM-DD como dia completo en hora de Bolivia (UTC-4 todo el anio): inicio o fin del dia. */
function instanteDelDia(valor, campo, finDeDia) {
  if (vacio(valor)) return null
  let dia
  try {
    dia = validarFecha(valor, campo) // 400 FECHA_INVALIDA si no es una fecha real
  } catch (err) {
    // validarFecha deja escapar un RangeError con meses u horas imposibles (2026-13-01); aqui debe ser un 400.
    if (!(err instanceof RangeError)) throw err
    throw errorHttp(`${campo} debe ser una fecha valida con el formato YYYY-MM-DD`, 400, { codigo: 'FECHA_INVALIDA' })
  }
  return { dia, instante: new Date(`${dia}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}-04:00`) }
}

/** Entero positivo o el valor por defecto; nunca lanza (como el resto de listados paginados). */
const entero = (valor, defecto) => {
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) && n > 0 ? n : defecto
}

/**
 * Filtros de la consulta ya validados y normalizados. Sin `formato` ni `incluirVistaPrevia=true`, las vistas previas
 * (formato JSON) quedan fuera; con `formato=JSON` explicito o `incluirVistaPrevia=true` se incluyen.
 */
function validarFiltros(query = {}) {
  const tipo = enumerado(query.tipo, TIPOS, 'tipo', 'TIPO_INVALIDO')
  const formato = enumerado(query.formato, FORMATOS, 'formato', 'FORMATO_INVALIDO')
  const resultado = enumerado(query.resultado, RESULTADOS, 'resultado', 'RESULTADO_INVALIDO')
  const desde = instanteDelDia(query.desde, 'desde', false)
  const hasta = instanteDelDia(query.hasta, 'hasta', true)
  if (desde && hasta && desde.dia > hasta.dia) {
    throw errorHttp('desde no puede ser posterior a hasta', 400, { codigo: 'RANGO_INVALIDO', detalle: { desde: desde.dia, hasta: hasta.dia } })
  }
  return {
    tipo,
    formato,
    resultado,
    usuarioId: vacio(query.usuarioId) ? null : String(query.usuarioId).trim(),
    desde: desde?.instante ?? null,
    hasta: hasta?.instante ?? null,
    incluirVistaPrevia: String(query.incluirVistaPrevia ?? '').trim().toLowerCase() === 'true',
    pagina: entero(query.pagina, 1),
    porPagina: Math.min(entero(query.porPagina, POR_PAGINA_DEFECTO), POR_PAGINA_MAXIMO)
  }
}

const porDetalle = (clave, valor) => ({ detalle: { path: [clave], equals: valor } })

/** `where` de Prisma para HistorialAuditoria. Tipo, formato y resultado viven dentro del JSON `detalle`. */
function construirWhere(filtros) {
  const condiciones = []
  if (filtros.tipo) condiciones.push(porDetalle('tipo', filtros.tipo))
  if (filtros.resultado) condiciones.push(porDetalle('resultado', filtros.resultado))
  if (filtros.formato) condiciones.push(porDetalle('formato', filtros.formato))
  // Sin formato explicito, "sin vista previa" se expresa como PDF o EXCEL (no como NOT JSON, que en SQL descarta nulos).
  else if (!filtros.incluirVistaPrevia) condiciones.push({ OR: FORMATOS_DE_ARCHIVO.map((f) => porDetalle('formato', f)) })
  return {
    entidad: ENTIDAD,
    accion: ACCION,
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.desde || filtros.hasta
      ? { createdAt: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
      : {}),
    ...(condiciones.length ? { AND: condiciones } : {})
  }
}

/** Una fila de HistorialAuditoria -> { id, tipo, formato, resultado, desde, hasta, usuario: { id, nombre }, fecha }. */
function mapearRegistro(fila) {
  const d = fila.detalle && typeof fila.detalle === 'object' ? fila.detalle : {}
  const u = fila.usuario
  return {
    id: fila.id,
    tipo: d.tipo ?? null,
    formato: d.formato ?? null,
    resultado: d.resultado ?? null,
    desde: d.desde ?? null,
    hasta: d.hasta ?? null,
    usuario: u ? { id: u.id, nombre: `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() } : null,
    fecha: new Date(fila.createdAt).toISOString()
  }
}

function armarPaginacion({ pagina, porPagina, total }) {
  return { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) }
}

/** Consulta de solo lectura. Valida antes de tocar la base y pagina en la base, asi `total` es el de los filtros. */
async function listarHistorial(query = {}) {
  const filtros = validarFiltros(query)
  const where = construirWhere(filtros)
  const prisma = require('../../../config/prisma') // aqui y no arriba: las pruebas de las funciones puras no abren la base
  const [filas, total] = await Promise.all([
    prisma.historialAuditoria.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        detalle: true,
        usuario: { select: { id: true, nombre: true, apellido: true } } // sin email, y no se lee ip
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filtros.pagina - 1) * filtros.porPagina,
      take: filtros.porPagina
    }),
    prisma.historialAuditoria.count({ where })
  ])
  return { datos: filas.map(mapearRegistro), paginacion: armarPaginacion({ pagina: filtros.pagina, porPagina: filtros.porPagina, total }) }
}

module.exports = {
  ENTIDAD,
  ACCION,
  TIPOS,
  FORMATOS,
  RESULTADOS,
  POR_PAGINA_DEFECTO,
  POR_PAGINA_MAXIMO,
  validarFiltros,
  construirWhere,
  mapearRegistro,
  armarPaginacion,
  listarHistorial
}
