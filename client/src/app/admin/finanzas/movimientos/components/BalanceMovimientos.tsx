"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { movimientosService } from "@/services/movimientos.service";
import type { RespuestaBalanceMovimientos } from "@/types/movimientos";

type Rango = { desde: string; hasta: string };
const RANGO_VACIO: Rango = { desde: "", hasta: "" };

function fechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const date = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === fecha;
}
function bs(valor: string | number) {
  return `Bs ${Number(valor).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Convertir a centavos evita que 0.1 + 0.2 provoque diferencias al comprobar totales. */
function centavos(valor: string | number) {
  const cadena = String(valor);
  const signo = cadena.startsWith("-") ? -1 : 1;
  const texto = signo === -1 ? cadena.slice(1) : cadena;
  const [entero, decimal = ""] = texto.split(".");
  if (!/^\d+$/.test(entero) || !/^\d{0,2}$/.test(decimal)) return NaN;
  return signo * (Number(entero) * 100 + Number(decimal.padEnd(2, "0")));
}

function consistencia(balance: RespuestaBalanceMovimientos): boolean {
  const ingresosCategorias = balance.porCategoria.filter(c => c.tipo === "INGRESO")
    .reduce((total, c) => total + centavos(c.total), 0);
  const gastosCategorias = balance.porCategoria.filter(c => c.tipo === "EGRESO")
    .reduce((total, c) => total + centavos(c.total), 0);
  return ingresosCategorias === centavos(balance.ingresos)
    && gastosCategorias === centavos(balance.gastos)
    && ingresosCategorias - gastosCategorias === centavos(balance.balance)
    && balance.porCategoria.filter(c => c.tipo === "INGRESO").reduce((t, c) => t + c.cantidad, 0) === balance.cantidadIngresos
    && balance.porCategoria.filter(c => c.tipo === "EGRESO").reduce((t, c) => t + c.cantidad, 0) === balance.cantidadGastos;
}

export function BalanceMovimientos() {
  const [borrador, setBorrador] = useState<Rango>({ ...RANGO_VACIO });
  const [rango, setRango] = useState<Rango>({ ...RANGO_VACIO });
  const [errorFechas, setErrorFechas] = useState("");
  const balanceQuery = useQuery({
    queryKey: ["hu6", "balance", rango.desde, rango.hasta],
    queryFn: ({ signal }) => movimientosService.obtenerBalance({
      ...(rango.desde ? { desde: rango.desde } : {}),
      ...(rango.hasta ? { hasta: rango.hasta } : {}),
    }, signal),
  });

  function aplicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((borrador.desde && !fechaValida(borrador.desde)) || (borrador.hasta && !fechaValida(borrador.hasta))) {
      setErrorFechas("Introduce fechas válidas.");
      return;
    }
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFechas("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setErrorFechas("");
    setRango({ ...borrador });
  }

  const data = balanceQuery.data;
  const categorias = data?.porCategoria ?? [];
  const maximo = Math.max(1, ...categorias.map(c => Number(c.total)));
  const concuerda = data ? consistencia(data) : true;

  return (
    <section aria-label="Balance de movimientos extraordinarios" className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><Wallet className="size-5"/> Balance de movimientos extraordinarios</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Ingresos menos gastos registrados. No representa el saldo bancario ni incluye automáticamente cobros de expensas.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void balanceQuery.refetch()}
            disabled={balanceQuery.isFetching} aria-label="Actualizar balance">
            <RefreshCw className={`size-4 ${balanceQuery.isFetching ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={aplicar} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[165px] flex-1 space-y-1.5">
              <label htmlFor="hu6-balance-desde" className="text-[12px] font-medium">Desde</label>
              <Input id="hu6-balance-desde" type="date" value={borrador.desde}
                onChange={e => {setBorrador(prev => ({...prev, desde:e.target.value}));setErrorFechas("");}} />
            </div>
            <div className="min-w-[165px] flex-1 space-y-1.5">
              <label htmlFor="hu6-balance-hasta" className="text-[12px] font-medium">Hasta</label>
              <Input id="hu6-balance-hasta" type="date" value={borrador.hasta}
                onChange={e => {setBorrador(prev => ({...prev, hasta:e.target.value}));setErrorFechas("");}} />
            </div>
            <Button type="submit" variant="outline"><CalendarRange className="size-4" /> Aplicar período</Button>
            <Button type="button" variant="ghost" onClick={() => {setBorrador({...RANGO_VACIO});setRango({...RANGO_VACIO});setErrorFechas("");}}>Ver todo</Button>
          </form>
          {errorFechas && <p role="alert" className="text-[12px] text-destructive">{errorFechas}</p>}
          <p className="text-[11px] text-muted-foreground">
            {rango.desde || rango.hasta
              ? `Período: ${rango.desde || "inicio"} a ${rango.hasta || "actualidad"}`
              : "Período: todos los movimientos extraordinarios registrados"}
          </p>
          {balanceQuery.isPending ? (
            <div className="grid gap-3 sm:grid-cols-3" aria-label="Cargando balance">
              {[0,1,2].map(n => <Skeleton key={n} className="h-24 w-full" />)}
            </div>
          ) : balanceQuery.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-3 text-[13px] text-destructive">
              <AlertTriangle className="size-4" /> No se pudo consultar el balance. Comprueba la conexión e inténtalo de nuevo.
              <Button size="sm" variant="outline" onClick={() => void balanceQuery.refetch()}>Reintentar</Button>
            </div>
          ) : data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><ArrowUpRight className="size-4 text-emerald-600" /> Ingresos extraordinarios</p>
                  <p className="mt-2 text-[22px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{bs(data.ingresos)}</p>
                  <p className="text-[11px] text-muted-foreground">{data.cantidadIngresos} registros</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><ArrowDownRight className="size-4 text-rose-600" /> Gastos extraordinarios</p>
                  <p className="mt-2 text-[22px] font-semibold tabular-nums text-rose-700 dark:text-rose-400">{bs(data.gastos)}</p>
                  <p className="text-[11px] text-muted-foreground">{data.cantidadGastos} registros</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-[12px] text-muted-foreground">Resultado neto extraordinario</p>
                  <p className={`mt-2 text-[22px] font-semibold tabular-nums ${Number(data.balance) < 0 ? "text-rose-700 dark:text-rose-400" : "text-foreground"}`}>{bs(data.balance)}</p>
                  <p className="text-[11px] text-muted-foreground">Ingresos − gastos</p>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">Desglose por categoría</h3>
                  <span className="text-[11px] text-muted-foreground">{categorias.length} categorías con movimientos</span>
                </div>
                {categorias.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No hay movimientos en este período.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {categorias.map(c => (
                      <div key={`${c.tipo}-${c.categoriaId}`} className="space-y-1.5 rounded-md bg-muted/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                          <div className="min-w-0"><span className="font-medium">{c.categoria ?? "Categoría eliminada"}</span> <span className="text-muted-foreground">· {c.tipoEtiqueta} · {c.cantidad} mov.</span></div>
                          <span className={`font-semibold tabular-nums ${c.tipo === "INGRESO" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{bs(c.total)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-border">
                          <div className={`h-full rounded-full ${c.tipo === "INGRESO" ? "bg-emerald-500" : "bg-rose-500"}`}
                            style={{width:`${Math.max(0,Math.min(100,Number(c.total)/maximo*100))}%`}} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!concuerda && (
                  <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/40 p-3 text-[12px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 shrink-0" /> Los totales por categoría no coinciden con el balance recibido. Actualiza los datos y consulta al equipo de backend si persiste.
                  </p>
                )}

              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
