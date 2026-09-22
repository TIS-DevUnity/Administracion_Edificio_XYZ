import axios from "axios";
import { api } from "@/lib/api";
import { Copropietario } from "@/lib/copropietarios";

export interface TipoInmueble {
  id: string;
  nombre: string;
  montoBase: string;
}

export interface Inmueble {
  id: string;
  codigo: string;
  piso: string | null;
  areaM2: string | null;
  activo: boolean;
  tipoInmuebleId: string;
  tipoInmueble: TipoInmueble;
  createdAt: string;
  updatedAt: string;
}

export interface DatosInmueble {
  codigo: string;
  tipoInmuebleId: string;
  piso?: string;
  areaM2?: number;
}

export interface DatosActualizarInmueble {
  codigo?: string;
  tipoInmuebleId?: string;
  piso?: string;
  areaM2?: number;
  activo?: boolean;
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
