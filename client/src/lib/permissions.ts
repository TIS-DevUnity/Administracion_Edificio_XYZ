export type RolNombre = "ADMINISTRADOR" | "DIRECTORIO" | "CONSULTA";

export const ROLES_DISPONIBLES: RolNombre[] = ["ADMINISTRADOR", "DIRECTORIO", "CONSULTA"];

export type SeccionId =
  | "panel"
  | "inmuebles"
  | "residentes"
  | "pagos"
  | "mantenimiento"
  | "copropietarios"
  | "usuarios"
  | "roles"
  | "morosidad"
  | "documentos"
  | "comunicados"
  | "finanzas"
  | "personal"
  | "auditoria"
  // Portal del copropietario (HU14): solo CONSULTA, que es el rol del copropietario.
  | "miDeuda"
  | "areasComunes"
  | "misReservas"
  | "misPagos";
export type Accion = "ver" | "crear" | "editar" | "eliminar";

export const MENSAJE_PERMISO_INSUFICIENTE =
  "Permiso insuficiente: Su perfil solo permite lectura de información.";

export const MENSAJE_ACCESO_DENEGADO_SECCION = "No tienes permisos para acceder a esta sección.";

export function normalizarRol(strRol: string): RolNombre {
  if (strRol === "ROL_1") {
    return "ADMINISTRADOR";
  }

  if (strRol === "ADMINISTRADOR" || strRol === "DIRECTORIO" || strRol === "CONSULTA") {
    return strRol;
  }

  return "CONSULTA";
}

const MATRIZ_PERMISOS: Record<RolNombre, Partial<Record<SeccionId, Accion[]>>> = {
  ADMINISTRADOR: {
    panel: ["ver"],
    inmuebles: ["ver", "crear", "editar", "eliminar"],
    residentes: ["ver", "crear", "editar", "eliminar"],
    // El backend restringe las mutaciones de financiero/pagos a ADMINISTRADOR
    // (ver server/src/modules/financiero/**: GESTION = autorizar('ADMINISTRADOR')).
    pagos: ["ver", "crear", "editar"],
    mantenimiento: ["ver", "crear", "editar", "eliminar"],
    // POST /api/copropietarios: ADMINISTRADOR y DIRECTORIO (copropietarios.routes.js).
    copropietarios: ["ver", "crear"],
    usuarios: ["ver", "crear", "editar", "eliminar"],
    roles: ["ver", "editar"],
    morosidad: ["ver", "crear", "editar", "eliminar"],
    documentos: ["ver", "crear", "eliminar"],
    comunicados: ["ver", "crear", "editar", "eliminar"],
    finanzas: ["ver", "crear", "editar", "eliminar"],
    personal: ["ver", "crear", "editar"],
    // "auditoria" no aparece a propósito: la HU la define como exclusiva de
    // Directorio ("un usuario sin el rol de Directorio... debe impedir el
    // acceso"), incluyendo a Administrador — es una bitácora de control
    // independiente sobre lo que hace cualquiera, Administrador incluido.
    // Nota: el backend (GET /api/auditoria) sí autoriza a ADMINISTRADOR además
    // de DIRECTORIO, así que esta restricción hoy solo vive en el frontend.
  },
  DIRECTORIO: {
    panel: ["ver"],
    inmuebles: ["ver", "crear", "editar"],
    residentes: ["ver", "crear", "editar"],
    pagos: ["ver"],
    mantenimiento: ["ver", "crear", "editar"],
    copropietarios: ["ver", "crear"],
    usuarios: ["ver"],
    morosidad: ["ver"],
    documentos: ["ver", "crear"],
    comunicados: ["ver"],
    auditoria: ["ver"],
    finanzas: ["ver", "crear", "editar"],
    personal: ["ver"],
  },
  CONSULTA: {
    panel: ["ver"],
    inmuebles: ["ver"],
    residentes: ["ver"],
    pagos: ["ver"],
    mantenimiento: ["ver"],
    copropietarios: ["ver"],
    morosidad: ["ver"],
    // Portal del copropietario (HU14). Reservar es solo de CONSULTA en el backend
    // (permisos.js → areasComunes.reservar), por eso estas secciones no aparecen en los otros roles.
    miDeuda: ["ver"],
    areasComunes: ["ver", "crear"],
    misReservas: ["ver", "eliminar"],
    // Informar pagos es solo de CONSULTA en el backend (pagos-informados.routes.js → INFORMAR).
    misPagos: ["ver", "crear"],
    // Comunicados no está disponible para CONSULTA: el backend reserva el historial a ADMINISTRADOR y DIRECTORIO.
    // "finanzas" no aparece (QA bug 6): su historial muestra los pagos de cada departamento y el
    // backend restringe saldo-edificio y movimientos a ADMINISTRADOR y DIRECTORIO.
    // "usuarios", "roles" y "documentos" no aparecen: quedan ocultas y bloqueadas
    // para Consulta (documentos: el backend no distingue privado/público, así que
    // hasta que exista ese campo se oculta el módulo entero en vez de fingir un
    // filtro que la API no respalda).
  },
};

