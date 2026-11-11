"use client";

import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Comunicado, ETIQUETAS_CANAL, ETIQUETAS_ESTADO, fechaComunicado } from "@/lib/comunicados";

interface Props {
  abierto: boolean;
  cargando: boolean;
  comunicado: Comunicado | null;
  error: string;
  onCerrar: () => void;
}

export function DetalleComunicadoDialog({ abierto, cargando, comunicado, error, onCerrar }: Props) {
  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-h-[90vh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalle del comunicado</DialogTitle>
          <DialogDescription>Consulta de solo lectura. Los comunicados emitidos no se pueden editar ni eliminar.</DialogDescription>
        </DialogHeader>
        {cargando ? <p className="py-8 text-center text-sm text-muted-foreground">Cargando comunicado...</p> : error ? (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
        ) : comunicado ? (
          <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden text-sm">
            <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Título</p><p className="min-w-0 [overflow-wrap:anywhere] font-semibold">{comunicado.titulo}</p></div>
            <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Mensaje</p><div className="max-h-60 min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border bg-muted/30 p-3 leading-6">{comunicado.cuerpo}</div></div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div><p className="mb-1 text-xs text-muted-foreground">Estado</p><Badge variant="secondary">{ETIQUETAS_ESTADO[comunicado.estado]}</Badge></div>
              <div><p className="mb-1 text-xs text-muted-foreground">Destinatarios</p><p>{comunicado.totalDestinatarios ?? "No disponible"}</p></div>
              <div><p className="mb-1 text-xs text-muted-foreground">Creado por</p><p>{comunicado.creadoPor ? `${comunicado.creadoPor.nombre} ${comunicado.creadoPor.apellido}` : "No disponible"}</p></div>
              <div><p className="mb-1 text-xs text-muted-foreground">Fecha de creación</p><p>{fechaComunicado(comunicado.createdAt)}</p></div>
              <div className="sm:col-span-2"><p className="mb-1 text-xs text-muted-foreground">Canales</p><div className="flex flex-wrap gap-2">{comunicado.canales.map((c) => <Badge key={c} variant="outline">{ETIQUETAS_CANAL[c]}</Badge>)}</div></div>
              {comunicado.enviadoEn && <div className="sm:col-span-2"><p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" /> Fecha de envío</p><p>{fechaComunicado(comunicado.enviadoEn)}</p></div>}
            </div>
            {comunicado.estado === "FALLIDO" && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="size-4" /> Motivo del fallo</p>
                <p className="mt-1 min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{comunicado.causaFallo || "El servidor no proporcionó una causa."}</p>
              </div>
            )}
          </div>
        ) : null}
        <DialogFooter><Button variant="outline" onClick={onCerrar}>Cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
