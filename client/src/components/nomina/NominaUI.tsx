"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dinero } from "./nomina-utils";

export const CLASE_LABEL = "font-caption text-[11px] uppercase tracking-[0.01em] text-muted-foreground";
export const CLASE_SUBTITULO = "font-subtitle text-[14px] font-semibold text-foreground";

export function EstadoBadge({ estado }: { estado: "PAGADA" | "PENDIENTE" }) {
  return <Badge variant="outline" className={estado === "PAGADA" ? "border-success/30 bg-success-subtle text-success" : "border-primary/30 bg-primary/10 text-primary"}>
    {estado === "PAGADA" ? "Pagada" : "Pendiente"}
  </Badge>;
}
export function IndicadorNomina({ etiqueta, valor, tono = "normal", detalle }: { etiqueta: string; valor: string | number; tono?: "normal" | "positivo" | "negativo"; detalle?: string }) {
  const color = tono === "positivo" ? "text-success" : tono === "negativo" ? "text-destructive" : "text-foreground";
  return <Card><CardContent className="space-y-2">
    <p className={CLASE_LABEL}>{etiqueta}</p>
    <p className={`font-title text-[24px] ${color}`}>{typeof valor === "number" ? dinero(valor) : valor}</p>
    {detalle && <p className="font-caption text-[11px] text-muted-foreground">{detalle}</p>}
  </CardContent></Card>;
}
export function ErrorNomina({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-danger-subtle p-3 text-[13px] text-foreground">
    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" />{mensaje}</span>
    {reintentar && <Button size="sm" variant="outline" onClick={reintentar}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Button>}
  </div>;
}
export function CargandoNomina() {
  return <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
}
