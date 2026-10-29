import type { MouseEvent } from "react";

/** Clases de la guía visual (client/CLAUDE.md) usadas en la pantalla de movimientos (HU6). */

/** Encabezados de tarjetas y agrupadores: font-subtitle (se ve en mayúsculas). */
export const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
export const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
export const CLASE_DESCRIPCION_DIALOGO = "text-[13px] leading-[1.45] text-muted-foreground";
/** Labels de campo y headers de tabla: font-caption. */
export const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_ERROR_CAMPO = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-destructive";
/** Cifras de KPI: font-title. */
export const CLASE_CIFRA = "font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";

/** Ingreso = entrada (verde), gasto = salida (rojo). */
export const CLASE_TEXTO_INGRESO = "text-success";
export const CLASE_TEXTO_GASTO = "text-destructive";
export const CLASE_BADGE_INGRESO = "font-caption gap-1 border-success/30 bg-success-subtle text-[11px] text-success";
export const CLASE_BADGE_GASTO = "font-caption gap-1 border-destructive/30 bg-danger-subtle text-[11px] text-destructive";

export const CLASE_AVISO_EXITO = "rounded-lg border border-success/20 bg-success-subtle p-3 text-[13px] text-success";
export const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle p-3 text-[13px] text-destructive";
/** Advertencia (no es error): acento secundario de la paleta. */
export const CLASE_AVISO_ADVERTENCIA = "rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-3 text-[13px] text-foreground";

/** Abre el calendario nativo con un clic en cualquier parte del campo de fecha, no solo en el ícono. */
export function abrirCalendario(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Algunos navegadores no permiten showPicker en ciertos contextos: queda el ícono como alternativa.
  }
}
