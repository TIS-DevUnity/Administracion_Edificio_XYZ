const prisma = require("../../../config/prisma");

/**
 * Registra una entrada de auditoria. Nunca debe interrumpir el flujo principal:
 * un fallo al auditar se loguea en consola pero no propaga el error.
 */
async function registrarAuditoria({ usuarioId, accion, entidad, entidadId, detalle, ip }) {
  try {
    await prisma.historialAuditoria.create({
      data: { usuarioId, accion, entidad, entidadId, detalle, ip },
    });
  } catch (err) {
    console.error("No se pudo registrar auditoria:", err.message);
  }
}

const LIMITE_POR_PAGINA = 50;
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una fecha sola (YYYY-MM-DD) se interpreta como dia completo en hora de Bolivia
 * (UTC-4 todo el anio): `desde` es el inicio del dia y `hasta` el final, para que el
 * ultimo dia del rango no quede fuera. Un valor con hora se respeta tal cual.
 */
function parsearFecha(valor, campo, finDeDia) {
  if (valor === undefined || valor === "") return undefined;

  const fecha = SOLO_FECHA.test(valor)
    ? new Date(`${valor}T${finDeDia ? "23:59:59.999" : "00:00:00.000"}-04:00`)
    : new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    throw Object.assign(new Error(`${campo} no es una fecha valida (use YYYY-MM-DD)`), { status: 400 });
  }
  return fecha;
}

async function listar({ usuarioId, entidad, entidadId, accion, desde, hasta, pagina = 1 }) {
  const numeroPagina = Math.max(1, Number(pagina) || 1);
  const fechaDesde = parsearFecha(desde, "desde", false);
  const fechaHasta = parsearFecha(hasta, "hasta", true);

  const where = {
    ...(usuarioId ? { usuarioId } : {}),
    ...(entidad ? { entidad } : {}),
    ...(entidadId ? { entidadId } : {}),
    ...(accion ? { accion } : {}),
    ...(fechaDesde || fechaHasta
      ? {
          createdAt: {
            ...(fechaDesde ? { gte: fechaDesde } : {}),
            ...(fechaHasta ? { lte: fechaHasta } : {}),
          },
        }
      : {}),
  };

  const [registros, total] = await Promise.all([
    prisma.historialAuditoria.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (numeroPagina - 1) * LIMITE_POR_PAGINA,
      take: LIMITE_POR_PAGINA,
    }),
    prisma.historialAuditoria.count({ where }),
  ]);

  return {
    registros,
    paginacion: {
      pagina: numeroPagina,
      porPagina: LIMITE_POR_PAGINA,
      total,
      totalPaginas: Math.ceil(total / LIMITE_POR_PAGINA),
    },
  };
}

async function obtenerPorId(id) {
  const registro = await prisma.historialAuditoria.findUnique({
    where: { id },
    include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true } } },
  });
  if (!registro) {
    throw Object.assign(new Error("Registro de auditoria no encontrado"), { status: 404 });
  }
  return registro;
}

module.exports = { registrarAuditoria, listar, obtenerPorId };
