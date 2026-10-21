"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryProvider } from "../movimientos/QueryProvider";
import { saldoEdificioService } from "@/services/saldo-edificio.service";
import type { FiltrosSaldoEdificio, TipoMovimientoSaldo } from "@/types/saldo-edificio";

const formatearBs = (valor: string | number) =>
  new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor) || 0);

function formatearFecha(fecha: string) {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha;
}

function mensajeError(error: unknown): string {
  const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
  if (axiosError?.response?.status === 403) return "Tu usuario no tiene permiso para consultar el saldo del edificio.";
  if (axiosError?.response?.status === 401) return "Tu sesión ha expirado. Vuelve a iniciar sesión.";
  return axiosError?.response?.data?.message || "No se pudo consultar el saldo. Comprueba que el backend esté disponible.";
}

const POR_PAGINA = 10;

function ContenidoSaldoEdificio() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | TipoMovimientoSaldo>("TODOS");
  const [filtros, setFiltros] = useState<FiltrosSaldoEdificio>({ pagina: 1, porPagina: POR_PAGINA });
  const [errorFiltro, setErrorFiltro] = useState("");

  const consulta = useQuery({
    queryKey: ["saldo-edificio", filtros],
    queryFn: () => saldoEdificioService.obtener(filtros),
    staleTime: 30_000,
    retry: 1,
  });
  const datos = consulta.data;
  const hayRango = Boolean(filtros.desde || filtros.hasta);
  const historialFiltrado = filtros.tipo !== undefined;

  function aplicarFiltros() {
    if (desde && hasta && desde > hasta) {
      setErrorFiltro("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setErrorFiltro("");
    setFiltros({
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
      ...(tipo !== "TODOS" ? { tipo } : {}),
      pagina: 1,
      porPagina: POR_PAGINA,
    });
  }

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
    setTipo("TODOS");
    setErrorFiltro("");
    setFiltros({ pagina: 1, porPagina: POR_PAGINA });
  }

  function irPagina(pagina: number) {
    setFiltros((prev) => ({ ...prev, pagina }));
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-3"><Wallet className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="font-title text-[24px] font-bold">Consultar saldo del edificio</h1>
            <p className="text-[13px] text-muted-foreground">Ingresos recibidos, gastos registrados e historial financiero general.</p>
          </div>
        </div>
        <Button variant="outline" type="button" disabled={consulta.isFetching} onClick={() => void consulta.refetch()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${consulta.isFetching ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4" /> Filtrar consulta</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end" onSubmit={(e) => { e.preventDefault(); aplicarFiltros(); }}>
            <label className="grid gap-1 text-xs text-muted-foreground">Desde
              <input aria-label="Fecha desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Hasta
              <input aria-label="Fecha hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Tipo (solo historial)</span>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "TODOS" | TipoMovimientoSaldo)}>
                <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los movimientos</SelectItem>
                  <SelectItem value="INGRESO">Solo ingresos</SelectItem>
                  <SelectItem value="GASTO">Solo gastos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">Aplicar</Button>
            <Button type="button" variant="outline" onClick={limpiarFiltros}>Limpiar</Button>
          </form>
          {errorFiltro && <p role="alert" className="mt-2 text-sm text-destructive">{errorFiltro}</p>}
          <p className="mt-3 text-xs text-muted-foreground">
            El filtro de tipo afecta al historial, no a los totales. El saldo acumulado incluye todos los movimientos hasta la fecha final seleccionada.
          </p>
        </CardContent>
      </Card>

      {consulta.isError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {mensajeError(consulta.error)}
        </div>
      )}

      {consulta.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : datos ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="sm:col-span-2"><CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Saldo acumulado del edificio</p>
              <p className={`mt-2 break-words text-3xl font-bold ${Number(datos.saldoActual) < 0 ? "text-destructive" : "text-success"}`}>{formatearBs(datos.saldoActual)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{filtros.hasta ? `Acumulado hasta el ${formatearFecha(filtros.hasta)}` : "Acumulado de los registros existentes"}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Ingresos {hayRango ? "del período" : "totales"}</p><p className="mt-2 text-2xl font-bold text-success">{formatearBs(datos.totalIngresos)}</p><ArrowUpRight className="mt-2 h-4 w-4 text-success" /></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Gastos {hayRango ? "del período" : "totales"}</p><p className="mt-2 text-2xl font-bold text-destructive">{formatearBs(datos.totalGastos)}</p><ArrowDownRight className="mt-2 h-4 w-4 text-destructive" /></CardContent></Card>
          </div>
          {hayRango && <Card><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="text-sm text-muted-foreground">Resultado del período seleccionado (ingresos − gastos)</span><strong className={`text-lg ${Number(datos.saldoDelPeriodo) < 0 ? "text-destructive" : "text-success"}`}>{formatearBs(datos.saldoDelPeriodo)}</strong></CardContent></Card>}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Origen de los ingresos</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><span>Pagos de expensas y anticipos recibidos</span><strong className="tabular-nums">{formatearBs(datos.ingresos.pagosDeExpensas)}</strong></div>
                <div className="flex items-center justify-between gap-4"><span>Ingresos extraordinarios</span><strong className="tabular-nums">{formatearBs(datos.ingresos.extraordinarios)}</strong></div>
                <p className="text-xs text-muted-foreground">No se suman las deudas pendientes ni se cuenta dos veces el uso de saldo a favor.</p>
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="text-base">Gastos y cuentas por cobrar</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><span>Gastos extraordinarios registrados</span><strong className="tabular-nums">{formatearBs(datos.gastos.extraordinarios)}</strong></div>
                <div className="flex items-center justify-between gap-4"><span>Deuda pendiente de residentes</span><strong className="tabular-nums">{formatearBs(datos.pendienteDeCobro.deudaPendienteDeCobro)}</strong></div>
                <div className="flex items-center justify-between gap-4"><span>Saldo a favor de residentes</span><strong className="tabular-nums">{formatearBs(datos.pendienteDeCobro.saldoAFavorDeResidentes)}</strong></div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0" /> Deudas y saldos a favor son informativos; no se agregan ni restan del saldo general.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4" /> Historial general de movimientos</CardTitle><p className="mt-1 text-xs text-muted-foreground">Pagos y movimientos extraordinarios, ordenados del más reciente al más antiguo.</p></div>
              <span className="text-xs text-muted-foreground">{datos.paginacion.total} registros{historialFiltrado ? " (tipo filtrado)" : ""}</span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Fecha</th><th className="p-3">Concepto / origen</th><th className="p-3">Tipo</th><th className="p-3 text-right">Monto</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {datos.movimientos.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No hay movimientos para estos filtros.</td></tr>
                    ) : datos.movimientos.map((mov) => (
                      <tr key={`${mov.origen}-${mov.id}`}>
                        <td className="whitespace-nowrap p-3 tabular-nums">{formatearFecha(mov.fecha)}</td>
                        <td className="p-3"><div className="font-medium">{mov.concepto}</div><div className="mt-1 text-xs text-muted-foreground">{mov.origen === "PAGO_EXPENSA" ? `Pago de expensa${mov.detalle.folio ? ` · ${mov.detalle.folio}` : ""}` : `Extraordinario${mov.detalle.categoria ? ` · ${mov.detalle.categoria}` : ""}`}</div></td>
                        <td className="p-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${mov.tipo === "INGRESO" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{mov.tipoEtiqueta}</span></td>
                        <td className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${mov.tipo === "INGRESO" ? "text-success" : "text-destructive"}`}>{mov.tipo === "INGRESO" ? "+" : "−"}{formatearBs(mov.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Página {datos.paginacion.pagina} de {Math.max(1, datos.paginacion.totalPaginas)}</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => irPagina(datos.paginacion.pagina - 1)} disabled={consulta.isFetching || datos.paginacion.pagina <= 1}><ChevronLeft className="mr-1 size-4" /> Anterior</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => irPagina(datos.paginacion.pagina + 1)} disabled={consulta.isFetching || datos.paginacion.pagina >= datos.paginacion.totalPaginas}>Siguiente <ChevronRight className="ml-1 size-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Este saldo representa las operaciones registradas en el sistema; no equivale necesariamente al saldo bancario conciliado. Los sueldos de personal aún no se descuentan automáticamente.</p>
        </>
      ) : null}
    </main>
  );
}

export default function SaldoEdificioPage() {
  return <QueryProvider><ContenidoSaldoEdificio /></QueryProvider>;
}
