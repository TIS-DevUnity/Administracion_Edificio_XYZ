/**
 * Regla de "a quien se le cobra expensa".
 *
 * Un inmueble esta ASIGNADO cuando tiene un ocupante (propietario o inquilino) vigente en la
 * fecha dada: ya empezo y todavia no termino. Un departamento paga expensa si esta activo, es
 * departamento (no baulera ni parqueo), tiene tipo y esta asignado, aunque nadie viva
 * fisicamente en el. Sin nadie asignado no paga ni entra en el reparto del agua.
 */

/** Filtro Prisma de un OcupanteInmueble vigente en `fecha`. */
function filtroOcupanteVigente(fecha = new Date()) {
  return {
    fechaInicio: { lte: fecha },
    OR: [{ fechaFin: null }, { fechaFin: { gt: fecha } }],
  };
}

/** Filtro Prisma de los inmuebles que deben pagar expensa en `fecha`. */
function filtroPagaExpensa(fecha = new Date()) {
  return {
    activo: true,
    clase: "DEPARTAMENTO",
    tipoInmuebleId: { not: null },
    ocupaciones: { some: filtroOcupanteVigente(fecha) },
  };
}

/** true si el inmueble tiene a alguien asignado en `fecha`. `db` es prisma o una transaccion. */
async function estaAsignado(db, inmuebleId, fecha = new Date()) {
  const vigentes = await db.ocupanteInmueble.count({
    where: { inmuebleId, ...filtroOcupanteVigente(fecha) },
  });
  return vigentes > 0;
}

module.exports = { filtroOcupanteVigente, filtroPagaExpensa, estaAsignado };
