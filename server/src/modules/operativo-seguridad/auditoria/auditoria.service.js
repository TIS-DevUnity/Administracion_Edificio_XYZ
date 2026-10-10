const prisma = require("../../../config/prisma");

// Agrupa las entidades auditadas por modulo del sistema. No se guarda en la base:
// se calcula al consultar, asi que una entidad nueva solo requiere agregarla aqui.
const MODULOS = {
  Financiero: ["Expensa", "Pago", "Recibo", "MovimientoSaldo", "ConfiguracionMora", "MoraExpensa", "FacturaAgua"],
  Seguridad: ["Usuario"],
  Copropietarios: ["Copropietario"],
  Inmuebles: ["Inmueble", "OcupanteInmueble", "TipoInmueble"],
  Documentos: ["Documento"],
};

const MODULO_POR_ENTIDAD = Object.fromEntries(
  Object.entries(MODULOS).flatMap(([modulo, entidades]) => entidades.map((entidad) => [entidad, modulo]))
);

function moduloDeEntidad(entidad) {
  return MODULO_POR_ENTIDAD[entidad] ?? "Otros";
}

async function obtenerRolUsuario(usuarioId) {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { rol: true } });
    return usuario?.rol ?? null;
  } catch (err) {
    return null;
  }
}

/**
 * Registra una entrada de auditoria. Nunca debe interrumpir el flujo principal:
 * un fallo al auditar se loguea en consola pero no propaga el error.
 * `rol` es el rol del usuario al momento del evento; si no se envia se busca por `usuarioId`
 * (sin usuario, como en los procesos automaticos, queda en null).
 */
async function registrarAuditoria({ usuarioId, rol, accion, entidad, entidadId, detalle, ip }) {
  const rolEvento = rol ?? (usuarioId ? await obtenerRolUsuario(usuarioId) : null);
  try {
    await prisma.historialAuditoria.create({
      data: { usuarioId, rol: rolEvento, accion, entidad, entidadId, detalle, ip },
    });
  } catch (err) {
    // Si la migracion de `rol` aun no se aplico (o el cliente de Prisma no se regenero),
    // se guarda el evento sin rol para no perderlo.
    try {
      await prisma.historialAuditoria.create({
        data: { usuarioId, accion, entidad, entidadId, detalle, ip },
      });
      console.warn("Auditoria registrada sin rol (aplique la migracion y regenere Prisma):", err.message);
    } catch (errSinRol) {
      console.error("No se pudo registrar auditoria:", errSinRol.message);
    }
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

/**
 * Filtro de entidad combinando `entidad` y `modulo`: con ambos, solo coincide si la entidad
 * pertenece a ese modulo.
 */
function filtrarEntidad(entidad, modulo) {
  if (!modulo) return entidad || undefined;
  const entidadesModulo = MODULOS[modulo];
  if (!entidad) return { in: entidadesModulo };
  return { in: entidadesModulo.filter((e) => e === entidad) };
}

async function listar({ usuarioId, entidad, entidadId, accion, modulo, desde, hasta, pagina = 1 }) {
  const numeroPagina = Math.max(1, Number(pagina) || 1);
  const fechaDesde = parsearFecha(desde, "desde", false);
  const fechaHasta = parsearFecha(hasta, "hasta", true);

  if (modulo && !MODULOS[modulo]) {
    throw Object.assign(
      new Error(`modulo no es valido (use: ${Object.keys(MODULOS).join(", ")})`),
      { status: 400 }
    );
  }
  const filtroEntidad = filtrarEntidad(entidad, modulo);

  const where = {
    ...(usuarioId ? { usuarioId } : {}),
    ...(filtroEntidad ? { entidad: filtroEntidad } : {}),
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
      // El id desempata eventos con la misma fecha para que el orden sea estable entre consultas.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (numeroPagina - 1) * LIMITE_POR_PAGINA,
      take: LIMITE_POR_PAGINA,
    }),
    prisma.historialAuditoria.count({ where }),
  ]);

  return {
    registros: registros.map((registro) => ({ ...registro, modulo: moduloDeEntidad(registro.entidad) })),
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
  return { ...registro, modulo: moduloDeEntidad(registro.entidad) };
}

module.exports = { registrarAuditoria, listar, obtenerPorId, MODULOS, moduloDeEntidad };
