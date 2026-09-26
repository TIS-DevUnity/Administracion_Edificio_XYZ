import axios from "axios";
import { api } from "@/lib/api";

export type CategoriaDocumento =
  | "ACTA"
  | "REGLAMENTO"
  | "CONTRATO"
  | "FACTURA"
  | "FOTOGRAFIA"
  | "COTIZACION"
  | "OTRO";

export const CATEGORIAS_FORMULARIO: CategoriaDocumento[] = [
  "ACTA",
  "REGLAMENTO",
  "CONTRATO",
  "COTIZACION",
  "OTRO",
];

export const ETIQUETA_CATEGORIA: Record<CategoriaDocumento, string> = {
  ACTA: "Acta",
  REGLAMENTO: "Reglamento",
  CONTRATO: "Contrato",
  FACTURA: "Factura",
  FOTOGRAFIA: "Fotografía",
  COTIZACION: "Cotización",
  OTRO: "Otro",
};

export interface Documento {
  id: string;
  nombre: string;
  categoria: CategoriaDocumento;
  mimeType: string;
  tamanioBytes: number;
  entidad: string | null;
  entidadId: string | null;
  subidoPorId: string | null;
  createdAt: string;
}

export const FORMATOS_PERMITIDOS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

export const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

export async function listarDocumentos(): Promise<Documento[]> {
  const response = await api.get<{ documentos: Documento[] }>("/documentos");
  return response.data.documentos;
}

export async function obtenerDocumento(id: string): Promise<{ documento: Documento; url: string }> {
  const response = await api.get<{ documento: Documento; url: string }>(`/documentos/${id}`);
  return response.data;
}

export async function subirDocumento(formData: FormData): Promise<Documento> {
  const response = await api.post<{ documento: Documento }>("/documentos", formData, {
    headers: { "Content-Type": undefined },
  });
  return response.data.documento;
}

export async function eliminarDocumento(id: string): Promise<void> {
  await api.delete(`/documentos/${id}`);
}

export function formatearFecha(strFechaISO: string): string {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(strFechaISO)
  );
}

export function formatearTamanio(intBytes: number): string {
  if (intBytes < 1024 * 1024) {
    return `${(intBytes / 1024).toFixed(0)} KB`;
  }
  return `${(intBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}
