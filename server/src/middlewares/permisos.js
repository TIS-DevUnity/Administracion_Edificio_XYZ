const { autorizar } = require("./rbac.middleware");

const ADMINISTRADOR = "ADMINISTRADOR";
const DIRECTORIO = "DIRECTORIO";
const CONSULTA = "CONSULTA";
const TODOS = [ADMINISTRADOR, DIRECTORIO, CONSULTA];

/**
 * Tabla unica de permisos por rol: modulo -> accion -> roles permitidos.
 * Para cambiar quien puede hacer algo basta con editar esta tabla.
 *
 * Hoy la usan los modulos de operativo-seguridad. Los de financiero siguen declarando sus roles
 * en sus propias rutas; pueden migrar a `permitir(...)` cuando quieran.
 */
const PERMISOS = {
  usuarios: {
    ver: [ADMINISTRADOR, DIRECTORIO],
    gestionar: [ADMINISTRADOR],
  },
  // `ver` incluye a CONSULTA, pero ese rol solo puede pedir su propio copropietario (acceso-propio.js).
  // La lista general de personas no es para CONSULTA.
  copropietarios: {
    listar: [ADMINISTRADOR, DIRECTORIO],
    ver: TODOS,
    gestionar: [ADMINISTRADOR, DIRECTORIO],
  },
  inmuebles: {
    ver: TODOS,
    gestionar: [ADMINISTRADOR, DIRECTORIO],
  },
  tiposInmueble: {
    ver: TODOS,
    gestionar: [ADMINISTRADOR],
  },
  tarifasInmueble: {
    ver: TODOS,
    gestionar: [ADMINISTRADOR],
  },
  documentos: {
    ver: TODOS,
    gestionar: [ADMINISTRADOR, DIRECTORIO],
    eliminar: [ADMINISTRADOR],
  },
  // El frontend muestra la pantalla de auditoria solo a DIRECTORIO, pero la ficha de documentos
  // consulta `GET /api/auditoria?entidad=Documento` tambien para ADMINISTRADOR, asi que el
  // backend mantiene a los dos. Restringirlo a DIRECTORIO es cambiar esta linea (y ese boton).
  auditoria: {
    ver: [ADMINISTRADOR, DIRECTORIO],
  },
};

/**
 * Middleware de autorizacion a partir de la tabla. Falla al cargar el modulo si el permiso no
 * existe, para que un error de tipeo no deje una ruta abierta o cerrada por accidente.
 * Uso: router.post("/", autenticar, permitir("copropietarios", "gestionar"), controller.crear)
 */
function permitir(modulo, accion) {
  const roles = PERMISOS[modulo]?.[accion];
  if (!roles) {
    throw new Error(`Permiso no definido: ${modulo}.${accion}`);
  }
  return autorizar(...roles);
}

module.exports = { PERMISOS, permitir };
