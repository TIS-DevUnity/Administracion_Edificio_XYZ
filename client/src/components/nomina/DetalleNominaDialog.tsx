"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { nominaService, mensajeErrorNomina } from "@/services/nomina.service";
import { dinero, descargarBlob, fechaCorta, imprimirBlob, nombreEmpleado } from "./nomina-utils";
import { CLASE_LABEL, CLASE_SUBTITULO, CargandoNomina, ErrorNomina, EstadoBadge } from "./NominaUI";
import { GestionConceptosSlot } from "./front1/GestionConceptosSlot";
import { PagarNominaDialog } from "./PagarNominaDialog";
import { ETIQUETA_METODO } from "@/components/personal/PersonalUI";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DetalleNominaDialog({ nominaId, onCerrar }: { nominaId: string | null; onCerrar: () => void }) {
  const { usuario } = useSesionActual();
  const admin = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const client = useQueryClient();
  const consulta = useQuery({
    queryKey: ["hu8", "detalle", nominaId],
    queryFn: () => nominaService.detalle(nominaId!),
    enabled: !!nominaId,
  });
  const [pagar, setPagar] = useState(false);
  const [accionPdf, setAccionPdf] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const n = consulta.data;

  async function descargar() {
    if (!n || accionPdf) return;
    setAccionPdf(true); setError("");
    try { descargarBlob(await nominaService.boletaPdf(n.id), `boleta-nomina-${n.periodo}-${n.empleado.documento}.pdf`); }
    catch (err) { setError(mensajeErrorNomina(err)); }
    finally { setAccionPdf(false); }
  }
  async function imprimir() {
    if (!n || accionPdf) return;
    setAccionPdf(true); setError("");
    try { await imprimirBlob(nominaService.boletaPdf(n.id)); }
    catch (err) { setError(mensajeErrorNomina(err)); }
    finally { setAccionPdf(false); }
  }

  return <>
    <Dialog open={!!nominaId && !pagar} onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-subtitle">Detalle de nómina</DialogTitle>
          <DialogDescription>Desglose salarial del período. Los cálculos y estados provienen del backend.</DialogDescription>
        </DialogHeader>
        {consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : n && <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div><p className="text-[15px] font-medium">{nombreEmpleado(n.empleado)}</p>
              <p className="font-caption text-[11px] text-muted-foreground">{n.empleado.cargo} · CI {n.empleado.documento} · Período {n.periodo}</p>
            </div><EstadoBadge estado={n.estado} />
          </div>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className={CLASE_SUBTITULO}>Composición salarial</p>
            {([
              ["Sueldo base", n.sueldoBase, ""],
              ["Bonos", n.totalBonos, "text-success"],
              ["Horas extra", n.totalHorasExtra, "text-success"],
              ["Descuentos", n.totalDescuentos, "text-destructive"],
              ["Anticipos aplicados", n.totalAnticipos, "text-destructive"],
            ] as const).map(([label, value, color]) => <div className="flex items-center justify-between gap-3 text-[13px]" key={label}>
              <span className="text-muted-foreground">{label}</span><span className={color}>{dinero(value)}</span>
            </div>)}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3"><span className={CLASE_LABEL}>Sueldo neto</span><span className="font-title text-[24px] text-foreground">{dinero(n.sueldoNeto)}</span></div>
          </div>
          <div className="space-y-2">
            <p className={CLASE_SUBTITULO}>Conceptos registrados</p>
            {n.conceptos?.length ? n.conceptos.map((c) => <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-[13px]" key={c.id}>
              <div><span className="text-foreground">{c.descripcion}</span><p className="font-caption text-[11px] text-muted-foreground">{c.tipoEtiqueta}{c.horas ? ` · ${c.horas} horas` : ""}</p></div>
              <span className={c.tipo === "DESCUENTO" ? "text-destructive" : "text-success"}>{c.tipo === "DESCUENTO" ? "−" : "+"}{dinero(c.monto)}</span>
            </div>) : <p className="text-[12px] text-muted-foreground">Sin bonos, horas extra ni descuentos registrados.</p>}
            <GestionConceptosSlot nomina={n} onActualizada={() => { void client.invalidateQueries({ queryKey: ["hu8"] }); }} />
          </div>
          <div className="space-y-2"><p className={CLASE_SUBTITULO}>Anticipos descontados</p>
            {n.anticiposAplicados?.length ? n.anticiposAplicados.map((a) => <div className="flex justify-between gap-3 border-b border-border py-2 text-[12px]" key={a.id}>
              <span className="text-muted-foreground">Anticipo del {fechaCorta(a.fecha)}</span><span>{dinero(a.montoAplicado)}</span>
            </div>) : <p className="text-[12px] text-muted-foreground">Sin anticipos aplicados a esta nómina.</p>}
          </div>
          {n.estado === "PAGADA" && <div className="rounded-lg bg-success-subtle p-3 text-[12px]">
            <p className="font-medium text-success">Pago confirmado</p>
            <p className="mt-1 text-muted-foreground">Fecha: {fechaCorta(n.fechaPago)} · Método: {n.metodoPago ? ETIQUETA_METODO[n.metodoPago] : "No registrado"} · Monto: {dinero(n.montoPagado)}</p>
          </div>}
          {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle p-3 text-[12px]">{aviso}</p>}
          {error && <ErrorNomina mensaje={error} />}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {n.estado === "PAGADA" && <><Button variant="outline" onClick={() => void imprimir()} disabled={accionPdf}><Printer className="h-4 w-4" /> Imprimir boleta</Button>
              <Button variant="outline" onClick={() => void descargar()} cargando={accionPdf}><Download className="h-4 w-4" /> Descargar PDF</Button></>}
            {n.estado === "PENDIENTE" && admin && <Button onClick={() => setPagar(true)}>Confirmar pago</Button>}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <PagarNominaDialog nomina={n ?? null} abierto={pagar} onCerrar={() => setPagar(false)} onPagada={(mensaje) => { setPagar(false); setAviso(mensaje); }} />
  </>;
}
