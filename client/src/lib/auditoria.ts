import { api } from "@/lib/api";

export type AccionAuditoria = "CREATE" | "UPDATE" | "DELETE";

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

export const ETIQUETA_ACCION_AUDITORIA: Record<AccionAuditoria, string> = {
  CREATE: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

export async function listarAuditoria(params: {
  entidad?: string;
  accion?: string;
  pagina?: number;
}): Promise<RespuestaAuditoria> {
  const response = await api.get<RespuestaAuditoria>("/auditoria", { params });
  return response.data;
}
