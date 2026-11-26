"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatosComunicado, ETIQUETAS_CANAL, obtenerErrorComunicado, obtenerVistaPreviaComunicado, enviarComunicado, VistaPreviaComunicado, ResumenEnvio } from "@/lib/comunicados";

interface Props {
  comunicadoId: string; datos: DatosComunicado; onVolver: () => void;
  onEnviado: (resumen: ResumenEnvio) => void;
}
export function VistaPreviaComunicadoDialog({ comunicadoId, datos, onVolver, onEnviado }: Props) {
  const [vista, setVista] = useState<VistaPreviaComunicado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let vigente = true;
    obtenerVistaPreviaComunicado(comunicadoId).then((r) => { if (vigente) setVista(r); })
      .catch((e: unknown) => { if (vigente) setError(obtenerErrorComunicado(e, "No se pudo preparar la vista previa.")); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [comunicadoId]);
  async function confirmarEnvio() {
    if (enviando || !vista?.puedeEnviar) return;
    setEnviando(true); setError("");
    try { const resultado = await enviarComunicado(comunicadoId); onEnviado(resultado.resumen); }
    catch (e) { setError(obtenerErrorComunicado(e, "No se pudo enviar el comunicado.")); }
    finally { setEnviando(false); }
  }
  return <div className="min-w-0 space-y-4">
    <div><p className="font-semibold">Confirma el comunicado antes de enviarlo</p><p className="text-xs text-muted-foreground">Esta revisión consulta los destinatarios actuales. El envío solo ocurre al confirmar.</p></div>
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div><p className="text-[11px] uppercase text-muted-foreground">Título</p><p className="font-medium [overflow-wrap:anywhere]">{datos.titulo.trim()}</p></div>
      <div><p className="text-[11px] uppercase text-muted-foreground">Mensaje</p><p className="max-h-40 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{datos.cuerpo.trim()}</p></div>
      <div><p className="mb-1 text-[11px] uppercase text-muted-foreground">Canales</p><div className="flex flex-wrap gap-2">{datos.canales.map((c) => <Badge key={c} variant="outline">{ETIQUETAS_CANAL[c]}</Badge>)}</div></div>
      {cargando ? <p className="text-sm text-muted-foreground">Calculando destinatarios…</p> : vista && <div className="flex items-center gap-2 border-t pt-3 text-sm"><Users className="size-4"/><strong>{vista.totalDestinatarios}</strong> destinatarios previstos <span className="text-muted-foreground">({vista.destinatariosModo === "TODOS" ? "todos los residentes vigentes" : "residentes seleccionados"})</span></div>}
      {vista && vista.sinOcupacionVigente > 0 && <p className="text-xs text-amber-700">{vista.sinOcupacionVigente} destinatario(s) ya no tienen ocupación vigente y serán omitidos.</p>}
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
      <Button variant="outline" onClick={onVolver} disabled={enviando}><ArrowLeft/> Volver a editar</Button>
      <Button onClick={() => void confirmarEnvio()} disabled={cargando || enviando || !vista?.puedeEnviar}><Send/> {enviando ? "Enviando…" : "Confirmar y enviar"}</Button>
    </div>
  </div>;
}
