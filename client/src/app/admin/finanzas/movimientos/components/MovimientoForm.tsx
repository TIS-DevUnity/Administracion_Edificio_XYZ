"use client";

import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Paperclip, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { movimientosService } from "@/services/movimientos.service";
import { validarComprobante } from "../utils/comprobantes";
import type { CrearMovimientoPayload, CrearMovimientoRespuesta, TipoMovimientoFormulario } from "@/types/movimientos";

type Campo = keyof CrearMovimientoPayload;
type ErroresFormulario = Partial<Record<Campo, string>>;

function fechaHoyBolivia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function nuevoFormulario(): {
  tipo: TipoMovimientoFormulario;
  monto: string;
  fecha: string;
  categoriaId: string;
  concepto: string;
} {
  return { tipo: "GASTO", monto: "", fecha: fechaHoyBolivia(), categoriaId: "", concepto: "" };
}

/** La fecha debe existir en el calendario, no solo cumplir el formato. */
function fechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const instante = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === fecha;
}

/** No mostrar credenciales o errores internos de Storage devueltos por el servidor. */
function esFalloAlmacenamiento(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const detalle = error.response?.data as { message?: string; error?: string; mensaje?: string } | undefined;
  const texto = String(detalle?.message ?? detalle?.mensaje ?? detalle?.error ?? error.message ?? "");
  return error.response?.status === 502 ||
    /(?:Headers\.set|invalid header value|supabase|storage|no se pudo subir el comprobante|no se pudo generar el enlace del comprobante)/i.test(texto);
}

function mensajeError(error: unknown): string {
  if (esFalloAlmacenamiento(error)) {
    return "No se pudo acceder al almacenamiento de comprobantes. Puedes guardar el movimiento sin el archivo y adjuntarlo cuando vuelva a estar disponible.";
  }
  if (axios.isAxiosError(error)) {
    const detalle = error.response?.data as { message?: string; error?: string; mensaje?: string } | undefined;
    const mensaje = detalle?.message ?? detalle?.mensaje ?? detalle?.error ?? "No se pudo registrar el movimiento. Verifica la conexión.";
    // Bloqueo adicional ante credenciales embebidas en errores imprevistos.
    return /(?:eyJ[A-Za-z0-9_-]{15,}\.|invalid header value|Headers\.set)/i.test(mensaje)
      ? "Error de configuración del servicio. Comunícalo al responsable del servidor."
      : mensaje;
  }
  return error instanceof Error ? error.message : "No se pudo registrar el movimiento.";
}

