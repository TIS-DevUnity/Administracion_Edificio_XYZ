export type RolNombre = "ADMINISTRADOR" | "DIRECTORIO" | "CONSULTA";

export const ROLES_DISPONIBLES: RolNombre[] = ["ADMINISTRADOR", "DIRECTORIO", "CONSULTA"];

export type SeccionId =
  | "panel"
  | "edificios"
  | "inmuebles"
  | "residentes"
  | "pagos"
  | "mantenimiento"
  | "copropietarios"
  | "usuarios"
  | "roles"
  | "morosidad"
  | "documentos";
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
    edificios: ["ver", "crear", "editar", "eliminar"],
    inmuebles: ["ver", "crear", "editar", "eliminar"],
    residentes: ["ver", "crear", "editar", "eliminar"],
    pagos: ["ver", "crear", "editar", "eliminar"],
    mantenimiento: ["ver", "crear", "editar", "eliminar"],
    copropietarios: ["ver"],
    usuarios: ["ver", "crear", "editar", "eliminar"],
    roles: ["ver", "editar"],
    morosidad: ["ver", "crear", "editar", "eliminar"],
    documentos: ["ver", "crear", "eliminar"],
  },
  DIRECTORIO: {
    panel: ["ver"],
    edificios: ["ver", "crear", "editar"],
    inmuebles: ["ver", "crear", "editar"],
    residentes: ["ver", "crear", "editar"],
    pagos: ["ver", "crear", "editar"],
    mantenimiento: ["ver", "crear", "editar"],
    copropietarios: ["ver"],
    usuarios: ["ver"],
    morosidad: ["ver"],
    documentos: ["ver", "crear"],
  },
  CONSULTA: {
    panel: ["ver"],
    edificios: ["ver"],
    inmuebles: ["ver"],
    residentes: ["ver"],
    pagos: ["ver"],
    mantenimiento: ["ver"],
    copropietarios: ["ver"],
    morosidad: ["ver"],
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

export interface SeccionNav {
  id: SeccionId;
  label: string;
  href: string;
}

export const SECCIONES_NAV: SeccionNav[] = [
  { id: "panel", label: "Panel principal", href: "/admin" },
  { id: "edificios", label: "Edificios", href: "/admin/edificios" },
  { id: "inmuebles", label: "Inmuebles", href: "/admin/inmuebles" },
  { id: "residentes", label: "Residentes", href: "/admin/residentes" },
  { id: "copropietarios", label: "Copropietarios", href: "/admin/copropietarios" },
  { id: "pagos", label: "Pagos", href: "/admin/pagos" },
  { id: "morosidad", label: "Morosidad y Expensas", href: "/admin/morosidad" },
  { id: "documentos", label: "Gestión Documental", href: "/admin/documentos" },
  { id: "mantenimiento", label: "Mantenimiento", href: "/admin/mantenimiento" },
  { id: "usuarios", label: "Usuarios", href: "/admin/usuarios" },
  { id: "roles", label: "Configurar roles", href: "/admin/roles" },
];

export function obtenerSeccionPorRuta(strPathname: string): SeccionId {
  const objCoincidencia = [...SECCIONES_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((seccion) => strPathname === seccion.href || strPathname.startsWith(`${seccion.href}/`));

  return objCoincidencia?.id ?? "panel";
}
