import { crearEstado, ErrorSimulacion, type EstadoSimulacion } from "./motor";

/** Solo dentro de esta ruta las llamadas a la API van al motor de simulación. */
export const RUTA_SIMULACION = "/admin/morosidad/simulacion";

export function enRutaSimulacion() {
  if (typeof window === "undefined") return false;
  const { pathname } = window.location;
  return pathname === RUTA_SIMULACION || pathname.startsWith(`${RUTA_SIMULACION}/`);
}

// Subir la versión descarta las simulaciones guardadas cuando cambia la forma de los datos.
const VERSION_DATOS = "v2";

function claveEstado() {
  let usuarioId = "anonimo";
  try {
    usuarioId = (JSON.parse(localStorage.getItem("usuario") ?? "{}") as { id?: string }).id ?? usuarioId;
  } catch {
    // Sin sesión legible los datos quedan bajo la clave genérica.
  }
  return `simulacion-morosidad:${VERSION_DATOS}:${usuarioId}`;
}

// Se reutiliza lo ya interpretado mientras el texto guardado no cambie.
let cache: { crudo: string; estado: EstadoSimulacion } | null = null;

export function leerEstado(): EstadoSimulacion | null {
  if (typeof window === "undefined") return null;
  const crudo = localStorage.getItem(claveEstado());
  if (!crudo) return null;
  if (cache?.crudo !== crudo) cache = { crudo, estado: JSON.parse(crudo) as EstadoSimulacion };
  return cache.estado;
}

function guardarEstado(estado: EstadoSimulacion) {
  const crudo = JSON.stringify(estado);
  try {
    localStorage.setItem(claveEstado(), crudo);
  } catch {
    throw new ErrorSimulacion("Se llenó el espacio de la simulación en este navegador. Elimina los datos o avanza menos meses.", 507);
  }
  cache = { crudo, estado };
}

/** Ejecuta un cambio sobre el estado: si falla, no queda nada a medias. */
export function modificarEstado<T>(cambio: (estado: EstadoSimulacion) => T): T {
  const estado = leerEstado();
  if (!estado) throw new ErrorSimulacion("La simulación todavía no tiene datos cargados.", 409);
  try {
    const resultado = cambio(estado);
    guardarEstado(estado);
    return resultado;
  } catch (err) {
    cache = null;
    throw err;
  }
}

export function iniciarEstado(...datos: Parameters<typeof crearEstado>) {
  guardarEstado(crearEstado(...datos));
}

export function borrarEstado() {
  localStorage.removeItem(claveEstado());
  localStorage.removeItem(claveEstado().replace(VERSION_DATOS, "v1"));
  cache = null;
}

/** Día simulado, solo mientras se está dentro del entorno de simulación. */
export function fechaSimuladaActiva(): string | null {
  return enRutaSimulacion() ? leerEstado()?.fecha ?? null : null;
}
