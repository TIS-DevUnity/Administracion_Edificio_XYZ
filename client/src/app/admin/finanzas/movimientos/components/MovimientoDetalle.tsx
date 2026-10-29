"use client";

import { useRef, useState, type ChangeEvent } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Loader2, Paperclip, RefreshCw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { movimientosService } from "@/services/movimientos.service";
import { validarComprobante } from "../utils/comprobantes";
import {
  CLASE_AVISO_ERROR,
  CLASE_AYUDA,
  CLASE_BADGE_GASTO,
  CLASE_BADGE_INGRESO,
  CLASE_DESCRIPCION_DIALOGO,
  CLASE_ERROR_CAMPO,
  CLASE_LABEL,
  CLASE_TEXTO_GASTO,
  CLASE_TEXTO_INGRESO,
  CLASE_TITULO_DIALOGO,
  CLASE_TITULO_SECCION,
} from "../utils/ui";
import type { EnlaceComprobante, MovimientoFinanciero } from "@/types/movimientos";

function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; mensaje?: string; error?: string } | undefined;
    const mensaje = data?.message ?? data?.mensaje ?? data?.error ?? "La operación no se pudo completar.";
    // No revelar posibles credenciales retornadas por el servidor al fallar Supabase Storage.
    if (error.response?.status === 502 ||
        /(?:Headers\.set|invalid header value|supabase|storage|no se pudo subir el comprobante|no se pudo generar el enlace del comprobante|eyJ[A-Za-z0-9_-]{15,}\.)/i.test(mensaje)) {
      return "No se pudo acceder al almacenamiento de comprobantes. El movimiento no fue modificado. Inténtalo cuando el servicio esté disponible.";
    }
    return mensaje;
  }
  return error instanceof Error ? error.message : "La operación no se pudo completar.";
}

function fechaLegible(fecha: string) {
  const partes = fecha.slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fecha;
}

