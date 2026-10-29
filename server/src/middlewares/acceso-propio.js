const prisma = require("../config/prisma");
const { filtroOcupanteVigente } = require("../modules/operativo-seguridad/inmuebles/asignacion.util");

/**
 * El rol CONSULTA es el del copropietario: solo ve y usa lo suyo. "Lo suyo" sale del copropietario
 * al que esta vinculado su usuario (`Usuario.copropietarioId`) y de los inmuebles que ocupa hoy
 * (propietario o inquilino con ocupacion vigente).
 *
 * Los demas roles (ADMINISTRADOR, DIRECTORIO) no se restringen: estos helpers no los afectan.
 *
 * Uso en rutas:  router.get("/:id/saldo", autenticar, CONSULTA, soloSuInmueble(), controller.x)
 * Uso en listas: if (esConsulta(req)) filtro = await inmueblesPropios(req)
 */

const ROL_RESTRINGIDO = "CONSULTA";
const MENSAJE_AJENO = "Solo puede consultar su propia informacion";

function esConsulta(req) {
  return req.usuario?.rol === ROL_RESTRINGIDO;
}

function prohibido(mensaje, codigo) {
  return Object.assign(new Error(mensaje), { status: 403, codigo });
}

/** Copropietario vinculado al usuario, o null si no tiene. Se consulta una sola vez por peticion. */
async function copropietarioDe(req) {
  if (req._copropietarioId === undefined) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { copropietarioId: true },
    });
    req._copropietarioId = usuario?.copropietarioId ?? null;
  }
  return req._copropietarioId;
}

/** Igual que copropietarioDe, pero falla con 403 si el usuario no esta vinculado a nadie. */
async function exigirCopropietario(req) {
  const copropietarioId = await copropietarioDe(req);
  if (!copropietarioId) {
    throw prohibido("Su usuario no esta vinculado a un copropietario", "USUARIO_SIN_COPROPIETARIO");
  }
  return copropietarioId;
}

/** Ids de los inmuebles que el usuario ocupa hoy (departamento, baulera y parqueo). */
async function inmueblesPropios(req) {
  if (!req._inmueblesPropios) {
    const copropietarioId = await exigirCopropietario(req);
    const ocupaciones = await prisma.ocupanteInmueble.findMany({
      where: { copropietarioId, ...filtroOcupanteVigente() },
      select: { inmuebleId: true },
    });
    req._inmueblesPropios = [...new Set(ocupaciones.map((o) => o.inmuebleId))];
  }
  return req._inmueblesPropios;
}

/** Envuelve una verificacion async como middleware: solo actua con CONSULTA. */
function soloConsulta(verificar) {
  return async (req, res, next) => {
    if (!esConsulta(req)) return next();
    try {
      await verificar(req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** CONSULTA solo puede pedir su propio copropietario (`req.params[param]`). */
function soloSuCopropietario(param = "id") {
  return soloConsulta(async (req) => {
    const propio = await exigirCopropietario(req);
    if (req.params[param] !== propio) throw prohibido(MENSAJE_AJENO, "SOLO_INFORMACION_PROPIA");
  });
}

/** CONSULTA solo puede pedir un inmueble que ocupa (`req.params[param]`). */
function soloSuInmueble(param = "id") {
  return soloConsulta(async (req) => {
    const propios = await inmueblesPropios(req);
    if (!propios.includes(req.params[param])) throw prohibido(MENSAJE_AJENO, "SOLO_INFORMACION_PROPIA");
  });
}

/** Igual para recursos que cuelgan de un inmueble: se busca el inmueble del recurso y se compara. */
function soloSuInmuebleDe(buscarInmuebleId, param = "id") {
  return soloConsulta(async (req) => {
    const propios = await inmueblesPropios(req);
    const inmuebleId = await buscarInmuebleId(req.params[param]);
    // Un recurso que no existe tambien responde 403: no se revela si existe o no.
    if (!inmuebleId || !propios.includes(inmuebleId)) throw prohibido(MENSAJE_AJENO, "SOLO_INFORMACION_PROPIA");
  });
}

/** El inmueble de un recibo. */
const soloSuRecibo = (param = "id") =>
  soloSuInmuebleDe(
    async (id) => (await prisma.recibo.findUnique({ where: { id }, select: { inmuebleId: true } }))?.inmuebleId,
    param
  );

/** El inmueble de un plan de pagos. */
const soloSuPlanDePago = (param = "id") =>
  soloSuInmuebleDe(
    async (id) => (await prisma.planPago.findUnique({ where: { id }, select: { inmuebleId: true } }))?.inmuebleId,
    param
  );

module.exports = {
  esConsulta,
  copropietarioDe,
  exigirCopropietario,
  inmueblesPropios,
  soloSuCopropietario,
  soloSuInmueble,
  soloSuRecibo,
  soloSuPlanDePago,
  MENSAJE_AJENO,
};
