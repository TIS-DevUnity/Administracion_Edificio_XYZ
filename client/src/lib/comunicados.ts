import axios from "axios";
import { api } from "@/lib/api";

export type CanalComunicado = "CORREO" | "WHATSAPP";
export type EstadoComunicado = "BORRADOR" | "ENVIADO" | "FALLIDO";

export interface Comunicado {
  id: string;
  titulo: string;
  cuerpo: string;
  canales: CanalComunicado[];
  estado: EstadoComunicado;
  causaFallo: string | null;
  totalDestinatarios: number | null;
  enviadoEn: string | null;
  creadoPorId: string | null;
  creadoPor: { id: string; nombre: string; apellido: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatosComunicado {
  titulo: string;
  cuerpo: string;
  canales: CanalComunicado[];
}

export type ErroresComunicado = Partial<Record<"titulo" | "cuerpo" | "canales", string>>;

export const MAX_TITULO = 150;
export const MAX_CUERPO = 5000;
export const MAX_WHATSAPP = 1024;

export const ETIQUETAS_CANAL: Record<CanalComunicado, string> = {
  CORREO: "Correo electrónico",
  WHATSAPP: "WhatsApp",
};

export const ETIQUETAS_ESTADO: Record<EstadoComunicado, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  FALLIDO: "Fallido",
};

/** Replica las reglas actuales de server/.../comunicados.util.js. */
export function validarDatosComunicado(datos: DatosComunicado): ErroresComunicado {
  const errores: ErroresComunicado = {};
  const titulo = datos.titulo.trim();
  const cuerpo = datos.cuerpo.trim();

  if (!titulo) errores.titulo = "Ingresa el título del comunicado.";
  else if (titulo.length > MAX_TITULO) errores.titulo = `Máximo ${MAX_TITULO} caracteres.`;

  if (!cuerpo) errores.cuerpo = "Ingresa el mensaje del comunicado.";
  else if (cuerpo.length > MAX_CUERPO) errores.cuerpo = `Máximo ${MAX_CUERPO} caracteres.`;
  else if (datos.canales.includes("WHATSAPP") && cuerpo.length > MAX_WHATSAPP) {
    errores.cuerpo = `Con WhatsApp seleccionado, el mensaje no puede superar ${MAX_WHATSAPP} caracteres.`;
  }

  if (datos.canales.length === 0) errores.canales = "Selecciona al menos un canal.";
  else if (datos.canales.some((canal) => canal !== "CORREO" && canal !== "WHATSAPP")) {
    errores.canales = "Selecciona un canal válido.";
  }

  return errores;
}

export async function listarComunicados(estado?: EstadoComunicado): Promise<Comunicado[]> {
  const { data } = await api.get<{ comunicados: Comunicado[] }>("/comunicados", {
    params: estado ? { estado } : undefined,
  });
  return data.comunicados;
}

export async function obtenerComunicado(id: string): Promise<Comunicado> {
  const { data } = await api.get<{ comunicado: Comunicado }>(`/comunicados/${id}`);
  return data.comunicado;
}

export async function crearBorradorComunicado(datos: DatosComunicado): Promise<Comunicado> {
  const { data } = await api.post<{ comunicado: Comunicado }>("/comunicados", normalizarDatos(datos));
  return data.comunicado;
}

export async function editarBorradorComunicado(id: string, datos: DatosComunicado): Promise<Comunicado> {
  const { data } = await api.patch<{ comunicado: Comunicado }>(`/comunicados/${id}`, normalizarDatos(datos));
  return data.comunicado;
}

export async function eliminarBorradorComunicado(id: string): Promise<void> {
  await api.delete(`/comunicados/${id}`);
}

function normalizarDatos(datos: DatosComunicado): DatosComunicado {
  return { titulo: datos.titulo.trim(), cuerpo: datos.cuerpo.trim(), canales: [...new Set(datos.canales)] };
}

export function fechaComunicado(valor: string | null): string {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(fecha);
}

export function obtenerErrorComunicado(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const respuesta = error.response?.data as
      | { error?: string; message?: string; errores?: string[] }
      | undefined;
    if (respuesta?.errores?.length) return respuesta.errores.join(". ");
    if (respuesta?.error) return respuesta.error;
    if (respuesta?.message) return respuesta.message;
    if (error.code === "ERR_NETWORK") return "No se pudo conectar con el servidor. Comprueba que el backend esté activo.";
  }
  return fallback;
}