export function puedeAcceder(rol: RolNombre, seccion: SeccionId): boolean {
  return Boolean(MATRIZ_PERMISOS[rol][seccion]?.length);
}

export function puedeEjecutar(rol: RolNombre, seccion: SeccionId, accion: Accion): boolean {
  return Boolean(MATRIZ_PERMISOS[rol][seccion]?.includes(accion));
}

export function validarAccion(
  rol: RolNombre,
  seccion: SeccionId,
  accion: Accion
): { permitido: true } | { permitido: false; mensaje: string } {
  if (puedeEjecutar(rol, seccion, accion)) {
    return { permitido: true };
  }

  return { permitido: false, mensaje: MENSAJE_PERMISO_INSUFICIENTE };
}

export const MENSAJE_SOLO_ADMIN_ESTADO_CUENTA =
  "Permiso insuficiente: solo el Administrador puede emitir, imprimir o descargar el estado de cuenta.";

/** Emitir/imprimir/descargar el estado de cuenta (HU5 CA-26). El backend restringe el PDF a ADMINISTRADOR. */
export function puedeEmitirEstadoCuenta(rol: RolNombre): boolean {
  return rol === "ADMINISTRADOR";
}

export const MENSAJE_SOLO_SUPERVISION_REPORTES =
  "Permiso insuficiente: solo el Administrador y el Directorio pueden generar y exportar reportes financieros.";

/** Reportes financieros (HU13). El backend los restringe a ADMINISTRADOR y DIRECTORIO (reportes.routes.js). */
export function puedeGenerarReportesFinancieros(rol: RolNombre): boolean {
  return rol === "ADMINISTRADOR" || rol === "DIRECTORIO";
}

export interface SeccionNav {
  id: SeccionId;
  label: string;
  href: string;
}

export const SECCIONES_NAV: SeccionNav[] = [
  { id: "panel", label: "Panel principal", href: "/admin" },
  { id: "miDeuda", label: "Mi deuda", href: "/admin/mi-deuda" },
  { id: "misPagos", label: "Mis pagos", href: "/admin/mis-pagos" },
  { id: "areasComunes", label: "Áreas comunes", href: "/admin/areas-comunes" },
  { id: "misReservas", label: "Mis reservas", href: "/admin/areas-comunes/mis-reservas" },
  { id: "finanzas", label: "Finanzas", href: "/admin/finanzas" },
  { id: "personal", label: "Personal y Nómina", href: "/admin/personal" },
  { id: "inmuebles", label: "Inmuebles", href: "/admin/inmuebles" },
  { id: "residentes", label: "Residentes", href: "/admin/residentes" },
  { id: "copropietarios", label: "Copropietarios", href: "/admin/copropietarios" },
  { id: "pagos", label: "Pagos", href: "/admin/pagos" },
  { id: "morosidad", label: "Morosidad y Expensas", href: "/admin/morosidad" },
  { id: "documentos", label: "Gestión Documental", href: "/admin/documentos" },
  { id: "comunicados", label: "Comunicados", href: "/admin/comunicados" },
  { id: "auditoria", label: "Bitácora de Auditoría", href: "/admin/auditoria" },
  { id: "mantenimiento", label: "Mantenimiento", href: "/admin/mantenimiento" },
  { id: "usuarios", label: "Usuarios", href: "/admin/usuarios" },
  { id: "roles", label: "Configurar roles", href: "/admin/roles" },
];

/**
 * Portal del copropietario (HU14): secciones de administración que no se muestran en el menú del rol
 * CONSULTA (el backend lo define como el rol del copropietario, ver server/src/middlewares/acceso-propio.js).
 *
 * Es solo presentación: NO cambia MATRIZ_PERMISOS. Las páginas siguen permitidas para ese rol (por ejemplo,
 * el estado de cuenta en /admin/inmuebles/:id/estado-cuenta, enlazado desde "Mi deuda"). Para volver al
 * menú anterior basta con vaciar esta lista.
 */
const SECCIONES_OCULTAS_EN_PORTAL: SeccionId[] = [
  "inmuebles",
  "residentes",
  "copropietarios",
  "pagos",
  "morosidad",
  "mantenimiento",
];

/** Si la sección aparece en el menú lateral de ese rol (permiso de ver y, para CONSULTA, que sea parte del portal). */
export function seccionVisibleEnMenu(rol: RolNombre, seccion: SeccionId): boolean {
  if (!puedeAcceder(rol, seccion)) return false;
  return !(rol === "CONSULTA" && SECCIONES_OCULTAS_EN_PORTAL.includes(seccion));
}

export function obtenerSeccionPorRuta(strPathname: string): SeccionId {
  const objCoincidencia = [...SECCIONES_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((seccion) => strPathname === seccion.href || strPathname.startsWith(`${seccion.href}/`));

  return objCoincidencia?.id ?? "panel";
}
