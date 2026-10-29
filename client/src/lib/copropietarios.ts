import axios from "axios";
import { api } from "@/lib/api";

export interface Copropietario {
  id: string;
  nombre: string;
  apellido: string;
  ci: string;
  email?: string | null;
  telefono?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatosCopropietario {
  nombre: string;
  apellido: string;
  ci: string;
  email?: string;
  telefono?: string;
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_SOLO_NUMEROS = /^[0-9]+$/;

export function esCorreoValido(strCorreo: string): boolean {
  return REGEX_CORREO.test(strCorreo.trim());
}

export function esTelefonoValido(strTelefono: string): boolean {
  return REGEX_SOLO_NUMEROS.test(strTelefono.trim());
}

export type CampoPersona = "nombre" | "apellido" | "ci" | "telefono" | "email";

/** Devuelve, por campo, el mensaje de lo que hay que corregir. Vacío = datos válidos. */
export function validarDatosPersona(datos: Record<CampoPersona, string>): Partial<Record<CampoPersona, string>> {
  const errores: Partial<Record<CampoPersona, string>> = {};
  if (!datos.nombre.trim()) errores.nombre = "Ingresa el nombre.";
  if (!datos.apellido.trim()) errores.apellido = "Ingresa el apellido.";
  if (!datos.ci.trim()) errores.ci = "Ingresa el CI.";
  if (datos.telefono.trim() && !esTelefonoValido(datos.telefono)) {
    errores.telefono = "El teléfono solo puede contener números.";
  }
  if (datos.email.trim() && !esCorreoValido(datos.email)) {
    errores.email = "El correo no tiene un formato válido (ej. ejemplo@dominio.com).";
  }
  return errores;
}

export interface InmuebleDePersona {
  ocupanteId: string;
  inmuebleId: string;
  codigo: string;
  clase: "DEPARTAMENTO" | "BAULERA" | "PARQUEO";
  tipoInmueble: string | null;
  piso: string | null;
  areaM2: string | null;
  activo: boolean;
  rol: "PROPIETARIO" | "INQUILINO";
  fechaInicio: string;
  fechaFin: string | null;
  vigente: boolean;
}

export interface InmueblesDePersona {
  vigentes: InmuebleDePersona[];
  anteriores: InmuebleDePersona[];
  resumen: { departamentos: number; bauleras: number; parqueos: number; total: number };
}

export async function listarInmueblesDeCopropietario(id: string): Promise<InmueblesDePersona> {
  const response = await api.get<InmueblesDePersona>(`/copropietarios/${id}/inmuebles`);
  return response.data;
}

/**
 * Lista general de copropietarios. El rol CONSULTA no tiene acceso (403, QA bug 9): se devuelve una
 * lista vacía para que las pantallas que la usan como dato auxiliar (panel, ficha del inmueble,
 * residentes, búsqueda global) sigan cargando sin mostrar a otras personas.
 */
export async function listarCopropietarios(): Promise<Copropietario[]> {
  try {
    const response = await api.get<{ copropietarios: Copropietario[] }>("/copropietarios");
    return response.data.copropietarios;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 403) return [];
    throw error;
  }
}

export async function crearCopropietario(datos: DatosCopropietario): Promise<Copropietario> {
  const response = await api.post<{ copropietario: Copropietario }>("/copropietarios", datos);
  return response.data.copropietario;
}
