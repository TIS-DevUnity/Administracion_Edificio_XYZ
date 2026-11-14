import { fechaRealBolivia, formatCurrency, formatearFechaCalendario } from "@/app/admin/morosidad/utils/morosidad";
import type { ParametrosReporte, TipoReporte } from "@/types/reportes";

export const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
export const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground";
export const CLASE_CIFRA = "font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";

export const TIPOS_REPORTE: { id: TipoReporte; titulo: string; descripcion: string }[] = [
  {
    id: "BALANCE_GENERAL",
    titulo: "Balance general",
    descripcion: "Activos, pasivos y patrimonio del edificio a la fecha de emisión.",
  },
  {
    id: "FLUJO_CAJA",
    titulo: "Flujo de caja",
    descripcion: "Saldo inicial, ingresos, egresos y saldo final de un rango de fechas.",
  },
  {
    id: "MOROSOS",
    titulo: "Listado de morosos",
    descripcion: "Inmuebles con expensas vencidas e impagas, con su mora y antigüedad.",
  },
];

export function tituloTipo(tipo: TipoReporte | undefined): string {
  return TIPOS_REPORTE.find((t) => t.id === tipo)?.titulo ?? "Reporte";
}

/** Los importes llegan como texto ("1234.50"). */
export function bs(valor: string | number | null | undefined): string {
  return formatCurrency(Number(valor ?? 0));
}

export function fechaCal(valor: string | null | undefined): string {
  return valor ? formatearFechaCalendario(valor) : "—";
}

export function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz",
  }).format(new Date(iso));
}

/** "2026-03" → "marzo 2026". */
export function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) return periodo;
  return new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 15)));
}

export function parametrosIniciales(): ParametrosReporte {
  const hoy = fechaRealBolivia();
  return { tipo: "BALANCE_GENERAL", desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, tipoMovimiento: "", orden: "monto" };
}

/** El balance no tiene rango: siempre es a la fecha de emisión. */
export function usaRango(tipo: TipoReporte): boolean {
  return tipo !== "BALANCE_GENERAL";
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFechaReal = (v: string) => SOLO_FECHA.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export interface ErroresParametros {
  desde?: string;
  hasta?: string;
}

/**
 * Mismas reglas que el backend (morosos.util.js → validarRango) más una propia de la pantalla: no se
 * piden fechas futuras, porque los reportes son sobre lo ya registrado. Los periodos anteriores no tienen límite.
 */
export function validarParametros(p: ParametrosReporte): ErroresParametros {
  if (!usaRango(p.tipo)) return {};
  const errores: ErroresParametros = {};
  const hoy = fechaRealBolivia();

  if (!p.desde) errores.desde = "La fecha de inicio es obligatoria.";
  else if (!esFechaReal(p.desde)) errores.desde = "La fecha de inicio no es válida.";
  else if (p.desde > hoy) errores.desde = "La fecha de inicio no puede ser futura.";

  if (!p.hasta) errores.hasta = "La fecha de finalización es obligatoria.";
  else if (!esFechaReal(p.hasta)) errores.hasta = "La fecha de finalización no es válida.";
  else if (p.hasta > hoy) errores.hasta = "La fecha de finalización no puede ser posterior a hoy.";

  if (!errores.desde && !errores.hasta && p.desde > p.hasta) {
    errores.hasta = "La fecha de finalización debe ser igual o posterior a la de inicio.";
  }
  return errores;
}

/** Clave estable de los parámetros: si cambia, la vista previa ya no corresponde a lo elegido. */
export function claveParametros(p: ParametrosReporte): string {
  return usaRango(p.tipo)
    ? [p.tipo, p.desde, p.hasta, p.tipo === "FLUJO_CAJA" ? p.tipoMovimiento : p.orden].join("|")
    : p.tipo;
}
