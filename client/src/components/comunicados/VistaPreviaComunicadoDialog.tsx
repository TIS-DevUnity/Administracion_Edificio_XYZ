"use client";

import { ArrowLeft, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatosComunicado, ETIQUETAS_CANAL } from "@/lib/comunicados";

interface Props {
  datos: DatosComunicado;
  cargando: boolean;
  error: string;
  onVolver: () => void;
  onGuardar: () => void;
}

/** La vista previa confirma SOLO el guardado del borrador; no envía mensajes. */
export function VistaPreviaComunicadoDialog({ datos, cargando, error, onVolver, onGuardar }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Vista previa del comunicado</p>
        <p className="text-xs text-muted-foreground">Comprueba el contenido y los canales antes de guardar.</p>
      </div>
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Título</p>
          <p className="mt-1 break-words font-medium">{datos.titulo.trim()}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mensaje</p>
          <p className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{datos.cuerpo.trim()}</p>
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Canales seleccionados</p>
          <div className="flex flex-wrap gap-2">
            {datos.canales.map((canal) => <Badge variant="outline" key={canal}>{ETIQUETAS_CANAL[canal]}</Badge>)}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground"><Send className="size-4" /> Envío no disponible todavía</div>
        Este comunicado se guardará como <strong>BORRADOR</strong>. No se enviarán correos ni mensajes de WhatsApp. El número real de destinatarios estará disponible cuando Backend implemente el envío.
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onVolver} disabled={cargando}><ArrowLeft /> Volver a editar</Button>
        <Button type="button" onClick={onGuardar} cargando={cargando}><Save /> Guardar borrador</Button>
      </div>
    </div>
  );
}