/** Generamos una clave distinta por borrador; los reintentos del mismo guardado conservan esa clave. */
function nuevaClave(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MovimientoForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(nuevoFormulario);
  const [claveSolicitud, setClaveSolicitud] = useState(nuevaClave);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [resultado, setResultado] = useState<CrearMovimientoRespuesta | null>(null);
  const [guardadoSinComprobante, setGuardadoSinComprobante] = useState(false);
  const [falloAlSubir, setFalloAlSubir] = useState(false);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [errorComprobante, setErrorComprobante] = useState("");
  const comprobanteInput = useRef<HTMLInputElement>(null);

  function elegirComprobante(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0] ?? null;
    const mensaje = archivo ? validarComprobante(archivo) : null;
    setErrorComprobante(mensaje ?? "");
    setComprobante(mensaje ? null : archivo);
    if (mensaje) evento.target.value = "";
    setResultado(null);
    setFalloAlSubir(false);
  }

  function borrarComprobante() {
    setComprobante(null);
    setErrorComprobante("");
    setFalloAlSubir(false);
    if (comprobanteInput.current) comprobanteInput.current.value = "";
  }

  const categoriasQuery = useQuery({
    queryKey: ["hu6", "categorias", form.tipo],
    queryFn: ({ signal }) => movimientosService.listarCategorias(form.tipo, signal),
  });
  const categorias = categoriasQuery.data ?? [];
  const crearMutation = useMutation({
    mutationFn: ({ movimiento, clave, archivo }: { movimiento: CrearMovimientoPayload; clave: string; archivo: File | null }) =>
      movimientosService.crearMovimiento(movimiento, clave, archivo),
  });

  function actualizar(campo: "monto" | "fecha" | "categoriaId" | "concepto", valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: undefined }));
    setResultado(null);
    setFalloAlSubir(false);
  }

  function cambiarTipo(tipo: TipoMovimientoFormulario) {
    setForm(prev => ({ ...prev, tipo, categoriaId: "" }));
    setErrores({});
    setResultado(null);
    setFalloAlSubir(false);
  }

  function validar(): ErroresFormulario {
    const erroresNuevos: ErroresFormulario = {};
    const monto = Number(form.monto);
    if (!form.monto.trim() || !Number.isFinite(monto) || monto <= 0 ||
        !/^\d+(?:\.\d{1,2})?$/.test(form.monto.trim())) {
      erroresNuevos.monto = "Introduce un monto mayor que cero, con máximo dos decimales.";
    }
    if (!fechaValida(form.fecha)) {
      erroresNuevos.fecha = "Selecciona una fecha válida.";
    }
    if (!form.categoriaId || !categorias.some(c => c.id === form.categoriaId && c.activa)) {
      erroresNuevos.categoriaId = "Selecciona una categoría del tipo de movimiento.";
    }
    if (!form.concepto.trim()) {
      erroresNuevos.concepto = "El concepto es obligatorio.";
    } else if (form.concepto.trim().length > 200) {
      erroresNuevos.concepto = "El concepto puede tener un máximo de 200 caracteres.";
    }
    return erroresNuevos;
  }

  function construirMovimiento(): CrearMovimientoPayload {
    return {
      tipo: form.tipo,
      monto: Number(form.monto),
      fecha: form.fecha,
      categoriaId: form.categoriaId,
      concepto: form.concepto.trim(),
    };
  }

  function completarRegistro(respuesta: CrearMovimientoRespuesta, sinComprobante: boolean) {
    setResultado(respuesta);
    setGuardadoSinComprobante(sinComprobante && !respuesta.movimiento.tieneComprobante);
    setFalloAlSubir(false);
    void queryClient.invalidateQueries({ queryKey: ["hu6", "movimientos"] });
    void queryClient.invalidateQueries({ queryKey: ["hu6", "balance"] });
    setForm(nuevoFormulario());
    borrarComprobante();
    setClaveSolicitud(nuevaClave());
    setErrores({});
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (crearMutation.isPending) return;
    const validaciones = validar();
    setErrores(validaciones);
    if (Object.keys(validaciones).length || errorComprobante) return;

    const archivoActual = comprobante;
    setFalloAlSubir(false);
    try {
      const respuesta = await crearMutation.mutateAsync({
        movimiento: construirMovimiento(), clave: claveSolicitud, archivo: archivoActual,
      });
      completarRegistro(respuesta, false);
    } catch (error) {
      // El servidor intenta subir el archivo antes de registrar el movimiento.
      // No reintentamos automáticamente para no ocultar que el comprobante falló.
      setFalloAlSubir(Boolean(archivoActual) && esFalloAlmacenamiento(error));
      // La clave se conserva ante timeout o fallo para no duplicar el movimiento.
    }
  }

  /** Alternativa explícita: conserva el mismo Idempotency-Key y omite solo el archivo. */
  async function guardarSinComprobante() {
    if (crearMutation.isPending || !comprobante) return;
    const validaciones = validar();
    setErrores(validaciones);
    if (Object.keys(validaciones).length) return;
    try {
      const respuesta = await crearMutation.mutateAsync({
        movimiento: construirMovimiento(), clave: claveSolicitud, archivo: null,
      });
      completarRegistro(respuesta, true);
    } catch {
      // El nuevo error se muestra por la mutación; no indicamos éxito.
    }
  }

  function limpiar() {
    setForm(nuevoFormulario());
    borrarComprobante();
    setClaveSolicitud(nuevaClave());
    setErrores({});
    setResultado(null);
    setGuardadoSinComprobante(false);
    setFalloAlSubir(false);
    crearMutation.reset();
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle>Registrar movimiento</CardTitle>
        <p className="text-[13px] text-muted-foreground">Introduce los datos de un ingreso o gasto extraordinario.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} noValidate className="space-y-5">
          <fieldset disabled={crearMutation.isPending} className="space-y-5 disabled:opacity-70">
            <div className="space-y-2">
              <span className="text-[13px] font-medium">Tipo de movimiento *</span>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={form.tipo === "GASTO" ? "default" : "outline"}
                  aria-pressed={form.tipo === "GASTO"} onClick={() => cambiarTipo("GASTO")}
                  className="w-full"><ArrowDownCircle className="size-4"/> Gasto</Button>
                <Button type="button" variant={form.tipo === "INGRESO" ? "default" : "outline"}
                  aria-pressed={form.tipo === "INGRESO"} onClick={() => cambiarTipo("INGRESO")}
                  className="w-full"><ArrowUpCircle className="size-4"/> Ingreso</Button>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {form.tipo === "GASTO" ? "El gasto reduce el balance de movimientos extraordinarios." : "El ingreso aumenta el balance de movimientos extraordinarios."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="hu6-monto" className="text-[13px] font-medium">Monto en Bs *</label>
                <Input id="hu6-monto" name="monto" type="number" min="0.01" step="0.01"
                  placeholder="Ej. 250.50" value={form.monto} onChange={e => actualizar("monto", e.target.value)}
                  aria-invalid={Boolean(errores.monto)} aria-describedby={errores.monto ? "hu6-monto-error" : undefined}/>
                {errores.monto && <p id="hu6-monto-error" role="alert" className="text-[12px] text-destructive">{errores.monto}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="hu6-fecha" className="text-[13px] font-medium">Fecha *</label>
                <Input id="hu6-fecha" name="fecha" type="date" value={form.fecha}
                  onChange={e => actualizar("fecha", e.target.value)}
                  aria-invalid={Boolean(errores.fecha)} aria-describedby={errores.fecha ? "hu6-fecha-error" : undefined}/>
                {errores.fecha && <p id="hu6-fecha-error" role="alert" className="text-[12px] text-destructive">{errores.fecha}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="hu6-categoria" className="text-[13px] font-medium">Categoría *</label>
              {categoriasQuery.isLoading ? <Skeleton className="h-9 w-full"/> : (
                <Select value={form.categoriaId} onValueChange={valor => actualizar("categoriaId", valor)}
                  disabled={categoriasQuery.isError || categorias.length === 0}>
                  <SelectTrigger id="hu6-categoria" className="w-full" aria-invalid={Boolean(errores.categoriaId)}>
                    <SelectValue placeholder="Selecciona una categoría"/>
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.filter(c => c.activa).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {categoriasQuery.isError && <p role="alert" className="text-[12px] text-destructive">No se pudieron cargar las categorías. <button type="button" onClick={() => void categoriasQuery.refetch()} className="underline">Reintentar</button></p>}
              {!categoriasQuery.isLoading && !categoriasQuery.isError && !categorias.length && <p className="text-[12px] text-muted-foreground">No hay categorías activas para este tipo. Solicita su configuración al administrador.</p>}
              {errores.categoriaId && <p role="alert" className="text-[12px] text-destructive">{errores.categoriaId}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="hu6-concepto" className="text-[13px] font-medium">Concepto *</label>
              <textarea id="hu6-concepto" name="concepto" maxLength={200} rows={3} value={form.concepto}
                onChange={e => actualizar("concepto", e.target.value)}
                placeholder="Ej. Reparación de la bomba de agua"
                aria-invalid={Boolean(errores.concepto)} aria-describedby={errores.concepto ? "hu6-concepto-error" : undefined}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"/>
              <div className="flex justify-between gap-2">
                {errores.concepto ? <p id="hu6-concepto-error" role="alert" className="text-[12px] text-destructive">{errores.concepto}</p> : <span className="text-[11px] text-muted-foreground">Describe el motivo del movimiento.</span>}
                <span className="text-[11px] text-muted-foreground">{form.concepto.length}/200</span>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="hu6-comprobante" className="flex items-center gap-2 text-[13px] font-medium">
                <Paperclip className="size-4" /> Comprobante (opcional)
              </label>
              <Input
                id="hu6-comprobante" ref={comprobanteInput} type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                onChange={elegirComprobante} aria-invalid={Boolean(errorComprobante)}
                aria-describedby="hu6-comprobante-ayuda"
              />
              <p id="hu6-comprobante-ayuda" className="text-[12px] text-muted-foreground">
                Archivo JPG, PNG o PDF · Máximo 5 MB. Se guardará junto al movimiento.
              </p>
              {comprobante && <p className="break-all text-[12px] text-muted-foreground">Seleccionado: {comprobante.name} · <button type="button" className="underline" onClick={borrarComprobante}>Quitar</button></p>}
              {errorComprobante && <p role="alert" className="text-[12px] text-destructive">{errorComprobante}</p>}
            </div>
          </fieldset>

          {crearMutation.isError && (
            <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              <p>{mensajeError(crearMutation.error)}</p>
              {falloAlSubir && comprobante && (
                <div className="space-y-2">
                  <p className="text-[12px]">
                    El archivo NO se ha subido. Si necesitas registrar el gasto o ingreso ahora,
                    puedes guardar solamente sus datos; después podrás adjuntar el comprobante desde el detalle.
                  </p>
                  <Button type="button" variant="outline" onClick={() => void guardarSinComprobante()}
                    disabled={crearMutation.isPending} cargando={crearMutation.isPending}>
                    <Save className="size-4" /> Guardar movimiento sin comprobante
                  </Button>
                </div>
              )}
            </div>
          )}
          {resultado && (
            <div role="status" className="space-y-1 rounded-lg border border-emerald-300/40 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600"/>
                <span className="text-[13px] font-medium">{resultado.mensaje}</span>
                {resultado.duplicado && <Badge variant="outline">Reenvío detectado</Badge>}
              </div>
              <p className="text-[12px] text-muted-foreground">{resultado.movimiento.tipoEtiqueta}: Bs {Number(resultado.movimiento.monto).toFixed(2)} · {resultado.movimiento.fecha} · {resultado.movimiento.categoria.nombre ?? "Categoría registrada"}</p>
              {guardadoSinComprobante && (
                <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                  El movimiento SÍ está registrado, pero el comprobante NO se guardó.
                  Cuando esté disponible el almacenamiento, adjúntalo desde «Ver detalle» en el listado.
                  Conserva el archivo original: el navegador no lo almacena para más tarde.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={limpiar} disabled={crearMutation.isPending}>
              <RotateCcw className="size-4"/> Limpiar
            </Button>
            <Button type="submit" disabled={crearMutation.isPending || categoriasQuery.isLoading || categoriasQuery.isError || categorias.length === 0} cargando={crearMutation.isPending}>
              <Save className="size-4"/> Guardar movimiento
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Si no dispones de comprobante, puedes adjuntarlo después desde el detalle del movimiento.</p>
        </form>
      </CardContent>
    </Card>
  );
}
