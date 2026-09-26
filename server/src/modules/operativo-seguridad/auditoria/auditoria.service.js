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

async function listar({ usuarioId, entidad, accion, desde, hasta, pagina = 1 }) {
  const numeroPagina = Math.max(1, Number(pagina) || 1);

  const where = {
    ...(usuarioId ? { usuarioId } : {}),
    ...(entidad ? { entidad } : {}),
    ...(accion ? { accion } : {}),
    ...(desde || hasta
      ? {
          createdAt: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta) } : {}),
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

module.exports = { registrarAuditoria, listar };
