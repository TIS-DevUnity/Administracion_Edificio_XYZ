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

export async function listarCopropietarios(): Promise<Copropietario[]> {
  const response = await api.get<{ copropietarios: Copropietario[] }>("/copropietarios");
  return response.data.copropietarios;
}

export async function crearCopropietario(datos: DatosCopropietario): Promise<Copropietario> {
  const response = await api.post<{ copropietario: Copropietario }>("/copropietarios", datos);
  return response.data.copropietario;
}
