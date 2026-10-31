"use client";
import type { Nomina } from "@/types/nomina";

/**
 * PUNTO DE INTEGRACIÓN PARA (HU8, funcionalidad 3).
 * Sustituye el contenido de este componente por sus formularios de
 * bono, hora extra y descuento.
 * Al guardar, ejecutar onActualizada() para invalidar el detalle y la lista.
 */
export function GestionConceptosSlot({ nomina, onActualizada }: { nomina: Nomina; onActualizada: () => void }) {
  void onActualizada;
  if (nomina.estado === "PAGADA") return null;
  return <p className="font-caption rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
    La nómina está pendiente. La gestión de bonos, horas extra y descuentos se incorporará aquí.
  </p>;
}
