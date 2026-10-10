import axios from "axios";
import { api } from "@/lib/api";
import { Copropietario } from "@/lib/copropietarios";

export type ClaseInmueble = "DEPARTAMENTO" | "BAULERA" | "PARQUEO";

export const CLASES_INMUEBLE: ClaseInmueble[] = ["DEPARTAMENTO", "BAULERA", "PARQUEO"];

export const ETIQUETA_CLASE: Record<ClaseInmueble, string> = {
  DEPARTAMENTO: "Departamento",
  BAULERA: "Baulera",
  PARQUEO: "Parqueo",
};

export interface TipoInmueble {
  id: string;
  nombre: string;
  montoBase: string;
  pesoAgua: string;
}

export interface Inmueble {
  id: string;
  codigo: string;
  clase: ClaseInmueble;
  piso: string | null;
  areaM2: string | null;
  activo: boolean;
  asignado: boolean;
  tipoInmuebleId: string | null;
  // Para baulera/parqueo el backend devuelve un objeto de compatibilidad con id null y monto 0.
  tipoInmueble: Omit<TipoInmueble, "id"> & { id: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface DatosInmueble {
  codigo: string;
  clase: ClaseInmueble;
  tipoInmuebleId?: string;
  piso?: string;
  areaM2?: number;
}

export interface DatosActualizarInmueble {
  codigo?: string;
  clase?: ClaseInmueble;
  tipoInmuebleId?: string;
  piso?: string;
  areaM2?: number;
  activo?: boolean;
}

export interface DatosTipoInmueble {
  nombre: string;
  montoBase: number;
  pesoAgua?: number;
}

export interface Ocupante {
  id: string;
  inmuebleId: string;
  copropietarioId: string;
  esPropietario: boolean;
  fechaInicio: string;
  fechaFin: string | null;
  copropietario: Pick<Copropietario, "id" | "nombre" | "apellido" | "ci">;
}

export interface DatosAsignarOcupante {
  copropietarioId: string;
  esPropietario: boolean;
  fechaInicio?: string;
}

export interface DatosDarDeBajaOcupante {
  fechaFin?: string;
}

export async function listarTiposInmueble(): Promise<TipoInmueble[]> {
  const response = await api.get<{ tiposInmueble: TipoInmueble[] }>("/tipos-inmueble");
  return response.data.tiposInmueble;
}

export async function crearTipoInmueble(datos: DatosTipoInmueble): Promise<TipoInmueble> {
  const response = await api.post<{ tipoInmueble: TipoInmueble }>("/tipos-inmueble", datos);
  return response.data.tipoInmueble;
}

export async function actualizarTipoInmueble(id: string, datos: Partial<DatosTipoInmueble>): Promise<TipoInmueble> {
  const response = await api.put<{ tipoInmueble: TipoInmueble }>(`/tipos-inmueble/${id}`, datos);
  return response.data.tipoInmueble;
}

export async function listarInmuebles(): Promise<Inmueble[]> {
  const response = await api.get<{ inmuebles: Inmueble[] }>("/inmuebles");
  return response.data.inmuebles;
}

export async function obtenerInmueble(id: string): Promise<Inmueble> {
  const response = await api.get<{ inmueble: Inmueble }>(`/inmuebles/${id}`);
  return response.data.inmueble;
}

export async function crearInmueble(datos: DatosInmueble): Promise<Inmueble> {
  const response = await api.post<{ inmueble: Inmueble }>("/inmuebles", datos);
  return response.data.inmueble;
}

export async function actualizarInmueble(id: string, datos: DatosActualizarInmueble): Promise<Inmueble> {
  const response = await api.put<{ inmueble: Inmueble }>(`/inmuebles/${id}`, datos);
  return response.data.inmueble;
}

export async function listarOcupantes(inmuebleId: string): Promise<Ocupante[]> {
  const response = await api.get<{ ocupantes: Ocupante[] }>(`/inmuebles/${inmuebleId}/ocupantes`);
  return response.data.ocupantes;
}

export async function asignarOcupante(inmuebleId: string, datos: DatosAsignarOcupante): Promise<Ocupante> {
  const response = await api.post<{ ocupante: Ocupante }>(`/inmuebles/${inmuebleId}/ocupantes`, datos);
  return response.data.ocupante;
}

export async function darDeBajaOcupante(
  inmuebleId: string,
  ocupanteId: string,
  datos: DatosDarDeBajaOcupante
): Promise<Ocupante> {
  const response = await api.patch<{ ocupante: Ocupante }>(
    `/inmuebles/${inmuebleId}/ocupantes/${ocupanteId}`,
    datos
  );
  return response.data.ocupante;
}

export function esDepartamento(inmueble: Pick<Inmueble, "clase">): boolean {
  return inmueble.clase === "DEPARTAMENTO";
}

// El backend guarda solo el nombre del tipo; el tamaño que representa cada uno lo define la HU.
const DESCRIPCION_TIPO: Record<string, string> = {
  A: "pequeño",
  B: "mediano",
  C: "grande",
};

/** "Tipo A (pequeño)"; si el tipo no es A/B/C, solo "Tipo X". */
export function etiquetaClasificacion(strNombreTipo: string): string {
  const strDescripcion = DESCRIPCION_TIPO[strNombreTipo.trim().toUpperCase()];
  return strDescripcion ? `Tipo ${strNombreTipo} (${strDescripcion})` : `Tipo ${strNombreTipo}`;
}

/** "Depto. Tipo A", "Baulera" o "Parqueo". */
export function etiquetaTipoInmueble(inmueble: Pick<Inmueble, "clase" | "tipoInmueble">): string {
  return esDepartamento(inmueble) ? `Depto. Tipo ${inmueble.tipoInmueble.nombre}` : ETIQUETA_CLASE[inmueble.clase];
}

/** Regla del backend (asignacion.util.js): solo paga el departamento activo con un ocupante vigente. */
export function motivoExpensa(inmueble: Pick<Inmueble, "clase" | "activo" | "asignado">): {
  paga: boolean;
  motivo: string;
} {
  if (!esDepartamento(inmueble)) {
    return { paga: false, motivo: "Bauleras y parqueos no pagan expensa." };
  }
  if (!inmueble.activo) {
    return { paga: false, motivo: "Inactivo: no genera expensa." };
  }
  if (!inmueble.asignado) {
    return { paga: false, motivo: "Sin propietario ni inquilino asignado: no genera expensa." };
  }
  return { paga: true, motivo: "Paga la expensa fija de su tipo más su parte del agua." };
}

export function formatearBs(valor: string | number): string {
  return `Bs ${Number(valor).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function esOcupanteActivo(ocupante: Ocupante): boolean {
  return ocupante.fechaFin === null;
}

export function etiquetaRol(bolEsPropietario: boolean): string {
  return bolEsPropietario ? "Propietario" : "Inquilino";
}

export function formatearFecha(strFechaISO: string): string {
  const objFecha = new Date(strFechaISO);
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric" }).format(objFecha);
}

export function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) {
      return strMensaje;
    }
  }
  return strFallback;
}
