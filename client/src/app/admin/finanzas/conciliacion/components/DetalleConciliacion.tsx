"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cajaBancosService } from "@/services/caja-bancos.service";
import type { Comprobacion, ExtractoEntrada, MovimientoCaja, TipoMovimientoCaja } from "@/types/caja-bancos";
import { dinero, fechaLegible, mensajeError, montoValido } from "@/components/caja-bancos/format";

interface Props { movimiento: MovimientoCaja | null; onClose: () => void; administrador: boolean; }
const estilosInput = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export default function DetalleConciliacion({ movimiento, onClose, administrador }: Props) {
  const qc = useQueryClient();
  const [extracto, setExtracto] = useState<ExtractoEntrada>({ fecha: "", monto: "", tipo: "INGRESO", referencia: "", observacion: "" });
  const [resultado, setResultado] = useState<Comprobacion | null>(null);
  const [error, setError] = useState("");
  const id = movimiento?.id ?? "";
  const detalle = useQuery({ queryKey: ["hu7", "detalle", id], queryFn: () => cajaBancosService.detalleMovimiento(id), enabled: Boolean(id) });

  useEffect(() => {
    if (!movimiento) return;
    // Reiniciar únicamente cuando se abre otro asiento (evita resultados viejos).
    const nuevo: ExtractoEntrada = { fecha: movimiento.fecha, monto: movimiento.monto, tipo: movimiento.tipo, referencia: movimiento.referencia ?? "", observacion: movimiento.observacion ?? "" };
    queueMicrotask(() => { setExtracto(nuevo); setResultado(null); setError(""); });
  }, [movimiento?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const comprobar = useMutation({ mutationFn: () => cajaBancosService.comprobar(id, extracto), onSuccess: setResultado, onError: e => { setResultado(null); setError(mensajeError(e)); } });
  const conciliar = useMutation({
    mutationFn: () => cajaBancosService.conciliar(id, extracto),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["hu7"] }); setError(""); onClose(); },
    onError: e => setError(mensajeError(e)),
  });
  const observacion = useMutation({
    mutationFn: () => cajaBancosService.observacion(id, extracto.observacion ?? ""),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["hu7"] }); setError("Observación guardada."); },
    onError: e => setError(mensajeError(e)),
  });
  const ocupado = comprobar.isPending || conciliar.isPending || observacion.isPending;
  const bloqueado = Boolean(movimiento?.bloqueado || movimiento?.estado === "CONCILIADO");
  const entradaValida = /^\d{4}-\d{2}-\d{2}$/.test(extracto.fecha) && montoValido(extracto.monto, false);
  const cambiar = (campo: keyof ExtractoEntrada, valor: string) => { setExtracto(p => ({ ...p, [campo]: valor })); setResultado(null); setError(""); };

  return <Dialog open={Boolean(movimiento)} onOpenChange={open => { if (!open && !ocupado) onClose(); }}>
    <DialogContent showCloseButton={!ocupado} className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Detalle y conciliación del movimiento</DialogTitle></DialogHeader>
      {detalle.isLoading ? <p className="text-sm">Cargando detalle...</p> : detalle.isError ? <p role="alert" className="text-sm text-destructive">{mensajeError(detalle.error)}</p> : detalle.data && <>
        <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Concepto:</span> {detalle.data.movimiento.concepto}</p>
          <p><span className="text-muted-foreground">Cuenta:</span> {detalle.data.movimiento.cuenta.nombre}</p>
          <p><span className="text-muted-foreground">Fecha:</span> {fechaLegible(detalle.data.movimiento.fecha)}</p>
          <p><span className="text-muted-foreground">Importe:</span> {dinero(detalle.data.movimiento.monto)}</p>
          <p><span className="text-muted-foreground">Tipo:</span> {detalle.data.movimiento.tipo}</p>
          <p><span className="text-muted-foreground">Referencia:</span> {detalle.data.movimiento.referencia ?? "Sin referencia"}</p>
          <p><span className="text-muted-foreground">Origen:</span> {detalle.data.origen.tipo}</p>
          <p><span className="text-muted-foreground">Estado:</span> {detalle.data.movimiento.estadoEtiqueta ?? detalle.data.movimiento.estado}</p>
          <p><span className="text-muted-foreground">Registrado por:</span> {detalle.data.registradoPor ? `${detalle.data.registradoPor.nombre ?? ""} ${detalle.data.registradoPor.apellido ?? ""}` : "Sin asignar"}</p>
          <p><span className="text-muted-foreground">Conciliado por:</span> {detalle.data.conciliadoPor ? `${detalle.data.conciliadoPor.nombre ?? ""} ${detalle.data.conciliadoPor.apellido ?? ""}` : "No conciliado"}</p>
        </div>
        {detalle.data.extracto.fecha && <div className="rounded-lg border bg-muted/30 p-3 text-xs">Última comparación: {fechaLegible(detalle.data.extracto.fecha)} · {dinero(detalle.data.extracto.monto)} · Diferencia {dinero(detalle.data.extracto.diferencia)}</div>}
        {administrador && !bloqueado && <>
          <div className="border-t pt-3"><h3 className="font-semibold">Comparar con extracto / arqueo real</h3><p className="text-xs text-muted-foreground">Comprueba antes de conciliar. Si algún dato no coincide, se dejará pendiente de revisión.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">Fecha del extracto <input aria-label="Fecha del extracto" className={estilosInput} type="date" value={extracto.fecha} onChange={e => cambiar("fecha", e.target.value)}/></label>
            <label className="text-xs">Monto (Bs) <input aria-label="Monto del extracto" className={estilosInput} inputMode="decimal" value={extracto.monto} onChange={e => cambiar("monto", e.target.value)}/></label>
            <label className="text-xs">Tipo <select className={estilosInput} value={extracto.tipo} onChange={e => cambiar("tipo", e.target.value as TipoMovimientoCaja)}><option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option></select></label>
            <label className="text-xs">Referencia <input className={estilosInput} maxLength={200} value={extracto.referencia ?? ""} onChange={e => cambiar("referencia", e.target.value)}/></label>
          </div>
          <label className="block text-xs">Observación {resultado && !resultado.coincide ? "(obligatoria para diferencias)" : "(opcional)"}<textarea className={`${estilosInput} min-h-20`} maxLength={500} value={extracto.observacion ?? ""} onChange={e => cambiar("observacion", e.target.value)}/></label>
          {resultado && <div className={`rounded-lg border p-3 text-sm ${resultado.coincide ? "border-emerald-500/40" : "border-amber-500/40"}`}>
            <p className="font-medium">{resultado.coincide ? "Coincide con el extracto" : "Se encontraron diferencias"}</p>
            {resultado.diferencias.map((d, i) => <p key={i} className="mt-1 text-xs">{d.campo}: sistema {String(d.nuestro ?? "(vacío)")} / extracto {String(d.banco ?? "(vacío)")}</p>)}
          </div>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={ocupado || !entradaValida} onClick={() => { setError(""); comprobar.mutate(); }}>{comprobar.isPending ? "Comparando..." : "Comprobar"}</Button>
            <Button variant="outline" disabled={ocupado || !(extracto.observacion ?? "").trim()} onClick={() => observacion.mutate()}>Guardar observación</Button>
            <Button disabled={ocupado || !resultado || !resultado.puedeConciliar || (!resultado.coincide && !(extracto.observacion ?? "").trim())} onClick={() => {
              if (window.confirm(resultado?.coincide ? "¿Confirmar conciliación de este movimiento?" : "¿Registrar el movimiento CON DIFERENCIA, pendiente de revisión?")) conciliar.mutate();
            }}>{conciliar.isPending ? "Guardando..." : resultado?.coincide ? "Confirmar conciliación" : "Registrar diferencia"}</Button>
          </div>
        </>}
        {bloqueado && <p className="rounded-lg border p-2 text-xs text-muted-foreground">El movimiento está conciliado o pertenece a un período cerrado. Solo lectura.</p>}
        <div className="border-t pt-3"><h3 className="font-medium">Historial de operaciones</h3>{detalle.data.historial.length === 0 ? <p className="text-xs text-muted-foreground">Sin eventos previos.</p> : <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{detalle.data.historial.map(ev => <p className="text-xs" key={ev.id}>{fechaLegible(ev.fecha)} · {ev.operacion} · {ev.resultado} · {ev.usuario ? `${ev.usuario.nombre ?? ""} ${ev.usuario.apellido ?? ""}` : "Sin usuario"}</p>)}</div>}</div>
      </>}
      {error && <p role="alert" className="rounded-md bg-muted p-2 text-xs">{error}</p>}
    </DialogContent>
  </Dialog>;
}
