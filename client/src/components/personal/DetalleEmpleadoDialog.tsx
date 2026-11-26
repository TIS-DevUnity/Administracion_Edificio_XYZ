"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, HandCoins, Printer } from "lucide-react";
import { mensajeErrorNomina, nominaService } from "@/services/nomina.service";
import { anticiposService, empleadosService } from "@/services/personal.service";
import { descargarBlob, dinero, fechaCorta, imprimirBlob, nombreEmpleado } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, CLASE_SUBTITULO, CargandoNomina, ErrorNomina, EstadoBadge } from "@/components/nomina/NominaUI";
import { EstadoAnticipoBadge, EstadoEmpleadoBadge, ETIQUETA_METODO } from "./PersonalUI";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Detalle de un empleado con su información salarial (HU8 1.2): datos, resumen, historial completo de
 * nóminas con su boleta (6.3) y de anticipos (4.2). Se conserva aunque el empleado esté inactivo (1.4).
 */
export function DetalleEmpleadoDialog({ empleadoId, onCerrar, bolPuedeRegistrarAnticipo }: {
  empleadoId: string | null;
  onCerrar: () => void;
  bolPuedeRegistrarAnticipo: boolean;
}) {
  const [paginaNominas, setPaginaNominas] = useState(1);
  const [enPdf, setEnPdf] = useState<string | null>(null);
  const [errorPdf, setErrorPdf] = useState("");
  const detalle = useQuery({
    queryKey: ["hu8", "empleado", empleadoId],
    queryFn: () => empleadosService.detalle(empleadoId!),
    enabled: !!empleadoId,
  });
  const nominas = useQuery({
    queryKey: ["hu8", "empleado-nominas", empleadoId, paginaNominas],
    queryFn: () => nominaService.listar({ empleadoId: empleadoId!, pagina: paginaNominas, porPagina: 6 }),
    enabled: !!empleadoId,
  });
  const anticipos = useQuery({
    queryKey: ["hu8", "empleado-anticipos", empleadoId],
    queryFn: () => anticiposService.listar({ empleadoId: empleadoId!, porPagina: 50 }),
    enabled: !!empleadoId,
  });

  async function pdf(clave: string, obtener: () => Promise<Blob>, nombre: string, imprimir: boolean) {
    if (enPdf) return;
    setEnPdf(clave);
    setErrorPdf("");
    try {
      if (imprimir) await imprimirBlob(obtener());
      else descargarBlob(await obtener(), nombre);
    } catch (err) {
      setErrorPdf(mensajeErrorNomina(err));
    } finally {
      setEnPdf(null);
    }
  }

  const e = detalle.data?.empleado;
  const r = detalle.data?.resumen;
  const datosNominas = nominas.data;

  return <Dialog open={!!empleadoId} onOpenChange={(v) => { if (!v) { setPaginaNominas(1); onCerrar(); } }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">Detalle del empleado</DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">Datos personales, información salarial e historial de pagos y anticipos.</DialogDescription>
      </DialogHeader>
      {detalle.isPending ? <CargandoNomina /> : detalle.isError ? <ErrorNomina mensaje={mensajeErrorNomina(detalle.error)} reintentar={() => void detalle.refetch()} /> : e && r && <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-[15px] font-medium text-foreground">{nombreEmpleado(e)}</p>
            <p className="font-caption text-[11px] text-muted-foreground">{e.cargo} · Doc. {e.documento}</p>
          </div>
          <EstadoEmpleadoBadge estado={e.estado} />
        </div>
        {e.estado === "INACTIVO" && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          Empleado inactivo: no se incluye en nuevas nóminas ni puede recibir anticipos. Su historial de pagos se conserva.
        </p>}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Fecha de ingreso", fechaCorta(e.fechaIngreso)],
            ["Teléfono", e.telefono],
            ["Sueldo base", dinero(e.sueldoBase)],
            ["Nóminas registradas", String(r.cantidadNominas)],
          ].map(([etiqueta, valor]) => <div key={etiqueta}>
            <dt className={CLASE_LABEL}>{etiqueta}</dt>
            <dd className="mt-1 text-[13px] text-foreground">{valor}</dd>
          </div>)}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <div>
            <p className={CLASE_LABEL}>Anticipos pendientes de descuento</p>
            <p className={`font-title mt-1 text-[20px] ${Number(r.anticiposPendientes) > 0 ? "text-destructive" : "text-foreground"}`}>{dinero(r.anticiposPendientes)}</p>
            <p className="font-caption text-[11px] text-muted-foreground">{r.cantidadAnticiposPendientes} anticipo(s) se descontarán en las próximas nóminas.</p>
          </div>
          {bolPuedeRegistrarAnticipo && e.estado === "ACTIVO" && <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/personal/anticipos?empleadoId=${e.id}`}><HandCoins className="h-4 w-4" /> Registrar anticipo</Link>
          </Button>}
        </div>

        {errorPdf && <ErrorNomina mensaje={errorPdf} />}

        <div className="space-y-2">
          <p className={CLASE_SUBTITULO}>Historial de nóminas</p>
          {nominas.isPending ? <CargandoNomina /> : nominas.isError ? <ErrorNomina mensaje={mensajeErrorNomina(nominas.error)} reintentar={() => void nominas.refetch()} />
            : !datosNominas?.nominas.length ? <p className="text-[12px] text-muted-foreground">Todavía no tiene nóminas generadas.</p> : <>
              {datosNominas.nominas.map((n) => <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-[13px]">
                <div>
                  <p className="text-foreground">{n.periodo} · {dinero(n.sueldoNeto)}</p>
                  <p className="font-caption text-[11px] text-muted-foreground">
                    Base {dinero(n.sueldoBase)} · +{dinero(Number(n.totalBonos) + Number(n.totalHorasExtra))} · −{dinero(Number(n.totalDescuentos) + Number(n.totalAnticipos))}
                    {n.fechaPago ? ` · Pagada el ${fechaCorta(n.fechaPago)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <EstadoBadge estado={n.estado} />
                  {n.estado === "PAGADA" && <>
                    <Button size="sm" variant="ghost" title="Descargar boleta" disabled={!!enPdf}
                      onClick={() => void pdf(n.id, () => nominaService.boletaPdf(n.id), `boleta-nomina-${n.periodo}-${e.documento}.pdf`, false)}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Imprimir boleta" disabled={!!enPdf}
                      onClick={() => void pdf(n.id, () => nominaService.boletaPdf(n.id), "", true)}><Printer className="h-4 w-4" /></Button>
                  </>}
                </div>
              </div>)}
              {datosNominas.paginacion.totalPaginas > 1 && <div className="flex items-center justify-end gap-2 pt-1">
                <span className="font-caption text-[11px] text-muted-foreground">Página {paginaNominas} de {datosNominas.paginacion.totalPaginas}</span>
                <Button size="sm" variant="outline" disabled={paginaNominas <= 1} onClick={() => setPaginaNominas((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={paginaNominas >= datosNominas.paginacion.totalPaginas} onClick={() => setPaginaNominas((p) => p + 1)}>Siguiente</Button>
              </div>}
            </>}
        </div>

        <div className="space-y-2">
          <p className={CLASE_SUBTITULO}>Historial de anticipos</p>
          {anticipos.isPending ? <CargandoNomina /> : anticipos.isError ? <ErrorNomina mensaje={mensajeErrorNomina(anticipos.error)} reintentar={() => void anticipos.refetch()} />
            : !anticipos.data?.anticipos.length ? <p className="text-[12px] text-muted-foreground">No tiene anticipos registrados.</p>
              : anticipos.data.anticipos.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-[13px]">
                <div>
                  <p className="text-foreground">{fechaCorta(a.fecha)} · {dinero(a.monto)} · {a.descripcion}</p>
                  <p className="font-caption text-[11px] text-muted-foreground">
                    {ETIQUETA_METODO[a.metodoPago]} · Descontado {dinero(a.montoDescontado)} · Pendiente {dinero(a.saldoPendiente)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <EstadoAnticipoBadge estado={a.estado} />
                  <Button size="sm" variant="ghost" title="Descargar comprobante" disabled={!!enPdf}
                    onClick={() => void pdf(a.id, () => anticiposService.comprobantePdf(a.id), `comprobante-anticipo-${a.fecha}-${e.documento}.pdf`, false)}><Download className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" title="Imprimir comprobante" disabled={!!enPdf}
                    onClick={() => void pdf(a.id, () => anticiposService.comprobantePdf(a.id, true), "", true)}><Printer className="h-4 w-4" /></Button>
                </div>
              </div>)}
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
