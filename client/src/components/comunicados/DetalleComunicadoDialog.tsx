"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Comunicado, ETIQUETAS_CANAL, ETIQUETAS_ESTADO, FilaResultado, ResumenEnvio, fechaComunicado, obtenerResultadoComunicado, obtenerErrorComunicado } from "@/lib/comunicados";

interface Props { abierto: boolean; cargando: boolean; comunicado: Comunicado | null; error: string; onCerrar: () => void; }
export function DetalleComunicadoDialog({ abierto, cargando, comunicado, error, onCerrar }: Props) {
  const [resumen, setResumen] = useState<ResumenEnvio | null>(null);
  const [filas, setFilas] = useState<FilaResultado[]>([]);
  const [errorResultado, setErrorResultado] = useState("");
  const [resultadoComunicadoId, setResultadoComunicadoId] = useState<string | null>(null);
  const comunicadoId = comunicado?.id;
  const comunicadoEstado = comunicado?.estado;

  useEffect(() => {
    if (!abierto || !comunicadoId || comunicadoEstado === "BORRADOR") return;

    let activo = true;
    obtenerResultadoComunicado(comunicadoId)
      .then((r) => {
        if (!activo) return;
        setResumen(r.resumen);
        setFilas(r.destinatarios);
        setErrorResultado("");
        setResultadoComunicadoId(comunicadoId);
      })
      .catch((e: unknown) => {
        if (!activo) return;
        setErrorResultado(obtenerErrorComunicado(e, "No se pudo consultar el resultado del envío."));
        setResultadoComunicadoId(comunicadoId);
      });

    return () => { activo = false; };
  }, [abierto, comunicadoId, comunicadoEstado]);

  const resultadoActual = resultadoComunicadoId === comunicadoId;
  return <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}><DialogContent className="max-h-[90vh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Detalle del comunicado</DialogTitle><DialogDescription>Contenido, estado y resultado de entrega por destinatario y canal.</DialogDescription></DialogHeader>
    {cargando ? <p className="py-8 text-center text-sm text-muted-foreground">Cargando comunicado…</p> : error ? <p role="alert" className="rounded-lg border border-destructive/20 p-3 text-sm text-destructive">{error}</p> : comunicado && <div className="min-w-0 space-y-4 text-sm">
      <div><p className="text-xs text-muted-foreground">Título</p><p className="font-semibold [overflow-wrap:anywhere]">{comunicado.titulo}</p></div>
      <div><p className="text-xs text-muted-foreground">Mensaje</p><p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 [overflow-wrap:anywhere]">{comunicado.cuerpo}</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs text-muted-foreground">Estado</p><Badge variant="secondary">{ETIQUETAS_ESTADO[comunicado.estado]}</Badge></div><div><p className="text-xs text-muted-foreground">Destinatarios</p><p>{comunicado.totalDestinatarios ?? "Pendiente de envío"}</p></div><div><p className="text-xs text-muted-foreground">Creado por</p><p>{comunicado.creadoPor ? `${comunicado.creadoPor.nombre} ${comunicado.creadoPor.apellido}` : "No disponible"}</p></div><div><p className="text-xs text-muted-foreground">Fecha de creación</p><p>{fechaComunicado(comunicado.createdAt)}</p></div><div className="sm:col-span-2"><p className="mb-1 text-xs text-muted-foreground">Canales</p><div className="flex flex-wrap gap-2">{comunicado.canales.map((c) => <Badge key={c} variant="outline">{ETIQUETAS_CANAL[c]}</Badge>)}</div></div>{comunicado.enviadoEn && <div className="sm:col-span-2"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3"/> Fecha de envío / intento</p><p>{fechaComunicado(comunicado.enviadoEn)}</p></div>}</div>
      {comunicado.estado === "FALLIDO" && <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3"><p className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="size-4"/> Motivo del fallo</p><p className="mt-1 [overflow-wrap:anywhere]">{comunicado.causaFallo || "El servidor no proporcionó una causa."}</p></div>}
      {comunicado.estado !== "BORRADOR" && <section className="space-y-2"><h3 className="font-semibold">Resultado del envío</h3>{resultadoActual && resumen ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[{t:"Destinatarios",n:resumen.totalDestinatarios},{t:"Enviados",n:resumen.enviados},{t:"Fallidos",n:resumen.fallidos},{t:"Omitidos",n:resumen.omitidos}].map((x) => <div key={x.t} className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">{x.t}</p><p className="text-xl font-semibold tabular-nums">{x.n}</p></div>)}</div> : !resultadoActual && <p className="text-xs text-muted-foreground">Cargando resultados…</p>}{resultadoActual && errorResultado && <p role="alert" className="text-xs text-destructive">{errorResultado}</p>}
        {resultadoActual && filas.length > 0 && <div className="max-h-64 overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">Residente</th><th className="p-2">Canal</th><th className="p-2">Destino</th><th className="p-2">Estado / motivo</th></tr></thead><tbody>{filas.map((f,i) => <tr key={`${f.copropietarioId ?? f.nombre}-${f.canal}-${i}`} className="border-t"><td className="p-2">{f.nombre}</td><td className="p-2">{ETIQUETAS_CANAL[f.canal]}</td><td className="p-2 [overflow-wrap:anywhere]">{f.destinoReal || f.email || f.telefono || "—"}</td><td className="p-2"><Badge variant="outline" className={f.estado === "ENVIADO" ? "text-emerald-700" : f.estado === "FALLIDO" ? "text-destructive" : "text-muted-foreground"}>{f.estado}</Badge>{f.motivo && <p className="mt-1 max-w-52 [overflow-wrap:anywhere] text-muted-foreground">{f.motivo}</p>}</td></tr>)}</tbody></table></div>}
      </section>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onCerrar}>Cerrar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
