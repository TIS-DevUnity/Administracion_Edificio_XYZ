"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, Droplets, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { financeService } from "@/services/finance.service";
import type { ExpensaDTO, TipoInmuebleDTO } from "@/types/finance";
import { formatCurrency, obtenerMensajeError } from "../utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO = CLASE_HEADER_TABLA;
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";
const IMPORTE_VALIDO = /^\d+(\.\d{1,2})?$/;
const POR_PAGINA = 200;

type EstadoFila = { tipo: "ok" } | { tipo: "error"; mensaje: string };

/** Por qué no se puede cargar el agua de una expensa (mismas reglas que PATCH /expensas/:id/agua). */
function motivoBloqueo(exp: ExpensaDTO): string | null {
  if (exp.estado === "PAGADA") return "Pagada";
  if ((exp.moras?.length ?? 0) > 0) return "Con mora";
  if (exp.planPagoId) return "En plan de pagos";
  return null;
}

async function cargarTodasLasExpensas(periodo: string, bolSoloSinAgua: boolean): Promise<ExpensaDTO[]> {
  const filtros = { periodo, porPagina: POR_PAGINA, ...(bolSoloSinAgua ? { aguaCargada: "false" as const } : {}) };
  const primera = await financeService.getExpensasPaginadas({ ...filtros, pagina: 1 });
  const resto = await Promise.all(
    Array.from({ length: Math.max(primera.paginacion.totalPaginas - 1, 0) }, (_, i) =>
      financeService.getExpensasPaginadas({ ...filtros, pagina: i + 2 })
    )
  );
  return [primera, ...resto]
    .flatMap((pagina) => pagina.expensas)
    .sort((a, b) => a.inmueble.codigo.localeCompare(b.inmueble.codigo, "es", { numeric: true }));
}

/**
 * Interfaz aparte para registrar el agua de todas las expensas de un mes de una sola vez,
 * después de generarlas. Se puede filtrar por tipo y pasar de un campo al siguiente con Enter.
 */
