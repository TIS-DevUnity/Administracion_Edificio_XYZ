import axios from "axios";
import { api } from "@/lib/api";

export type CanalComunicado = "CORREO" | "WHATSAPP";
export type EstadoComunicado = "BORRADOR" | "ENVIADO" | "FALLIDO";
export type ModoDestinatarios = "TODOS" | "SELECCIONADOS";

export interface ResidenteComunicado {
  id: string; nombre: string; apellido: string; email: string | null; telefono: string | null;
  inmuebles?: { codigo: string; esPropietario: boolean }[];
}
export interface Comunicado {
  id: string; titulo: string; cuerpo: string; canales: CanalComunicado[]; estado: EstadoComunicado;
  destinatariosModo?: ModoDestinatarios | null; destinatarioIds?: string[];
  causaFallo: string | null; totalDestinatarios: number | null; enviadoEn: string | null;
  creadoPorId: string | null; creadoPor: { id: string; nombre: string; apellido: string } | null;
  createdAt: string; updatedAt: string;
}
export interface DatosComunicado {
  titulo: string; cuerpo: string; canales: CanalComunicado[];
  destinatarios: { modo: ModoDestinatarios; copropietarioIds?: string[] };
}
export interface VistaPreviaComunicado {
  comunicadoId: string; titulo: string; mensaje: string; canales: CanalComunicado[];
  destinatariosModo: ModoDestinatarios; totalDestinatarios: number;
  sinOcupacionVigente: number; puedeEnviar: boolean;
}
export interface ResumenEnvio {
  estado: EstadoComunicado; causaFallo: string | null; totalDestinatarios: number;
  enviados: number; fallidos: number; omitidos: number;
  omitidosLista: { nombre: string; canal: CanalComunicado; motivo: string | null }[];
  fallidosLista: { nombre: string; canal: CanalComunicado; motivo: string | null }[];
}
export interface FilaResultado {
  copropietarioId: string | null; nombre: string; canal: CanalComunicado;
  email: string | null; telefono: string | null; destinoReal: string | null;
  estado: "ENVIADO" | "FALLIDO" | "OMITIDO"; motivo: string | null;
}
export type ErroresComunicado = Partial<Record<"titulo" | "cuerpo" | "canales" | "destinatarios", string>>;
export const MAX_TITULO = 150;
export const MAX_CUERPO = 5000;
export const MAX_WHATSAPP = 1024;
export const ETIQUETAS_CANAL: Record<CanalComunicado, string> = { CORREO: "Correo electrónico", WHATSAPP: "WhatsApp" };
export const ETIQUETAS_ESTADO: Record<EstadoComunicado, string> = { BORRADOR: "Borrador", ENVIADO: "Enviado", FALLIDO: "Fallido" };

export function validarDatosComunicado(datos: DatosComunicado): ErroresComunicado {
  const errores: ErroresComunicado = {};
  const titulo = datos.titulo.trim(); const cuerpo = datos.cuerpo.trim();
  if (!titulo) errores.titulo = "Ingresa el título del comunicado.";
  else if (titulo.length > MAX_TITULO) errores.titulo = `Máximo ${MAX_TITULO} caracteres.`;
  if (!cuerpo) errores.cuerpo = "Ingresa el mensaje del comunicado.";
  else if (cuerpo.length > MAX_CUERPO) errores.cuerpo = `Máximo ${MAX_CUERPO} caracteres.`;
  // El backend valida titulo + salto de linea + mensaje para WhatsApp al preparar el envío.
  else if (datos.canales.includes("WHATSAPP") && `${titulo}\n\n${cuerpo}`.length > MAX_WHATSAPP)
    errores.cuerpo = `El título y el mensaje juntos no pueden superar ${MAX_WHATSAPP} caracteres por WhatsApp.`;
  if (!datos.canales.length) errores.canales = "Selecciona al menos un canal.";
  if (datos.destinatarios.modo === "SELECCIONADOS" && !datos.destinatarios.copropietarioIds?.length)
    errores.destinatarios = "Selecciona al menos un residente.";
  return errores;
}
export async function listarComunicados(estado?: EstadoComunicado): Promise<Comunicado[]> {
  const { data } = await api.get<{ comunicados: Comunicado[] }>("/comunicados", { params: estado ? { estado } : undefined });
  return data.comunicados;
}
export async function obtenerComunicado(id: string): Promise<Comunicado> {
  const { data } = await api.get<{ comunicado: Comunicado }>(`/comunicados/${id}`); return data.comunicado;
}
export async function listarResidentesComunicado(): Promise<ResidenteComunicado[]> {
  const { data } = await api.get<{ destinatarios: ResidenteComunicado[] }>("/comunicados/destinatarios"); return data.destinatarios;
}
export async function crearBorradorComunicado(datos: DatosComunicado): Promise<Comunicado> {
  const { data } = await api.post<{ comunicado: Comunicado }>("/comunicados", normalizarDatos(datos)); return data.comunicado;
}
export async function editarBorradorComunicado(id: string, datos: DatosComunicado): Promise<Comunicado> {
  const { data } = await api.patch<{ comunicado: Comunicado }>(`/comunicados/${id}`, normalizarDatos(datos)); return data.comunicado;
}
export async function eliminarBorradorComunicado(id: string): Promise<void> { await api.delete(`/comunicados/${id}`); }
export async function obtenerVistaPreviaComunicado(id: string): Promise<VistaPreviaComunicado> {
  const { data } = await api.get<{ vistaPrevia: VistaPreviaComunicado }>(`/comunicados/${id}/vista-previa`); return data.vistaPrevia;
}
export async function enviarComunicado(id: string): Promise<{ comunicado: Comunicado; resumen: ResumenEnvio }> {
  const { data } = await api.post<{ comunicado: Comunicado; resumen: ResumenEnvio }>(`/comunicados/${id}/enviar`, { confirmar: true }); return data;
}
export async function obtenerResultadoComunicado(id: string): Promise<{ comunicado: Comunicado; resumen: ResumenEnvio; destinatarios: FilaResultado[] }> {
  const { data } = await api.get<{ comunicado: Comunicado; resumen: ResumenEnvio; destinatarios: FilaResultado[] }>(`/comunicados/${id}/resultado`); return data;
}
function normalizarDatos(datos: DatosComunicado): DatosComunicado {
  return { ...datos, titulo: datos.titulo.trim(), cuerpo: datos.cuerpo.trim(), canales: [...new Set(datos.canales)], destinatarios: { modo: datos.destinatarios.modo, copropietarioIds: datos.destinatarios.modo === "SELECCIONADOS" ? [...new Set(datos.destinatarios.copropietarioIds ?? [])] : [] } };
}
export function fechaComunicado(valor: string | null): string {
  if (!valor) return "—"; const fecha = new Date(valor); if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(fecha);
}
export function obtenerErrorComunicado(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const respuesta = error.response?.data as { error?: string; message?: string; errores?: string[] } | undefined;
    if (respuesta?.errores?.length) return respuesta.errores.join(". ");
    if (respuesta?.error) return respuesta.error; if (respuesta?.message) return respuesta.message;
    if (error.code === "ERR_NETWORK") return "No se pudo conectar con el servidor. Comprueba que el backend esté activo.";
  }
  return error instanceof Error ? error.message : fallback;
}