function formatoBs(monto: string | number) {
  return `Bs ${Number(monto).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="space-y-1">
      <dt className={CLASE_LABEL}>{etiqueta}</dt>
      <dd className="break-words text-[13px] font-medium">{valor}</dd>
    </div>
  );
}

function DatosMovimiento({ movimiento }: { movimiento: MovimientoFinanciero }) {
  const ingreso = movimiento.tipo === "INGRESO";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
        <Badge variant="outline" className={ingreso ? CLASE_BADGE_INGRESO : CLASE_BADGE_GASTO}>
          {ingreso ? "Ingreso · Entrada" : "Gasto · Salida"}
        </Badge>
        <strong className={`font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums ${ingreso ? CLASE_TEXTO_INGRESO : CLASE_TEXTO_GASTO}`}>
          {ingreso ? "+" : "−"}{formatoBs(movimiento.monto)}
        </strong>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha del movimiento" valor={fechaLegible(movimiento.fecha)} />
        <Campo etiqueta="Categoría" valor={movimiento.categoria.nombre ?? "Sin nombre"} />
        <Campo etiqueta="Concepto" valor={movimiento.concepto} />
        <Campo etiqueta="Registrado por" valor={movimiento.registradoPor
          ? `${movimiento.registradoPor.nombre} ${movimiento.registradoPor.apellido}`.trim()
          : "Usuario no disponible"} />
        <Campo etiqueta="Registrado el" valor={new Date(movimiento.createdAt).toLocaleString("es-BO")} />
        <Campo etiqueta="Última actualización" valor={new Date(movimiento.updatedAt).toLocaleString("es-BO")} />
      </dl>
    </div>
  );
}

export function MovimientoDetalle({ movimientoId, onCerrar }: {
  movimientoId: string | null;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");
  const [errorEnlace, setErrorEnlace] = useState("");
  const [vista, setVista] = useState<EnlaceComprobante | null>(null);
  const [enlaceCargando, setEnlaceCargando] = useState<"vista" | "descarga" | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const detalleQuery = useQuery({
    queryKey: ["hu6", "movimiento", movimientoId],
    queryFn: ({ signal }) => movimientosService.obtenerMovimiento(movimientoId!, signal),
    enabled: Boolean(movimientoId),
  });
  const movimiento = detalleQuery.data?.movimiento;

  const adjuntarMutation = useMutation({
    mutationFn: (seleccionado: File) => movimientosService.adjuntarComprobante(movimientoId!, seleccionado),
    onSuccess: async respuesta => {
      setArchivo(null);
      setErrorArchivo("");
      setErrorEnlace("");
      setVista(null); // enlace antiguo ya no corresponde al documento actual
      setMensajeExito(respuesta.mensaje);
      if (inputArchivo.current) inputArchivo.current.value = "";
      queryClient.setQueryData(["hu6", "movimiento", movimientoId], { movimiento: respuesta.movimiento });
      void queryClient.invalidateQueries({ queryKey: ["hu6", "movimientos"] });
    },
  });

  function alSeleccionar(evento: ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null;
    const error = seleccionado ? validarComprobante(seleccionado) : null;
    setArchivo(error ? null : seleccionado);
    setErrorArchivo(error ?? "");
    setMensajeExito("");
    adjuntarMutation.reset();
    if (error) evento.target.value = "";
  }

  function limpiarArchivo() {
    setArchivo(null);
    setErrorArchivo("");
    if (inputArchivo.current) inputArchivo.current.value = "";
  }

  async function mostrarVista() {
    if (!movimientoId) return;
    setErrorEnlace("");
    setEnlaceCargando("vista");
    try {
      const enlace = await movimientosService.obtenerEnlaceComprobante(movimientoId);
      if (!/^https:\/\//i.test(enlace.url)) throw new Error("El enlace del documento no es seguro.");
      setVista(enlace);
    } catch (error) {
      setErrorEnlace(mensajeError(error));
    } finally {
      setEnlaceCargando(null);
    }
  }

  async function descargar() {
    if (!movimientoId) return;
    setErrorEnlace("");
    setEnlaceCargando("descarga");
    try {
      const enlace = await movimientosService.obtenerEnlaceComprobante(movimientoId, true);
      if (!/^https:\/\//i.test(enlace.url)) throw new Error("El enlace de descarga no es seguro.");
      // El backend solicita Content-Disposition: attachment. Se entrega el archivo original.
      window.location.assign(enlace.url);
    } catch (error) {
      setErrorEnlace(mensajeError(error));
    } finally {
      setEnlaceCargando(null);
    }
  }

  function cerrar() {
    if (adjuntarMutation.isPending) return;
    onCerrar();
  }

  return (
    <Dialog open={Boolean(movimientoId)} onOpenChange={abierto => { if (!abierto) cerrar(); }}>
      <DialogContent className="max-h-[90dvh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>Detalle del movimiento</DialogTitle>
          <DialogDescription className={CLASE_DESCRIPCION_DIALOGO}>Consulta los datos registrados y el comprobante asociado.</DialogDescription>
        </DialogHeader>
        {detalleQuery.isPending ? (
          <div className="space-y-3" aria-label="Cargando detalle">
            <Skeleton className="h-16 w-full" /><Skeleton className="h-36 w-full" />
          </div>
        ) : detalleQuery.isError ? (
          <div role="alert" className={`space-y-3 ${CLASE_AVISO_ERROR}`}>
            <p>{mensajeError(detalleQuery.error)}</p>
            <Button type="button" variant="outline" onClick={() => void detalleQuery.refetch()}>
              <RefreshCw className="size-4" /> Reintentar
            </Button>
          </div>
        ) : movimiento ? (
          <div className="space-y-5">
            <DatosMovimiento movimiento={movimiento} />
            <section aria-label="Comprobante" className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <FileText className="size-4" /><h3 className={CLASE_TITULO_SECCION}>Comprobante</h3>
                <Badge variant="outline" className="font-caption text-[11px]">{movimiento.tieneComprobante ? "Adjunto" : "Sin adjunto"}</Badge>
              </div>
              {movimiento.tieneComprobante && movimiento.comprobante ? (
                <>
                  <p className="break-all text-[12px] text-muted-foreground">{movimiento.comprobante.nombre}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void mostrarVista()} disabled={enlaceCargando !== null}>
                      {enlaceCargando === "vista" ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                      {enlaceCargando === "vista" ? "Cargando…" : "Ver comprobante"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void descargar()} disabled={enlaceCargando !== null}>
                      {enlaceCargando === "descarga" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      Descargar
                    </Button>
                  </div>
                  {vista && vista.movimientoId === movimiento.id && (
                    <div className="space-y-2 rounded-lg border border-border p-2">
                      <p className={CLASE_AYUDA}>
                        Vista previa temporal (el enlace vence en 5 minutos). Si vence, presiona “Ver comprobante” de nuevo.
                      </p>
                      {vista.mimeType === "application/pdf" ? (
                        <iframe title={`Comprobante de ${movimiento.concepto}`} src={vista.url} className="h-[350px] w-full rounded-md border border-border" />
                      ) : vista.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vista.url} alt={`Comprobante adjunto: ${vista.nombre}`} className="mx-auto max-h-[350px] w-auto max-w-full object-contain" />
                      ) : (
                        <p className="text-[12px]">No hay vista previa compatible.</p>
                      )}
                      <a className="inline-flex items-center gap-1 text-[12px] text-primary underline"
                        href={vista.url} target="_blank" rel="noopener noreferrer">Abrir archivo en otra pestaña <ExternalLink className="size-3" /></a>
                    </div>
                  )}
                </>
              ) : (
                <p className={CLASE_AYUDA}>Este movimiento todavía no tiene comprobante. Se puede adjuntar sin modificar el importe del movimiento.</p>
              )}
              <div className="space-y-2 border-t border-border pt-3">
                <label htmlFor="hu6-detalle-archivo" className={`flex items-center gap-2 ${CLASE_LABEL}`}>
                  <Paperclip className="size-4" /> {movimiento.tieneComprobante ? "Reemplazar comprobante" : "Adjuntar comprobante"}
                </label>
                <Input id="hu6-detalle-archivo" ref={inputArchivo} type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={alSeleccionar}
                  disabled={adjuntarMutation.isPending} aria-invalid={Boolean(errorArchivo)} />
                <p className={CLASE_AYUDA}>JPG, PNG o PDF · Máximo 5 MB · Opcional</p>
                {archivo && <p className="break-all text-[12px] text-muted-foreground">{archivo.name} · <button className="underline" type="button" disabled={adjuntarMutation.isPending} onClick={limpiarArchivo}>Quitar</button></p>}
                {errorArchivo && <p role="alert" className={CLASE_ERROR_CAMPO}>{errorArchivo}</p>}
                {adjuntarMutation.isError && <p role="alert" className={CLASE_ERROR_CAMPO}>{mensajeError(adjuntarMutation.error)}</p>}
                {mensajeExito && <p role="status" className="font-caption text-[12px] text-success">{mensajeExito}</p>}
                {errorEnlace && <p role="alert" className={CLASE_ERROR_CAMPO}>{errorEnlace}</p>}
                <Button type="button" onClick={() => archivo && adjuntarMutation.mutate(archivo)}
                  disabled={!archivo || Boolean(errorArchivo) || adjuntarMutation.isPending}
                  cargando={adjuntarMutation.isPending}>
                  <Upload className="size-4" /> {movimiento.tieneComprobante ? "Guardar reemplazo" : "Guardar comprobante"}
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