export function DialogoCargaAgua({
  bolAbierto,
  onCerrar,
  strPeriodoInicial,
  tiposInmueble,
  onGuardado,
}: {
  bolAbierto: boolean;
  onCerrar: () => void;
  strPeriodoInicial: string;
  tiposInmueble: TipoInmuebleDTO[];
  onGuardado: () => void;
}) {
  const [strPeriodo, setStrPeriodo] = useState(strPeriodoInicial);
  const [strTipo, setStrTipo] = useState("TODOS");
  const [bolSoloSinAgua, setBolSoloSinAgua] = useState(true);
  const [expensas, setExpensas] = useState<ExpensaDTO[]>([]);
  const [bolCargando, setBolCargando] = useState(false);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [bolGuardando, setBolGuardando] = useState(false);
  const [strResumen, setStrResumen] = useState("");
  const refsInputs = useRef<Map<string, HTMLInputElement>>(new Map());

  async function cargar(periodo = strPeriodo, soloSinAgua = bolSoloSinAgua) {
    setBolCargando(true);
    setStrErrorCarga("");
    setEstados({});
    setStrResumen("");
    try {
      const lista = await cargarTodasLasExpensas(periodo, soloSinAgua);
      setExpensas(lista);
      setValores(
        Object.fromEntries(lista.map((exp) => [exp.id, exp.aguaRegistradaEn ? String(Number(exp.montoAgua)) : ""]))
      );
    } catch (error) {
      setExpensas([]);
      setStrErrorCarga(obtenerMensajeError(error, "No se pudieron cargar las expensas del mes."));
    } finally {
      setBolCargando(false);
    }
  }

  useEffect(() => {
    if (!bolAbierto) return;
    setStrPeriodo(strPeriodoInicial);
    void cargar(strPeriodoInicial, bolSoloSinAgua);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolAbierto]);

  const visibles = useMemo(
    () => expensas.filter((exp) => strTipo === "TODOS" || exp.tipoNombre === strTipo),
    [expensas, strTipo]
  );

  /** Filas editables cuyo valor cambió respecto de lo guardado. */
  const cambios = useMemo(
    () =>
      visibles.filter((exp) => {
        if (motivoBloqueo(exp)) return false;
        const strValor = (valores[exp.id] ?? "").trim();
        if (strValor === "") return false;
        const bolYaCargada = Boolean(exp.aguaRegistradaEn);
        return !bolYaCargada || Number(strValor) !== Number(exp.montoAgua);
      }),
    [visibles, valores]
  );

  const totalAgua = visibles.reduce((acc, exp) => {
    const strValor = (valores[exp.id] ?? "").trim();
    return acc + (IMPORTE_VALIDO.test(strValor) ? Number(strValor) : 0);
  }, 0);

  function pasarAlSiguiente(event: KeyboardEvent<HTMLInputElement>, intIndice: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const siguiente = visibles.slice(intIndice + 1).find((exp) => !motivoBloqueo(exp));
    if (siguiente) refsInputs.current.get(siguiente.id)?.focus();
  }

  async function guardarTodo() {
    const invalidas = cambios.filter((exp) => !IMPORTE_VALIDO.test((valores[exp.id] ?? "").trim()));
    if (invalidas.length > 0) {
      setEstados((prev) => ({
        ...prev,
        ...Object.fromEntries(
          invalidas.map((exp) => [exp.id, { tipo: "error", mensaje: "Importe de 0 o más, máximo 2 decimales." } as EstadoFila])
        ),
      }));
      setStrResumen("");
      return;
    }
    if (cambios.length === 0) {
      setStrResumen("No hay importes nuevos para guardar.");
      return;
    }

    setBolGuardando(true);
    setStrResumen("");
    let intGuardadas = 0;
    let intConError = 0;
    // Uno por uno: si una expensa falla (por ejemplo, ya tiene mora) las demás se guardan igual.
    for (const exp of cambios) {
      try {
        const actualizada = await financeService.cargarAgua(exp.id, Number((valores[exp.id] ?? "").trim()));
        intGuardadas += 1;
        setExpensas((prev) =>
          prev.map((item) =>
            item.id === exp.id
              ? { ...item, montoAgua: actualizada.montoAgua, montoTotal: actualizada.montoTotal, estado: actualizada.estado, aguaRegistradaEn: actualizada.aguaRegistradaEn }
              : item
          )
        );
        setEstados((prev) => ({ ...prev, [exp.id]: { tipo: "ok" } }));
      } catch (error) {
        intConError += 1;
        setEstados((prev) => ({
          ...prev,
          [exp.id]: { tipo: "error", mensaje: obtenerMensajeError(error, "No se pudo guardar.") },
        }));
      }
    }
    setBolGuardando(false);
    setStrResumen(
      `${intGuardadas} importe${intGuardadas === 1 ? "" : "s"} de agua guardado${intGuardadas === 1 ? "" : "s"}` +
        (intConError > 0 ? `; ${intConError} con error (revisa las filas marcadas).` : ".")
    );
    if (intGuardadas > 0) onGuardado();
  }

  return (
    <Dialog open={bolAbierto} onOpenChange={(abierto) => !abierto && !bolGuardando && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>Cargar agua del mes</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
            Ingresa el importe de agua de cada departamento. Se suma a su tarifa fija y recalcula el total de la expensa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[170px_170px_1fr] sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="agua-mes" className={CLASE_LABEL_CAMPO}>Mes</label>
            <Input
              id="agua-mes"
              type="month"
              className="h-9 cursor-pointer"
              value={strPeriodo}
              disabled={bolGuardando}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {
                  // Sin showPicker queda el ícono del campo.
                }
              }}
              onChange={(event) => {
                if (!event.target.value) return;
                setStrPeriodo(event.target.value);
                void cargar(event.target.value, bolSoloSinAgua);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={CLASE_LABEL_CAMPO}>Tipo de departamento</span>
            <Select value={strTipo} onValueChange={setStrTipo} disabled={bolGuardando}>
              <SelectTrigger aria-label="Filtrar por tipo" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los tipos</SelectItem>
                {tiposInmueble.map((tipo) => (
                  <SelectItem key={tipo.id} value={tipo.nombre}>Tipo {tipo.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={bolSoloSinAgua}
                disabled={bolGuardando}
                onChange={(event) => {
                  setBolSoloSinAgua(event.target.checked);
                  void cargar(strPeriodo, event.target.checked);
                }}
              />
              Solo las que faltan cargar
            </label>
            <Button variant="outline" size="sm" cargando={bolCargando} disabled={bolGuardando} onClick={() => void cargar()}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </div>

        {strErrorCarga && <p role="alert" className={CLASE_AVISO_ERROR}>{strErrorCarga}</p>}

        {bolCargando ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visibles.length === 0 ? (
          <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-3 text-[13px] text-success">
            {bolSoloSinAgua
              ? "No quedan expensas sin agua en este mes" + (strTipo !== "TODOS" ? ` para el tipo ${strTipo}.` : ".")
              : "No hay expensas generadas en este mes" + (strTipo !== "TODOS" ? ` para el tipo ${strTipo}.` : ".")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={CLASE_HEADER_TABLA}>Departamento</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Responsable</TableHead>
                  <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Tarifa fija</TableHead>
                  <TableHead className={`${CLASE_HEADER_TABLA} w-[150px]`}>Agua (Bs)</TableHead>
                  <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((exp, intIndice) => {
                  const strBloqueo = motivoBloqueo(exp);
                  const strValor = valores[exp.id] ?? "";
                  const intAgua = IMPORTE_VALIDO.test(strValor.trim()) ? Number(strValor) : Number(exp.montoAgua);
                  const estado = estados[exp.id];
                  return (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <p className="text-[13px] font-medium text-foreground">{exp.inmueble.codigo}</p>
                        <p className={CLASE_AYUDA}>{exp.tipoNombre ? `Tipo ${exp.tipoNombre}` : "Sin tipo"}</p>
                      </TableCell>
                      <TableCell className="text-[13px] text-foreground">{exp.responsableNombre || "—"}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-foreground">
                        {formatCurrency(Number(exp.montoBase))}
                      </TableCell>
                      <TableCell>
                        {strBloqueo ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">{formatCurrency(Number(exp.montoAgua))}</span>
                        ) : (
                          <Input
                            ref={(el) => {
                              if (el) refsInputs.current.set(exp.id, el);
                              else refsInputs.current.delete(exp.id);
                            }}
                            aria-label={`Agua de ${exp.inmueble.codigo}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            className="h-8"
                            value={strValor}
                            disabled={bolGuardando}
                            aria-invalid={estado?.tipo === "error" || undefined}
                            onKeyDown={(event) => pasarAlSiguiente(event, intIndice)}
                            onChange={(event) => {
                              setValores((prev) => ({ ...prev, [exp.id]: event.target.value }));
                              setEstados((prev) => {
                                const siguiente = { ...prev };
                                delete siguiente[exp.id];
                                return siguiente;
                              });
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[13px] font-medium tabular-nums text-foreground">
                        {formatCurrency(Number(exp.montoBase) + intAgua)}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {estado?.tipo === "ok" ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Guardado
                          </span>
                        ) : estado?.tipo === "error" ? (
                          <span className="text-[12px] text-destructive">{estado.mensaje}</span>
                        ) : strBloqueo ? (
                          <span className={CLASE_AYUDA}>{strBloqueo}: no se puede cambiar</span>
                        ) : exp.aguaRegistradaEn ? (
                          <span className={CLASE_AYUDA}>Cargada</span>
                        ) : (
                          <span className="font-caption rounded-full bg-danger-subtle px-2 py-0.5 text-[11px] text-destructive">Sin cargar</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {strResumen && (
          <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strResumen}</p>
        )}

        <p className={CLASE_AYUDA}>
          Presiona Enter para pasar al siguiente departamento. El agua no se puede cambiar si la expensa está pagada, tiene
          mora o está en un plan de pagos, ni dejar el total por debajo de lo ya pagado.
        </p>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[13px] text-muted-foreground">
            <Droplets className="mr-1 inline h-4 w-4 text-primary" />
            {visibles.length} expensa{visibles.length === 1 ? "" : "s"} · agua total{" "}
            <span className="font-medium tabular-nums text-foreground">{formatCurrency(totalAgua)}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={bolGuardando} onClick={onCerrar}>Cerrar</Button>
            <Button cargando={bolGuardando} disabled={bolCargando || cambios.length === 0} onClick={guardarTodo}>
              <Save className="h-4 w-4" />
              {bolGuardando ? "Guardando..." : `Guardar ${cambios.length > 0 ? `(${cambios.length})` : "cambios"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
