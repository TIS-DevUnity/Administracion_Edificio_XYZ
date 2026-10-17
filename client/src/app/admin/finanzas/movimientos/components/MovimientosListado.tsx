"use client";

import { useState, type FormEvent } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, FilterX, RefreshCw,
  Eye, Pencil, ReceiptText, Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { movimientosService } from "@/services/movimientos.service";
import { MovimientoDetalle } from "./MovimientoDetalle";
import { MovimientoEditar } from "./MovimientoEditar";
import type {
  FiltrosMovimientosAPI,
  MovimientoFinanciero,
  ResumenMovimientos,
  TipoMovimientoFormulario,
} from "@/types/movimientos";

type FiltrosUI = { tipo: "" | TipoMovimientoFormulario; categoriaId: string; desde: string; hasta: string };
const VACIO: FiltrosUI = { tipo: "", categoriaId: "", desde: "", hasta: "" };
const POR_PAGINA = 10;

function formatoBs(valor: string | number): string {
  return `Bs ${Number(valor).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaLegible(fecha: string): string {
  const partes = fecha.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fecha;
}

function fechaCalendarioValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const valor = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha;
}

function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const cuerpo = error.response?.data as { message?: string; error?: string; mensaje?: string } | undefined;
    return cuerpo?.message ?? cuerpo?.mensaje ?? cuerpo?.error ?? "No se pudieron cargar los movimientos.";
  }
  return error instanceof Error ? error.message : "No se pudieron cargar los movimientos.";
}

function etiquetaTipo(movimiento: MovimientoFinanciero) {
  return movimiento.tipo === "INGRESO" ? (
    <Badge variant="outline" className="gap-1 border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
      <ArrowUpRight className="size-3" /> Ingreso
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-400">
      <ArrowDownRight className="size-3" /> Gasto
    </Badge>
  );
}

function importe(movimiento: MovimientoFinanciero) {
  const ingreso = movimiento.tipo === "INGRESO";
  return (
    <span className={ingreso ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-rose-700 dark:text-rose-400"}>
      {ingreso ? "+" : "−"}{formatoBs(movimiento.monto)}
    </span>
  );
}

function Resumen({ resumen }: { resumen: ResumenMovimientos }) {
  const indicadores = [
    { clave: "ingresos", titulo: "Ingresos filtrados", valor: resumen.ingresos, clase: "text-emerald-700 dark:text-emerald-400" },
    { clave: "gastos", titulo: "Gastos filtrados", valor: resumen.gastos, clase: "text-rose-700 dark:text-rose-400" },
    { clave: "neto", titulo: "Resultado neto filtrado", valor: resumen.balance, clase: "text-foreground" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de resultados filtrados">
      {indicadores.map(indicador => (
        <Card key={indicador.clave}>
          <CardContent className="space-y-2 py-4">
            <p className="text-[12px] text-muted-foreground">{indicador.titulo}</p>
            <p className={`text-[21px] font-semibold tabular-nums ${indicador.clase}`}>{formatoBs(indicador.valor)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MovimientosListado() {
  const [borrador, setBorrador] = useState<FiltrosUI>({ ...VACIO });
  const [aplicados, setAplicados] = useState<FiltrosUI>({ ...VACIO });
  const [pagina, setPagina] = useState(1);
  const [errorFechas, setErrorFechas] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmacionEdicion, setConfirmacionEdicion] = useState("");

  const categoriasQuery = useQuery({
    queryKey: ["hu6", "categorias", "todas"],
    queryFn: ({ signal }) => movimientosService.listarTodasCategorias(signal),
  });

  const parametros: FiltrosMovimientosAPI = {
    ...(aplicados.tipo ? { tipo: aplicados.tipo } : {}),
    ...(aplicados.categoriaId ? { categoriaId: aplicados.categoriaId } : {}),
    ...(aplicados.desde ? { desde: aplicados.desde } : {}),
    ...(aplicados.hasta ? { hasta: aplicados.hasta } : {}),
    pagina,
    porPagina: POR_PAGINA,
  };

  const movimientosQuery = useQuery({
    queryKey: ["hu6", "movimientos", aplicados, pagina],
    queryFn: ({ signal }) => movimientosService.listarMovimientos(parametros, signal),
  });

  const categoriasDisponibles = (categoriasQuery.data ?? []).filter(
    cat => !borrador.tipo || cat.tipo === (borrador.tipo === "GASTO" ? "EGRESO" : "INGRESO"),
  );

  function cambiarTipo(valor: string) {
    const tipo = valor === "TODOS" ? "" : valor as TipoMovimientoFormulario;
    setBorrador(prev => ({ ...prev, tipo, categoriaId: "" }));
    setErrorFechas("");
  }

  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if ((borrador.desde && !fechaCalendarioValida(borrador.desde)) ||
        (borrador.hasta && !fechaCalendarioValida(borrador.hasta))) {
      setErrorFechas("Introduce fechas válidas para realizar la búsqueda.");
      return;
    }
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFechas("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setErrorFechas("");
    setPagina(1);
    setAplicados({ ...borrador });
  }

  function limpiar() {
    setBorrador({ ...VACIO });
    setAplicados({ ...VACIO });
    setPagina(1);
    setErrorFechas("");
  }

  const data = movimientosQuery.data;
  const total = data?.paginacion.total ?? 0;
  const paginas = Math.max(1, data?.paginacion.totalPaginas ?? 1);
  const rangoInicio = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const rangoFin = Math.min(pagina * POR_PAGINA, total);

  return (
    <section aria-label="Listado de movimientos extraordinarios" className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle>Consultar movimientos</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            Filtra por tipo, categoría y fecha. El listado utiliza movimientos registrados en el sistema.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={aplicar}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <label htmlFor="hu6-filtro-tipo" className="text-[12px] font-medium">Tipo</label>
                <Select value={borrador.tipo || "TODOS"} onValueChange={cambiarTipo}>
                  <SelectTrigger id="hu6-filtro-tipo" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Ingresos y gastos</SelectItem>
                    <SelectItem value="GASTO">Solo gastos</SelectItem>
                    <SelectItem value="INGRESO">Solo ingresos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="hu6-filtro-categoria" className="text-[12px] font-medium">Categoría</label>
                <Select value={borrador.categoriaId || "TODAS"} onValueChange={valor => setBorrador(prev => ({ ...prev, categoriaId: valor === "TODAS" ? "" : valor }))}
                  disabled={categoriasQuery.isLoading || categoriasQuery.isError}>
                  <SelectTrigger id="hu6-filtro-categoria" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas las categorías</SelectItem>
                    {categoriasDisponibles.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nombre} {!borrador.tipo ? `(${cat.tipoEtiqueta})` : ""}{!cat.activa ? " · Inactiva" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoriasQuery.isError && (
                  <p role="alert" className="text-[11px] text-destructive">
                    No se cargaron las categorías. <button type="button" className="underline" onClick={() => void categoriasQuery.refetch()}>Reintentar</button>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="hu6-filtro-desde" className="text-[12px] font-medium">Desde</label>
                <Input id="hu6-filtro-desde" type="date" value={borrador.desde} onChange={e => { setBorrador(prev => ({ ...prev, desde: e.target.value })); setErrorFechas(""); }} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="hu6-filtro-hasta" className="text-[12px] font-medium">Hasta</label>
                <Input id="hu6-filtro-hasta" type="date" value={borrador.hasta} onChange={e => { setBorrador(prev => ({ ...prev, hasta: e.target.value })); setErrorFechas(""); }} />
              </div>
            </div>
            {errorFechas && <p role="alert" className="text-[12px] text-destructive">{errorFechas}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={limpiar}><FilterX className="size-4" /> Limpiar filtros</Button>
              <Button type="submit"><Search className="size-4" /> Aplicar filtros</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {confirmacionEdicion && (
        <div role="status" className="rounded-lg border border-emerald-300/40 bg-emerald-500/5 p-3 text-[12px] text-emerald-700 dark:text-emerald-400">
          {confirmacionEdicion}
        </div>
      )}
      {movimientosQuery.isLoading && (
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Cargando resumen">
          {[1, 2, 3].map(numero => <Skeleton key={numero} className="h-24 rounded-lg" />)}
        </div>
      )}
      {movimientosQuery.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-[13px] text-destructive">
          <span>{mensajeError(movimientosQuery.error)}</span>
          <Button type="button" variant="outline" onClick={() => void movimientosQuery.refetch()}><RefreshCw className="size-4" /> Reintentar</Button>
        </div>
      )}
      {data && !movimientosQuery.isError && <Resumen resumen={data.resumen} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <CardTitle>Movimientos registrados</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              {movimientosQuery.isLoading ? "Consultando registros…" : `${total} registro${total === 1 ? "" : "s"} con los filtros aplicados`}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void movimientosQuery.refetch()}
            disabled={movimientosQuery.isFetching} aria-label="Actualizar listado de movimientos">
            <RefreshCw className={`size-4 ${movimientosQuery.isFetching ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {movimientosQuery.isLoading ? (
            <div className="space-y-3" aria-label="Cargando movimientos">
              {[1, 2, 3, 4].map(numero => <Skeleton key={numero} className="h-12 w-full" />)}
            </div>
          ) : !movimientosQuery.isError && data?.movimientos.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <ReceiptText className="size-8" />
              <p className="text-[14px] font-medium">No hay movimientos para esta selección.</p>
              <p className="text-[12px]">Registra un movimiento o modifica los filtros de búsqueda.</p>
            </div>
          ) : !movimientosQuery.isError && data ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[12px] text-muted-foreground">
                      <th scope="col" className="px-3 py-3 font-medium">Fecha</th>
                      <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                      <th scope="col" className="px-3 py-3 font-medium">Categoría</th>
                      <th scope="col" className="px-3 py-3 font-medium">Concepto</th>
                      <th scope="col" className="px-3 py-3 font-medium">Comprobante</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Importe</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movimientos.map(mov => (
                      <tr key={mov.id} className="border-b border-border/70 last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">{fechaLegible(mov.fecha)}</td>
                        <td className="px-3 py-3">{etiquetaTipo(mov)}</td>
                        <td className="px-3 py-3">{mov.categoria.nombre ?? "Sin nombre"}</td>
                        <td className="max-w-[260px] break-words px-3 py-3">{mov.concepto}</td>
                        <td className="px-3 py-3 text-muted-foreground">{mov.tieneComprobante ? "Adjunto" : "Sin adjunto"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{importe(mov)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSeleccionado(mov.id)}
                              aria-label={`Ver detalle de ${mov.concepto}`}>
                              <Eye className="size-4" /> Detalle
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditando(mov.id)}
                              aria-label={`Editar ${mov.concepto}`}>
                              <Pencil className="size-4" /> Editar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {data.movimientos.map(mov => (
                  <article key={mov.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {etiquetaTipo(mov)}
                      <span className="text-[12px] tabular-nums text-muted-foreground">{fechaLegible(mov.fecha)}</span>
                    </div>
                    <p className="break-words text-[13px] font-semibold">{mov.concepto}</p>
                    <p className="text-[12px] text-muted-foreground">{mov.categoria.nombre ?? "Sin nombre"}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
                      <span className="text-[11px] text-muted-foreground">{mov.tieneComprobante ? "Con comprobante" : "Sin comprobante"}</span>
                      <span className="text-[14px] tabular-nums">{importe(mov)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" size="sm" className="w-full"
                        onClick={() => setSeleccionado(mov.id)}>
                        <Eye className="size-4" /> Detalle
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="w-full"
                        onClick={() => setEditando(mov.id)}>
                        <Pencil className="size-4" /> Editar
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-[12px] text-muted-foreground" aria-live="polite">
                  Mostrando {rangoInicio}–{rangoFin} de {total} · Página {pagina} de {paginas}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina <= 1 || movimientosQuery.isFetching}>
                    <ChevronLeft className="size-4" /> Anterior
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPagina(p => Math.min(paginas, p + 1))}
                    disabled={pagina >= paginas || movimientosQuery.isFetching}>
                    Siguiente <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
      <MovimientoDetalle key={seleccionado ?? "sin-seleccion"} movimientoId={seleccionado}
        onCerrar={() => setSeleccionado(null)} />
      <MovimientoEditar key={editando ?? "sin-edicion"} movimientoId={editando}
        onCerrar={() => setEditando(null)}
        onGuardado={mensaje => { setEditando(null); setConfirmacionEdicion(mensaje); }} />
      <p className="text-[11px] text-muted-foreground">
        Los totales corresponden a todos los movimientos que coinciden con los filtros, no solo a la página actual.
        No representan necesariamente el saldo total de caja y bancos del edificio.
      </p>
    </section>
  );
}
