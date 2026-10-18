"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Paperclip, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { movimientosService } from "@/services/movimientos.service";
import { validarComprobante } from "../utils/comprobantes";
import type {
  ActualizarMovimientoPayload,
  MovimientoFinanciero,
  TipoMovimientoFormulario,
} from "@/types/movimientos";

type Formulario = { tipo: TipoMovimientoFormulario; monto: string; fecha: string; categoriaId: string; concepto: string };
type Errores = Partial<Record<keyof Formulario | "comprobante", string>>;

function inicial(mov: MovimientoFinanciero): Formulario {
  return {
    tipo: mov.tipo === "INGRESO" ? "INGRESO" : "GASTO",
    monto: Number(mov.monto).toFixed(2),
    fecha: mov.fecha,
    categoriaId: mov.categoria.id,
    concepto: mov.concepto,
  };
}

function fechaValida(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

function errorStorage(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const datos = error.response?.data as { message?: string; mensaje?: string; error?: string } | undefined;
  const texto = String(datos?.message ?? datos?.mensaje ?? datos?.error ?? "");
  return error.response?.status === 502 || /Headers\.set|invalid header value|supabase|storage|no se pudo subir el comprobante/i.test(texto);
}

function mensajeError(error: unknown): string {
  if (errorStorage(error)) return "No fue posible acceder al almacenamiento de comprobantes. La edición no se confirmó. Puedes guardar únicamente los datos sin reemplazar el archivo.";
  if (axios.isAxiosError(error)) {
    const datos = error.response?.data as { message?: string; mensaje?: string; error?: string } | undefined;
    const mensaje = String(datos?.message ?? datos?.mensaje ?? datos?.error ?? "No se pudo editar el movimiento.");
    return /Headers\.set|invalid header value|eyJ[A-Za-z0-9_-]{15,}\./i.test(mensaje)
      ? "No se pudo completar la operación por un error de configuración del servidor."
      : mensaje;
  }
  return error instanceof Error ? error.message : "No se pudo editar el movimiento.";
}

function FormularioEdicion({ movimiento, onCerrar, onGuardado }: {
  movimiento: MovimientoFinanciero;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Formulario>(() => inicial(movimiento));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [falloAlSubir, setFalloAlSubir] = useState(false);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  const categoriasQuery = useQuery({
    queryKey: ["hu6", "categorias", form.tipo],
    queryFn: ({ signal }) => movimientosService.listarCategorias(form.tipo, signal),
  });
  const categorias = categoriasQuery.data ?? [];
  const original = inicial(movimiento);
  const cambianDatos = form.tipo !== original.tipo || form.categoriaId !== original.categoriaId ||
    form.fecha !== original.fecha || form.concepto.trim() !== original.concepto ||
    Number(form.monto) !== Number(original.monto);
  const hayCambios = cambianDatos || Boolean(archivo);

  const actualizarMutation = useMutation({
    mutationFn: ({ cambios, comprobante }: { cambios: ActualizarMovimientoPayload; comprobante: File | null }) =>
      movimientosService.actualizarMovimiento(movimiento.id, cambios, comprobante),
    onSuccess: respuesta => {
      queryClient.setQueryData(["hu6", "movimiento", movimiento.id], respuesta);
      // Los filtros y los importes del balance pueden cambiar al editar fecha/tipo/categoría/monto.
      void queryClient.invalidateQueries({ queryKey: ["hu6", "movimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["hu6", "balance"] });
      onGuardado(respuesta.mensaje || "Movimiento actualizado correctamente.");
    },
  });

  function modificar(campo: keyof Formulario, valor: string) {
    setForm(p => ({ ...p, [campo]: valor }));
    setErrores(p => ({ ...p, [campo]: undefined }));
    setFalloAlSubir(false);
    actualizarMutation.reset();
  }

  function cambiarTipo(tipo: TipoMovimientoFormulario) {
    setForm(p => ({ ...p, tipo, categoriaId: "" }));
    setErrores({});
    setFalloAlSubir(false);
    actualizarMutation.reset();
  }

  function elegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0] ?? null;
    const error = elegido ? validarComprobante(elegido) : null;
    setArchivo(error ? null : elegido);
    setErrorArchivo(error ?? "");
    setErrores(p => ({ ...p, comprobante: error ?? undefined }));
    setFalloAlSubir(false);
    actualizarMutation.reset();
    if (error) e.target.value = "";
  }

  function quitarArchivo() {
    setArchivo(null);
    setErrorArchivo("");
    setErrores(p => ({ ...p, comprobante: undefined }));
    setFalloAlSubir(false);
    if (entradaArchivo.current) entradaArchivo.current.value = "";
  }

  function validar(): Errores {
    const e: Errores = {};
    const cantidad = Number(form.monto);
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.monto.trim()) || !Number.isFinite(cantidad) || cantidad <= 0) {
      e.monto = "El importe debe ser mayor que cero y tener como máximo dos decimales.";
    }
    if (!fechaValida(form.fecha)) e.fecha = "Introduce una fecha válida.";
    if (!form.concepto.trim()) e.concepto = "El concepto es obligatorio.";
    else if (form.concepto.trim().length > 200) e.concepto = "Máximo 200 caracteres.";
    // Una categoría histórica inactiva se puede conservar si NO se modifica;
    // el backend solo la revalida cuando cambiamos tipo o categoría.
    const cambiaClasificacion = form.tipo !== original.tipo || form.categoriaId !== original.categoriaId;
    if (!form.categoriaId || (cambiaClasificacion && !categorias.some(c => c.id === form.categoriaId && c.activa))) {
      e.categoriaId = "Selecciona una categoría activa compatible con el tipo.";
    }
    if (errorArchivo) e.comprobante = errorArchivo;
    return e;
  }

  function construirCambios(): ActualizarMovimientoPayload {
    const cambios: ActualizarMovimientoPayload = {};
    if (form.tipo !== original.tipo) cambios.tipo = form.tipo;
    if (Number(form.monto) !== Number(original.monto)) cambios.monto = Number(form.monto);
    if (form.fecha !== original.fecha) cambios.fecha = form.fecha;
    if (form.categoriaId !== original.categoriaId) cambios.categoriaId = form.categoriaId;
    if (form.concepto.trim() !== original.concepto) cambios.concepto = form.concepto.trim();
    return cambios;
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (actualizarMutation.isPending || !hayCambios) return;
    const nuevos = validar();
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setFalloAlSubir(false);
    try {
      await actualizarMutation.mutateAsync({ cambios: construirCambios(), comprobante: archivo });
    } catch (error) {
      setFalloAlSubir(Boolean(archivo) && errorStorage(error));
    }
  }

  async function soloDatos() {
    if (actualizarMutation.isPending || !archivo) return;
    const nuevos = validar();
    setErrores(nuevos);
    if (Object.keys(nuevos).length || !cambianDatos) return;
    try {
      await actualizarMutation.mutateAsync({ cambios: construirCambios(), comprobante: null });
    } catch { /* El error lo presenta la mutación; no confirmamos la operación. */ }
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <fieldset disabled={actualizarMutation.isPending} className="space-y-4 disabled:opacity-65">
        <div className="space-y-2">
          <p className="text-[13px] font-medium">Tipo de movimiento *</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={form.tipo === "GASTO" ? "default" : "outline"}
              aria-pressed={form.tipo === "GASTO"} onClick={() => cambiarTipo("GASTO")}>Gasto</Button>
            <Button type="button" variant={form.tipo === "INGRESO" ? "default" : "outline"}
              aria-pressed={form.tipo === "INGRESO"} onClick={() => cambiarTipo("INGRESO")}>Ingreso</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Cambiar el tipo requiere seleccionar otra categoría compatible.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="hu6-editar-monto" className="text-[12px] font-medium">Monto en Bs *</label>
            <Input id="hu6-editar-monto" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.monto}
              onChange={e => modificar("monto", e.target.value)} aria-invalid={Boolean(errores.monto)} />
            {errores.monto && <p className="text-[11px] text-destructive" role="alert">{errores.monto}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="hu6-editar-fecha" className="text-[12px] font-medium">Fecha *</label>
            <Input id="hu6-editar-fecha" type="date" value={form.fecha} onChange={e => modificar("fecha", e.target.value)}
              aria-invalid={Boolean(errores.fecha)} />
            {errores.fecha && <p className="text-[11px] text-destructive" role="alert">{errores.fecha}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hu6-editar-categoria" className="text-[12px] font-medium">Categoría *</label>
          <Select value={form.categoriaId} onValueChange={v => modificar("categoriaId", v)}
            disabled={categoriasQuery.isLoading || categoriasQuery.isError}>
            <SelectTrigger id="hu6-editar-categoria" className="w-full" aria-invalid={Boolean(errores.categoriaId)}>
              <SelectValue placeholder="Selecciona una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map(c => <SelectItem key={c.id} value={c.id} disabled={!c.activa}>
                {c.nombre}{!c.activa ? " (inactiva)" : ""}
              </SelectItem>)}
            </SelectContent>
          </Select>
          {categoriasQuery.isError && <p role="alert" className="text-[11px] text-destructive">No se pudieron cargar las categorías. <button type="button" className="underline" onClick={() => void categoriasQuery.refetch()}>Reintentar</button></p>}
          {errores.categoriaId && <p role="alert" className="text-[11px] text-destructive">{errores.categoriaId}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hu6-editar-concepto" className="text-[12px] font-medium">Concepto *</label>
          <textarea id="hu6-editar-concepto" rows={3} maxLength={201} value={form.concepto}
            onChange={e => modificar("concepto", e.target.value)} aria-invalid={Boolean(errores.concepto)}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive" />
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{errores.concepto ? <span className="text-destructive" role="alert">{errores.concepto}</span> : "Describe el motivo del movimiento."}</span>
            <span>{form.concepto.length}/200</span>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label htmlFor="hu6-editar-archivo" className="flex items-center gap-2 text-[12px] font-medium">
            <Paperclip className="size-4" /> {movimiento.tieneComprobante ? "Reemplazar comprobante (opcional)" : "Adjuntar comprobante (opcional)"}
          </label>
          {movimiento.tieneComprobante && <div className="text-[12px] text-muted-foreground">Actual: <span className="break-all">{movimiento.comprobante?.nombre ?? "Comprobante adjunto"}</span></div>}
          <Input ref={entradaArchivo} id="hu6-editar-archivo" type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={elegirArchivo}
            aria-invalid={Boolean(errores.comprobante)} />
          <p className="text-[11px] text-muted-foreground">JPG, PNG o PDF · Máximo 5 MB. Si no eliges archivo, el anterior se conserva.</p>
          {archivo && <p className="break-all text-[12px]">Seleccionado: {archivo.name} · <button type="button" className="underline" onClick={quitarArchivo}>Quitar</button></p>}
          {errores.comprobante && <p role="alert" className="text-[11px] text-destructive">{errores.comprobante}</p>}
        </div>
      </fieldset>

      {actualizarMutation.isError && (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive" role="alert">
          <p>{mensajeError(actualizarMutation.error)}</p>
          {falloAlSubir && archivo && cambianDatos && (
            <div className="space-y-2">
              <p>El comprobante no se guardó. Puedes guardar solo las modificaciones de importe, fecha, categoría o concepto y adjuntar el archivo más tarde.</p>
              <Button type="button" variant="outline" onClick={() => void soloDatos()} disabled={actualizarMutation.isPending}>
                <Save className="size-4" /> Guardar solo los datos
              </Button>
            </div>
          )}
          {falloAlSubir && archivo && !cambianDatos && <p>Si solo necesitas reemplazar el archivo, inténtalo cuando el almacenamiento esté disponible.</p>}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCerrar} disabled={actualizarMutation.isPending}>
          <X className="size-4" /> Cancelar
        </Button>
        <Button type="submit" disabled={!hayCambios || actualizarMutation.isPending || categoriasQuery.isLoading || categoriasQuery.isError} cargando={actualizarMutation.isPending}>
          <Save className="size-4" /> Guardar cambios
        </Button>
      </div>
    </form>
  );
}

export function MovimientoEditar({ movimientoId, onCerrar, onGuardado }: {
  movimientoId: string | null;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const detalle = useQuery({
    queryKey: ["hu6", "movimiento", movimientoId],
    queryFn: ({ signal }) => movimientosService.obtenerMovimiento(movimientoId!, signal),
    enabled: Boolean(movimientoId),
  });

  return (
    <Dialog open={Boolean(movimientoId)} onOpenChange={abierto => { if (!abierto) onCerrar(); }}>
      <DialogContent className="max-h-[90dvh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar movimiento financiero</DialogTitle>
          <DialogDescription>Corrige los datos del movimiento y, si corresponde, reemplaza su comprobante.</DialogDescription>
        </DialogHeader>
        {detalle.isPending ? (
          <div className="space-y-3" aria-label="Cargando movimiento"><Skeleton className="h-12" /><Skeleton className="h-40" /><Loader2 className="size-5 animate-spin" /></div>
        ) : detalle.isError ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3" role="alert">
            <p className="text-[12px] text-destructive">{mensajeError(detalle.error)}</p>
            <Button type="button" variant="outline" onClick={() => void detalle.refetch()}><RotateCcw className="size-4" /> Reintentar</Button>
          </div>
        ) : detalle.data?.movimiento ? (
          <FormularioEdicion key={detalle.data.movimiento.id} movimiento={detalle.data.movimiento}
            onCerrar={onCerrar} onGuardado={onGuardado} />
        ) : (
          <p className="text-[12px] text-muted-foreground"><AlertTriangle className="inline size-4" /> Movimiento no disponible.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
