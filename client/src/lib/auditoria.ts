import { api } from "@/lib/api";

// El backend guarda `accion` como texto libre (no un enum de Prisma), así que el
// tipo se mantiene abierto: CREATE/UPDATE/DELETE son los que pide la HU, pero
// también existen LOGIN/LOGIN_FALLIDO (ver server auth.service.js).
export type AccionAuditoria = string;

export interface RegistroAuditoria {
  id: string;
  usuarioId: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidadId: string | null;
  detalle: unknown;
  ip: string | null;
  createdAt: string;
  usuario: { id: string; nombre: string; apellido: string; email: string } | null;
}

export interface PaginacionAuditoria {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaAuditoria {
  registros: RegistroAuditoria[];
  paginacion: PaginacionAuditoria;
}

export const ACCIONES_AUDITORIA = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGIN_FALLIDO"] as const;

export const ETIQUETA_ACCION_AUDITORIA: Record<string, string> = {
  CREATE: "Crear",
  UPDATE: "Editar",
  DELETE: "Eliminar",
  LOGIN: "Inicio de sesión",
  LOGIN_FALLIDO: "Inicio de sesión fallido",
};

export function etiquetaAccion(accion: string): string {
  return ETIQUETA_ACCION_AUDITORIA[accion] ?? accion;
}

// Modulos (campo `entidad`) que efectivamente generan eventos hoy — ver
// `grep -rn "entidad:" server/src/modules/**/*.service.js`. Se mantiene a mano
// porque el backend no expone un catálogo; si agregan un módulo nuevo auditado,
// esta lista queda un paso atrás hasta actualizarla.
export const ENTIDADES_AUDITORIA = [
  "Usuario",
  "Copropietario",
  "Inmueble",
  "OcupanteInmueble",
  "Documento",
  "Expensa",
  "Pago",
  "MovimientoSaldo",
  "ConfiguracionMora",
  "Recibo",
] as const;

export const ETIQUETA_ENTIDAD_AUDITORIA: Record<string, string> = {
  Usuario: "Usuarios",
  Copropietario: "Copropietarios",
  Inmueble: "Inmuebles",
  OcupanteInmueble: "Residentes (ocupantes)",
  Documento: "Gestión documental",
  Expensa: "Expensas",
  Pago: "Pagos",
  MovimientoSaldo: "Saldo a favor",
  ConfiguracionMora: "Configuración de mora",
  Recibo: "Recibos",
};

export function etiquetaEntidad(entidad: string): string {
  return ETIQUETA_ENTIDAD_AUDITORIA[entidad] ?? entidad;
}

export interface FiltrosAuditoria {
  usuarioId?: string;
  entidad?: string;
  accion?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}

export async function listarAuditoria(filtros: FiltrosAuditoria): Promise<RespuestaAuditoria> {
  const response = await api.get<RespuestaAuditoria>("/auditoria", { params: filtros });
  return response.data;
}
