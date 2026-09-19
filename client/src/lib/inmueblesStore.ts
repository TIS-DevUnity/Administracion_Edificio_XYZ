"use client";

import { useSyncExternalStore } from "react";

export interface DatosInmueble {
  numeroDepartamento: string;
  piso: string;
  numeroParqueo: string;
  numeroBaulera: string;
}

export interface Inmueble extends DatosInmueble {
  id: string;
  activo: boolean;
  createdAt: string;
}

export type RolOcupante = "PROPIETARIO" | "INQUILINO";

export interface DatosAsignacion {
  inmuebleId: string;
  nombreCompleto: string;
  telefono: string;
  correo: string;
  rol: RolOcupante;
}

export interface Asignacion extends DatosAsignacion {
  id: string;
  fechaInicio: string;
  fechaFin: string | null;
  createdAt: string;
}

export type ResultadoOperacion<T> = { ok: true; datos: T } | { ok: false; mensaje: string; campo?: string };

const CLAVE_INMUEBLES = "mock_inmuebles";
const CLAVE_ASIGNACIONES = "mock_asignaciones";
const EVENTO_CAMBIO = "mock-datos-cambio";

let cacheInmuebles: Inmueble[] | null = null;
let cacheAsignaciones: Asignacion[] | null = null;

function leerDeStorage<T>(clave: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const strRaw = localStorage.getItem(clave);
    return strRaw ? (JSON.parse(strRaw) as T[]) : [];
  } catch (error: unknown) {
    console.error(`Error al leer ${clave}:`, error);
    return [];
  }
}

