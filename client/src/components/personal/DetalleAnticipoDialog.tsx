"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { anticiposService } from "@/services/personal.service";
import { descargarBlob, dinero, fechaCorta, imprimirBlob, nombreEmpleado } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, CLASE_SUBTITULO, CargandoNomina, ErrorNomina } from "@/components/nomina/NominaUI";
import { EstadoAnticipoBadge, ETIQUETA_METODO } from "./PersonalUI";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Detalle de un anticipo: en qué nóminas se descontó, cuánto queda pendiente y su comprobante (HU8 4.2 y 6.2). */
export function DetalleAnticipoDialog({ anticipoId, onCerrar }: { anticipoId: string | null; onCerrar: () => void }) {
  const [enPdf, setEnPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");
  const consulta = useQuery({
    queryKey: ["hu8", "anticipo", anticipoId],
    queryFn: () => anticiposService.detalle(anticipoId!),
    enabled: !!anticipoId,
  });
  const a = consulta.data;

  async function comprobante(imprimir: boolean) {
    if (!a || enPdf) return;
    setEnPdf(true);
    setErrorPdf("");
    try {
      if (imprimir) await imprimirBlob(anticiposService.comprobantePdf(a.id, true));
      else descargarBlob(await anticiposService.comprobantePdf(a.id), `comprobante-anticipo-${a.fecha}-${a.empleado?.documento ?? a.id}.pdf`);
    } catch (err) {
      setErrorPdf(mensajeErrorNomina(err));
    } finally {
      setEnPdf(false);
    }
  }

  return <Dialog open={!!anticipoId} onOpenChange={(v) => { if (!v) onCerrar(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">Detalle del anticipo</DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">Monto entregado, descuentos en nómina y saldo pendiente.</DialogDescription>
      </DialogHeader>
      {consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : a && <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-[15px] font-medium text-foreground">{a.empleado ? nombreEmpleado(a.empleado) : "Empleado"}</p>
            <p className="font-caption text-[11px] text-muted-foreground">{a.empleado?.cargo} · Doc. {a.empleado?.documento}</p>
          </div>
          <EstadoAnticipoBadge estado={a.estado} />
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {[
            ["Fecha", fechaCorta(a.fecha)],
            ["Método de pago", ETIQUETA_METODO[a.metodoPago]],
            ["Concepto", a.descripcion],
            ["Egreso de caja", a.asiento ? (a.asiento.cuenta ?? "Registrado") : "Sin movimiento de caja"],
          ].map(([etiqueta, valor]) => <div key={etiqueta}><dt className={CLASE_LABEL}>{etiqueta}</dt><dd className="mt-1 break-words text-[13px] text-foreground">{valor}</dd></div>)}
        </dl>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Entregado", a.monto, "text-foreground"],
            ["Descontado", a.montoDescontado, "text-success"],
            ["Pendiente", a.saldoPendiente, Number(a.saldoPendiente) > 0 ? "text-destructive" : "text-foreground"],
          ].map(([etiqueta, valor, clase]) => <div key={etiqueta} className="rounded-lg border border-border p-2.5">
            <p className={CLASE_LABEL}>{etiqueta}</p><p className={`mt-1 text-[15px] font-semibold tabular-nums ${clase}`}>{dinero(valor)}</p>
          </div>)}
        </div>
        <div className="space-y-1">
          <p className={CLASE_SUBTITULO}>Descuentos en nómina</p>
          {a.aplicaciones?.length ? a.aplicaciones.map((p) => <div key={p.id} className="flex justify-between gap-2 border-b border-border py-2 text-[13px]">
            <span className="text-muted-foreground">Nómina {p.periodo ?? "—"}{p.estadoNomina === "PAGADA" ? " (pagada)" : p.estadoNomina === "PENDIENTE" ? " (pendiente de pago)" : ""}</span>
            <span className="tabular-nums text-foreground">{dinero(p.montoAplicado)}</span>
          </div>) : <p className="text-[12px] text-muted-foreground">Todavía no se descontó en ninguna nómina: se aplicará en la próxima que se genere.</p>}
        </div>
        {errorPdf && <ErrorNomina mensaje={errorPdf} />}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => void comprobante(true)} disabled={enPdf}><Printer className="h-4 w-4" /> Imprimir comprobante</Button>
          <Button variant="outline" onClick={() => void comprobante(false)} cargando={enPdf}><Download className="h-4 w-4" /> Descargar PDF</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
