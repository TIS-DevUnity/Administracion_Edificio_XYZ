"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart2 } from "lucide-react";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { CajaBancosProvider } from "@/components/caja-bancos/CajaBancosProvider";
import { dinero, fechaLegible, mensajeError, mesActual } from "@/components/caja-bancos/format";
import { cajaBancosService } from "@/services/caja-bancos.service";
import type {
  EstadoMovimientoCaja,
  MovimientoCaja,
  RespuestaSaldos,
  ResumenPeriodo,
  TipoMovimientoCaja,
} from "@/types/caja-bancos";
import DetalleConciliacion from "./components/DetalleConciliacion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Reporte = {
  periodo: string;
  cuentaId: string;
  resumen: ResumenPeriodo;
  saldos: RespuestaSaldos;
};

/** CSV exportable del período solicitado; todas las cifras vienen del backend. */
function descargarResumen(reporte: Reporte) {
  const { resumen, saldos } = reporte;
  const escapar = (valor: string | number) => {
    const texto = String(valor);
    // Evitar inyección de fórmulas al abrir el CSV en una hoja de cálculo.
    const seguro = /^[=+@\-\t\r]/.test(texto) && !/^-?\d+(?:\.\d+)?$/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const filas: Array<Array<string | number>> = [
    ["Período", reporte.periodo],
    ["Ingresos", resumen.totalIngresos],
    ["Egresos", resumen.totalEgresos],
    ["Balance", resumen.balance],
    ["Movimientos", resumen.cantidad],
    ["Conciliados", resumen.conciliados.cantidad],
    ["Pendientes", resumen.pendientes.cantidad],
    ["Con diferencia", resumen.conDiferencia.cantidad],
    [],
    ["Cuenta", "Saldo registrado", "Saldo conciliado", "Saldo real", "Diferencia"],
    ...saldos.cuentas.map((fila) => [
      fila.cuenta.nombre,
      fila.saldoRegistrado,
      fila.saldoConciliado,
      fila.saldoReal ?? "Sin registrar",
      fila.diferencia ?? "Sin registrar",
    ]),
  ];
  const contenido = "\ufeff" + filas.map((fila) => fila.map(escapar).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `resumen-caja-bancos-${reporte.periodo}.csv`;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VistaConciliacion() {
  const { usuario } = useSesionActual();
  const administrador = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const [periodo, setPeriodo] = useState(mesActual);
  const [cuentaId, setCuentaId] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [medio, setMedio] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<MovimientoCaja | null>(null);

  // Bug 4: sólo se presenta un reporte después de solicitarlo explícitamente.
  // Se guardan juntos los filtros utilizados y la respuesta para evitar mezclar meses.
  const [generando, setGenerando] = useState(false);
  const [errorReporte, setErrorReporte] = useState("");
  const [reporte, setReporte] = useState<Reporte | null>(null);

  const params = useMemo(() => ({
    periodo,
    cuentaId: cuentaId || undefined,
    tipo: (tipo || undefined) as TipoMovimientoCaja | undefined,
    estado: (estado || undefined) as EstadoMovimientoCaja | undefined,
    medio: medio || undefined,
    pagina,
    porPagina: 10,
  }), [periodo, cuentaId, tipo, estado, medio, pagina]);

  const cuentas = useQuery({
    queryKey: ["hu7", "cuentas"],
    queryFn: cajaBancosService.cuentas,
  });
  const consulta = useQuery({
    queryKey: ["hu7", "movimientos", params],
    queryFn: () => cajaBancosService.movimientos(params),
  });
  const r = consulta.data;

  const filtro = (accion: () => void) => {
    accion();
    setPagina(1);
  };

  async function generarResumen() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) || generando) return;
    const periodoSolicitado = periodo;
    const cuentaSolicitada = cuentaId;
    setGenerando(true);
    setErrorReporte("");
    setReporte(null);
    try {
      const [resumen, saldos] = await Promise.all([
        cajaBancosService.resumen(periodoSolicitado, cuentaSolicitada || undefined),
        cajaBancosService.saldos(periodoSolicitado, cuentaSolicitada || undefined),
      ]);
      setReporte({ periodo: periodoSolicitado, cuentaId: cuentaSolicitada, resumen, saldos });
    } catch (error) {
      setErrorReporte(`No se pudo generar el resumen: ${mensajeError(error)}`);
    } finally {
      setGenerando(false);
    }
  }

  const metricas = [
    { titulo: "Ingresos", valor: r?.resumen.ingresos, esDinero: true },
    { titulo: "Egresos", valor: r?.resumen.egresos, esDinero: true },
    { titulo: "Balance del filtro", valor: r?.resumen.balance, esDinero: true },
    { titulo: "Pendientes", valor: r?.resumen.porEstado.PENDIENTE.cantidad, esDinero: false },
    { titulo: "Con diferencia", valor: r?.resumen.porEstado.CON_DIFERENCIA.cantidad, esDinero: false },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conciliación de caja y bancos</h1>
          <p className="text-sm text-muted-foreground">Consulta, verifica y concilia movimientos del edificio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/admin/finanzas/flujo-caja">Flujo de caja</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/finanzas/conciliacion/historial">Cierres e historial</Link></Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros de movimientos">
          <label className="space-y-1 text-xs">Período
            <Input type="month" value={periodo} onChange={(e) => filtro(() => setPeriodo(e.target.value))} />
          </label>
          <div className="space-y-1"><label className="text-xs" htmlFor="filtro-cuenta">Cuenta o caja</label>
            <Select value={cuentaId || "todas"} onValueChange={(valor) => filtro(() => setCuentaId(valor === "todas" ? "" : valor))}>
              <SelectTrigger id="filtro-cuenta" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas</SelectItem>{(cuentas.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><label className="text-xs" htmlFor="filtro-tipo">Tipo</label>
            <Select value={tipo || "todos"} onValueChange={(valor) => filtro(() => setTipo(valor === "todos" ? "" : valor))}>
              <SelectTrigger id="filtro-tipo" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="INGRESO">Ingresos</SelectItem><SelectItem value="EGRESO">Egresos</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><label className="text-xs" htmlFor="filtro-estado">Estado</label>
            <Select value={estado || "todos"} onValueChange={(valor) => filtro(() => setEstado(valor === "todos" ? "" : valor))}>
              <SelectTrigger id="filtro-estado" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="PENDIENTE">Pendientes</SelectItem><SelectItem value="CON_DIFERENCIA">Con diferencia</SelectItem><SelectItem value="CONCILIADO">Conciliados</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><label className="text-xs" htmlFor="filtro-medio">Medio</label>
            <Select value={medio || "todos"} onValueChange={(valor) => filtro(() => setMedio(valor === "todos" ? "" : valor))}>
              <SelectTrigger id="filtro-medio" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="EFECTIVO">Efectivo</SelectItem><SelectItem value="TRANSFERENCIA">Banco / transferencia</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {cuentas.isError && <p role="alert" className="text-sm text-destructive">No fue posible cargar las cuentas: {mensajeError(cuentas.error)}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">El resumen incluye el mes completo seleccionado y la cuenta elegida; no depende de la página del listado.</p>
        <Button onClick={() => void generarResumen()} disabled={generando || !periodo || consulta.isLoading}>
          <FileBarChart2 className="mr-2 size-4" />{generando ? "Generando resumen..." : "Generar resumen"}
        </Button>
      </div>
      {errorReporte && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{errorReporte}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indicadores de movimientos">
        {metricas.map(({ titulo, valor, esDinero }) => (
          <Card key={titulo}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <p className="mt-2 text-xl font-semibold">{r ? (esDinero ? dinero(valor as string) : String(valor)) : "—"}</p>
          </CardContent></Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <CardTitle>Movimientos del período</CardTitle>
          <Button variant="outline" size="sm" disabled={consulta.isFetching} onClick={() => void consulta.refetch()}>Actualizar</Button>
        </CardHeader>
        <CardContent className="p-0">
          {consulta.isLoading ? (
            <p className="p-5 text-sm">Cargando movimientos...</p>
          ) : consulta.isError ? (
            <p role="alert" className="p-5 text-sm text-destructive">{mensajeError(consulta.error)}</p>
          ) : !r?.movimientos.length ? (
            <p className="p-5 text-sm text-muted-foreground">No hay movimientos registrados para los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-muted/50 text-xs"><tr>{["Fecha", "Concepto", "Medio y cuenta", "Tipo", "Importe", "Estado", "Acción"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
              <tbody>{r.movimientos.map(m => <tr key={m.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-3">{fechaLegible(m.fecha)}</td>
                <td className="max-w-56 px-3 py-3"><p className="font-medium">{m.concepto}</p><p className="text-xs text-muted-foreground">{m.referencia ?? m.origen}</p></td>
                <td className="px-3 py-3">{m.cuenta.nombre}<p className="text-xs text-muted-foreground">{m.medio === "EFECTIVO" ? "Efectivo" : "Banco / transferencia"}</p></td>
                <td className="px-3 py-3">{m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</td>
                <td className={`whitespace-nowrap px-3 py-3 font-medium ${m.tipo === "INGRESO" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{m.tipo === "INGRESO" ? "+" : "−"} {dinero(m.monto)}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${m.estado === "CONCILIADO" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : m.estado === "CON_DIFERENCIA" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{m.estadoEtiqueta ?? m.estado}</span></td>
                <td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => setSeleccion(m)}>{administrador && m.estado !== "CONCILIADO" && !m.bloqueado ? "Revisar" : "Ver detalle"}</Button></td>
              </tr>)}</tbody>
            </table></div>
          )}
          {r && r.paginacion.total > 0 && <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
            <span>{r.paginacion.total} movimientos · página {r.paginacion.pagina} de {Math.max(1, r.paginacion.totalPaginas)}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={pagina >= r.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
          </div>}
        </CardContent>
      </Card>

      <DetalleConciliacion movimiento={seleccion} onClose={() => setSeleccion(null)} administrador={administrador} />

      <Dialog open={Boolean(reporte)} onOpenChange={(abierta) => { if (!abierta) setReporte(null); }}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Resumen del período {reporte?.periodo}</DialogTitle>
            <DialogDescription>
              {reporte?.cuentaId ? reporte.saldos.cuentas[0]?.cuenta.nombre ?? "Cuenta seleccionada" : "Todas las cuentas y cajas"} 
            </DialogDescription>
          </DialogHeader>
          {reporte && <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Ingresos", dinero(reporte.resumen.totalIngresos)],
                ["Egresos", dinero(reporte.resumen.totalEgresos)],
                ["Balance", dinero(reporte.resumen.balance)],
                ["Conciliados", reporte.resumen.conciliados.cantidad],
                ["Pendientes", reporte.resumen.pendientes.cantidad],
                ["Con diferencia", reporte.resumen.conDiferencia.cantidad],
              ].map(([titulo, valor]) => <Card key={String(titulo)}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{titulo}</p><p className="mt-2 text-lg font-semibold">{valor}</p></CardContent></Card>)}
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Saldos por cuenta</h3>
              {reporte.saldos.cuentas.length === 0 ? <p className="text-sm text-muted-foreground">Sin cuentas para este período.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs">
                  <thead><tr className="border-b">{["Cuenta", "Registrado", "Conciliado", "Real", "Diferencia"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
                  <tbody>{reporte.saldos.cuentas.map(fila => <tr key={fila.cuenta.id} className="border-b">
                    <td className="p-2 font-medium">{fila.cuenta.nombre}</td>
                    <td className="p-2">{dinero(fila.saldoRegistrado)}</td>
                    <td className="p-2">{dinero(fila.saldoConciliado)}</td>
                    <td className="p-2">{dinero(fila.saldoReal)}</td>
                    <td className="p-2">{dinero(fila.diferencia)}</td>
                  </tr>)}</tbody>
                </table></div>
              )}
              <p className="text-xs text-muted-foreground">{reporte.resumen.periodoCerrado ? "Período cerrado" : "Período abierto"}. Los valores no registrados se indican como tales; no se sustituyen por cifras ficticias.</p>
            </section>
            <div className="flex justify-end"><Button variant="outline" onClick={() => descargarResumen(reporte)}><Download className="mr-2 size-4"/>Exportar CSV</Button></div>
          </>}
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default function ConciliacionPage() {
  const { usuario } = useSesionActual();
  if (usuario && normalizarRol(usuario.rol) === "CONSULTA") {
    return <p className="p-6 text-sm text-destructive">No tienes permisos para consultar conciliaciones de caja y bancos.</p>;
  }
  return <CajaBancosProvider><VistaConciliacion /></CajaBancosProvider>;
}