function notificarCambio() {
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

function guardarInmuebles(valor: Inmueble[]) {
  cacheInmuebles = valor;
  localStorage.setItem(CLAVE_INMUEBLES, JSON.stringify(valor));
  notificarCambio();
}

function guardarAsignaciones(valor: Asignacion[]) {
  cacheAsignaciones = valor;
  localStorage.setItem(CLAVE_ASIGNACIONES, JSON.stringify(valor));
  notificarCambio();
}

function getInmueblesSnapshot(): Inmueble[] {
  if (cacheInmuebles === null) {
    cacheInmuebles = leerDeStorage<Inmueble>(CLAVE_INMUEBLES);
  }
  return cacheInmuebles;
}

function getAsignacionesSnapshot(): Asignacion[] {
  if (cacheAsignaciones === null) {
    cacheAsignaciones = leerDeStorage<Asignacion>(CLAVE_ASIGNACIONES);
  }
  return cacheAsignaciones;
}

function getServerSnapshot<T>(): T[] {
  return [];
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  function invalidarCacheYNotificar() {
    cacheInmuebles = null;
    cacheAsignaciones = null;
    callback();
  }

  window.addEventListener(EVENTO_CAMBIO, callback);
  window.addEventListener("storage", invalidarCacheYNotificar);

  return () => {
    window.removeEventListener(EVENTO_CAMBIO, callback);
    window.removeEventListener("storage", invalidarCacheYNotificar);
  };
}

export function useInmuebles(): Inmueble[] {
  return useSyncExternalStore(subscribe, getInmueblesSnapshot, getServerSnapshot<Inmueble>);
}

export function useAsignaciones(): Asignacion[] {
  return useSyncExternalStore(subscribe, getAsignacionesSnapshot, getServerSnapshot<Asignacion>);
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_SOLO_NUMEROS = /^[0-9]+$/;

export function esCorreoValido(strCorreo: string): boolean {
  return REGEX_CORREO.test(strCorreo.trim());
}

export function esTelefonoValido(strTelefono: string): boolean {
  return REGEX_SOLO_NUMEROS.test(strTelefono.trim());
}

function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function esOcupanteActivo(asignacion: Asignacion): boolean {
  return asignacion.fechaFin === null;
}

export function esRangoFechaValido(strFechaInicio: string, strFechaFin: string | null): boolean {
  if (strFechaFin === null) {
    return true;
  }
  return strFechaFin >= strFechaInicio;
}

export function formatearFecha(strFechaISO: string): string {
  const objFecha = new Date(`${strFechaISO}T00:00:00`);
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric" }).format(objFecha);
}

export function ordenarHistorial(asignaciones: Asignacion[]): Asignacion[] {
  return [...asignaciones].sort((a, b) => {
    if (a.fechaInicio !== b.fechaInicio) {
      return a.fechaInicio > b.fechaInicio ? -1 : 1;
    }
    return a.createdAt > b.createdAt ? -1 : 1;
  });
}

export function registrarInmueble(datos: DatosInmueble): ResultadoOperacion<Inmueble> {
  const strDepartamento = datos.numeroDepartamento.trim();
  const strPiso = datos.piso.trim();

  if (!strDepartamento) {
    return { ok: false, mensaje: "El número de departamento es obligatorio.", campo: "numeroDepartamento" };
  }

  if (!strPiso) {
    return { ok: false, mensaje: "El piso es obligatorio.", campo: "piso" };
  }

  const inmueblesActuales = getInmueblesSnapshot();
  const bolYaExiste = inmueblesActuales.some(
    (inmueble) =>
      inmueble.numeroDepartamento.trim().toLowerCase() === strDepartamento.toLowerCase() &&
      inmueble.piso.trim().toLowerCase() === strPiso.toLowerCase()
  );

  if (bolYaExiste) {
    return {
      ok: false,
      mensaje: "Ya existe un inmueble registrado con ese número de departamento y piso.",
      campo: "numeroDepartamento",
    };
  }

  const objNuevo: Inmueble = {
    id: crypto.randomUUID(),
    numeroDepartamento: strDepartamento,
    piso: strPiso,
    numeroParqueo: datos.numeroParqueo.trim(),
    numeroBaulera: datos.numeroBaulera.trim(),
    activo: true,
    createdAt: new Date().toISOString(),
  };

  guardarInmuebles([objNuevo, ...inmueblesActuales]);

  return { ok: true, datos: objNuevo };
}

export function alternarActivoInmueble(strId: string) {
  const inmueblesActuales = getInmueblesSnapshot();
  guardarInmuebles(
    inmueblesActuales.map((inmueble) =>
      inmueble.id === strId ? { ...inmueble, activo: !inmueble.activo } : inmueble
    )
  );
}

export function registrarAsignacion(datos: DatosAsignacion): ResultadoOperacion<Asignacion> {
  if (!datos.inmuebleId) {
    return { ok: false, mensaje: "Selecciona un inmueble para continuar.", campo: "inmuebleId" };
  }

  const strNombre = datos.nombreCompleto.trim();
  if (!strNombre) {
    return { ok: false, mensaje: "El nombre completo es obligatorio.", campo: "nombreCompleto" };
  }

  const strTelefono = datos.telefono.trim();
  if (!strTelefono) {
    return { ok: false, mensaje: "El teléfono es obligatorio.", campo: "telefono" };
  }
  if (!esTelefonoValido(strTelefono)) {
    return { ok: false, mensaje: "El teléfono solo debe contener números.", campo: "telefono" };
  }

  const strCorreo = datos.correo.trim();
  if (!strCorreo) {
    return { ok: false, mensaje: "El correo electrónico es obligatorio.", campo: "correo" };
  }
  if (!esCorreoValido(strCorreo)) {
    return { ok: false, mensaje: "El correo electrónico no es válido.", campo: "correo" };
  }

  if (datos.rol !== "PROPIETARIO" && datos.rol !== "INQUILINO") {
    return { ok: false, mensaje: "Selecciona un rol (Propietario o Inquilino).", campo: "rol" };
  }

  const asignacionesActuales = getAsignacionesSnapshot();
  const bolYaActivaIgual = asignacionesActuales.some(
    (asignacion) =>
      asignacion.inmuebleId === datos.inmuebleId &&
      esOcupanteActivo(asignacion) &&
      asignacion.rol === datos.rol &&
      asignacion.correo.trim().toLowerCase() === strCorreo.toLowerCase()
  );

  if (bolYaActivaIgual) {
    return {
      ok: false,
      mensaje: "Esta persona ya se encuentra asignada activamente a este inmueble con este rol.",
      campo: "correo",
    };
  }

  const strHoy = fechaHoyISO();

  const asignacionesConCierre = asignacionesActuales.map((asignacion) =>
    asignacion.inmuebleId === datos.inmuebleId && esOcupanteActivo(asignacion)
      ? { ...asignacion, fechaFin: strHoy }
      : asignacion
  );

  const objNueva: Asignacion = {
    id: crypto.randomUUID(),
    inmuebleId: datos.inmuebleId,
    nombreCompleto: strNombre,
    telefono: strTelefono,
    correo: strCorreo,
    rol: datos.rol,
    fechaInicio: strHoy,
    fechaFin: null,
    createdAt: new Date().toISOString(),
  };

  guardarAsignaciones([objNueva, ...asignacionesConCierre]);

  return { ok: true, datos: objNueva };
}
