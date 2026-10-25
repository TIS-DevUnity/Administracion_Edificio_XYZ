"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertCircle, Landmark, Wallet, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import { CajaBancosProvider } from "@/components/caja-bancos/CajaBancosProvider";
import { dinero, mensajeError, mesActual, mesRelativo, montoValido } from "@/components/caja-bancos/format";
import { cajaBancosService } from "@/services/caja-bancos.service";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { SaldoCuentaPeriodo } from "@/types/caja-bancos";

const COLOR_INGRESO = "#168560";
const COLOR_EGRESO = "#d9785e";
const COLOR_PENDIENTE = "#d5a24d";

interface ItemKpiProps {
  titulo: string;
  valor: string;
  icono?: ReactNode;
  descripcion?: string;
  tono?: "positivo" | "negativo" | "normal";
  cargando?: boolean;
}

function Kpi({ titulo, valor, icono, descripcion, tono = "normal", cargando = false }: ItemKpiProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
          <span className="text-muted-foreground">{icono}</span>
        </div>
        {cargando ? <Skeleton className="mt-3 h-7 w-28" /> : (
          <p className={`mt-2 text-xl font-semibold ${tono === "positivo" ? "text-emerald-700 dark:text-emerald-400" : tono === "negativo" ? "text-rose-700 dark:text-rose-400" : ""}`}>
            {valor}
          </p>
        )}
        {descripcion && <p className="mt-2 text-xs text-muted-foreground">{descripcion}</p>}
      </CardContent>
    </Card>
  );
}

function SaldoRealEditor({ periodo, fila, cerrado }: { periodo: string; fila: SaldoCuentaPeriodo; cerrado: boolean }) {
  const { usuario } = useSesionActual();
  const admin = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");

  const guardar = useMutation({
    mutationFn: () => cajaBancosService.guardarSaldoReal(periodo, fila.cuenta.id, monto.replace(",", "."), observacion),
    onSuccess: async () => { setEditando(false); setError(""); await qc.invalidateQueries({ queryKey: ["hu7"] }); },
    onError: (e) => setError(mensajeError(e)),
  });
  const revisar = useMutation({
    mutationFn: () => cajaBancosService.revisarDiferencia(periodo, fila.cuenta.id, observacion),
    onSuccess: async () => { setObservacion(""); setError(""); await qc.invalidateQueries({ queryKey: ["hu7"] }); },
    onError: (e) => setError(mensajeError(e)),
  });

  const diferencia = fila.diferencia != null && Number(fila.diferencia) !== 0;
  const faltaReal = fila.saldoReal == null;
  const cifras = [
    { etiqueta: "Registrado", monto: fila.saldoRegistrado },
    { etiqueta: "Conciliado", monto: fila.saldoConciliado },
    { etiqueta: "Real", monto: fila.saldoReal },
    { etiqueta: "Diferencia", monto: fila.diferencia },
  ];

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {fila.cuenta.tipo === "CAJA" ? <Wallet className="size-4 text-muted-foreground" /> : <Landmark className="size-4 text-muted-foreground" />}
            <CardTitle>{fila.cuenta.nombre}</CardTitle>
          </div>
          {cerrado && <Badge variant="secondary">Período cerrado</Badge>}
        </div>
        <CardDescription>{fila.cuenta.tipo === "CAJA" ? "Efectivo" : "Cuenta bancaria"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          {cifras.map(({ etiqueta, monto }) => (
            <div key={etiqueta}>
              <p className="text-xs text-muted-foreground">{etiqueta}</p>
              <p className={`font-semibold ${etiqueta === "Diferencia" && diferencia ? "text-destructive" : ""}`}>
                {dinero(monto)}
              </p>
            </div>
          ))}
        </div>
        {faltaReal && <p className="text-xs text-amber-700 dark:text-amber-300">Falta registrar el saldo real de esta cuenta.</p>}
        {diferencia && (
          <p className="text-xs text-destructive">
            {fila.diferenciaRevisada || fila.diferenciaConfirmada ? "Diferencia revisada / confirmada" : "Diferencia pendiente de aclaración"}
          </p>
        )}
        {fila.observacion && <p className="text-xs text-muted-foreground">Observación: {fila.observacion}</p>}
        {admin && !cerrado && (
          <div className="space-y-3 border-t pt-3">
            {!editando && (
              <Button size="sm" variant="outline" onClick={() => {
                setMonto(fila.saldoReal ?? "0.00"); setObservacion(""); setEditando(true); setError("");
              }}>
                {faltaReal ? "Ingresar saldo real" : "Corregir saldo real"}
              </Button>
            )}
            {editando && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium">
                    <span>Saldo real (Bs)</span>
                    <Input value={monto} inputMode="decimal" onChange={(e) => setMonto(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span>Observación (opcional)</span>
                    <Input maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={guardar.isPending || !montoValido(monto)} onClick={() => guardar.mutate()}>
                    {guardar.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditando(false); setError(""); }}>Cancelar</Button>
                </div>
              </div>
            )}
            {diferencia && !fila.diferenciaRevisada && !editando && (
              <div className="space-y-2">
                <label className="block space-y-1 text-xs font-medium">
                  <span>Justificación de la diferencia</span>
                  <Input value={observacion} maxLength={500} onChange={(e) => setObservacion(e.target.value)} placeholder="Motivo de la diferencia" />
                </label>
                <Button size="sm" variant="outline" disabled={!observacion.trim() || revisar.isPending} onClick={() => revisar.mutate()}>
                  {revisar.isPending ? "Revisando..." : "Marcar diferencia revisada"}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function FlujoCaja() {
  const [periodo, setPeriodo] = useState(mesActual);
  const [cuentaId, setCuentaId] = useState("");
  const cuentas = useQuery({ queryKey: ["hu7", "cuentas"], queryFn: cajaBancosService.cuentas });
  const saldos = useQuery({ queryKey: ["hu7", "saldos", periodo, cuentaId], queryFn: () => cajaBancosService.saldos(periodo, cuentaId || undefined) });
  const resumen = useQuery({ queryKey: ["hu7", "resumen", periodo, cuentaId], queryFn: () => cajaBancosService.resumen(periodo, cuentaId || undefined) });
  const periodos = useMemo(() => Array.from({ length: 6 }, (_, i) => mesRelativo(periodo, i - 5)), [periodo]);
  const historico = useQuery({
    queryKey: ["hu7", "serie", periodos, cuentaId],
    queryFn: () => Promise.all(periodos.map(async (p) => {
      const r = await cajaBancosService.resumen(p, cuentaId || undefined);
      return { mes: p, ingresos: Number(r.totalIngresos), egresos: Number(r.totalEgresos) };
    })),
  });

  const s = saldos.data;
  const r = resumen.data;
  const totalEstado = [
    { name: "Conciliados", value: r?.conciliados.cantidad ?? 0 },
    { name: "Pendientes", value: r?.pendientes.cantidad ?? 0 },
    { name: "Diferencias", value: r?.conDiferencia.cantidad ?? 0 },
  ];
  const sinMovimientosHistoricos = historico.data?.every(x => x.ingresos === 0 && x.egresos === 0) ?? false;
  const errorConsulta = cuentas.error ?? saldos.error ?? resumen.error;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Flujo de caja y gráficos</h1>
          <p className="text-sm text-muted-foreground">Movimientos, saldos y conciliaciones reales de Caja y Bancos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/admin/finanzas/conciliacion">Conciliación</Link></Button>
          <Button variant="outline" asChild><Link href="/admin/finanzas/conciliacion/historial">Historial</Link></Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2 text-xs font-medium">
            <span>Período</span>
            <Input type="month" className="w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </label>
          <div className="space-y-2">
            <p className="text-xs font-medium">Cuenta o caja</p>
            <Select value={cuentaId || "todas"} onValueChange={(value) => setCuentaId(value === "todas" ? "" : value)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Todas las cuentas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuentas</SelectItem>
                {(cuentas.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            {s?.periodoCerrado ? <Badge variant="secondary">Período cerrado · Histórico</Badge> : <Badge variant="outline">Período abierto</Badge>}
          </div>
        </CardContent>
      </Card>

      {errorConsulta && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{mensajeError(errorConsulta)}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Saldos de caja y bancos">
        <Kpi titulo="Saldo registrado" valor={dinero(s?.totales.saldoRegistrado ?? null)} cargando={saldos.isLoading} icono={<Wallet className="size-4" />} />
        <Kpi titulo="Saldo conciliado" valor={dinero(s?.totales.saldoConciliado ?? null)} cargando={saldos.isLoading} icono={<CheckCircle2 className="size-4" />} />
        <Kpi titulo="Saldo real" valor={dinero(s?.totales.saldoReal ?? null)} cargando={saldos.isLoading} icono={<Landmark className="size-4" />} />
        <Kpi titulo="Diferencia" valor={dinero(s?.totales.diferencia ?? null)} cargando={saldos.isLoading} tono={s?.totales.diferencia != null && Number(s.totales.diferencia) !== 0 ? "negativo" : "normal"} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Flujo del período">
        <Kpi titulo="Ingresos del mes" valor={r ? dinero(r.totalIngresos) : "—"} cargando={resumen.isLoading} tono="positivo" icono={<ArrowUpCircle className="size-4" />} />
        <Kpi titulo="Egresos del mes" valor={r ? dinero(r.totalEgresos) : "—"} cargando={resumen.isLoading} tono="negativo" icono={<ArrowDownCircle className="size-4" />} />
        <Kpi titulo="Flujo neto del mes" valor={r ? dinero(r.balance) : "—"} cargando={resumen.isLoading} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ingresos y egresos de los últimos 6 meses</CardTitle>
            <CardDescription>.</CardDescription>
          </CardHeader>
          <CardContent>
            {historico.isError ? (
              <p role="alert" className="py-14 text-sm text-destructive">{mensajeError(historico.error)}</p>
            ) : historico.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : sinMovimientosHistoricos ? (
              <p className="py-14 text-center text-sm text-muted-foreground">No hay ingresos ni egresos registrados en los últimos 6 meses.</p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historico.data} margin={{ top: 10, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(value) => dinero(Number(value ?? 0))} />
                    <Legend />
                    <Bar dataKey="ingresos" name="Ingresos" fill={COLOR_INGRESO} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="egresos" name="Egresos" fill={COLOR_EGRESO} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de conciliaciones</CardTitle>
            <CardDescription>Movimientos del período seleccionado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resumen.isLoading ? <Skeleton className="h-48 w-full" /> : r && r.cantidad > 0 ? (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={totalEstado} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72}>
                      {totalEstado.map((x, i) => <Cell key={x.name} fill={[COLOR_INGRESO, COLOR_PENDIENTE, COLOR_EGRESO][i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin movimientos registrados</p>
            )}
            <div className="space-y-2">
              {totalEstado.map((x) => (
                <div className="flex items-center justify-between text-sm" key={x.name}>
                  <span>{x.name}</span><Badge variant="outline">{x.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Comparación por caja y cuenta</CardTitle>
          <CardDescription></CardDescription>
        </CardHeader>
        <CardContent>
          {saldos.isLoading ? <div className="grid gap-3 xl:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : s?.cuentas.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {s.cuentas.map((f) => <SaldoRealEditor key={`${periodo}-${f.cuenta.id}`} periodo={periodo} fila={f} cerrado={s.periodoCerrado} />)}
            </div>
          ) : <p className="text-sm text-muted-foreground">No hay cuentas con saldos en este período.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Diferencias y pendientes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Cuentas sin saldo real: <strong>{r?.cuentasSinSaldoReal.length ?? "—"}</strong>. Cuentas con diferencias: <strong>{r?.diferenciasDeSaldo.length ?? "—"}</strong>.</p>
          {r?.diferenciasDeSaldo.map((d) => (
            <p key={d.cuenta.id} className="text-xs text-muted-foreground">
              {d.cuenta.nombre}: {dinero(d.diferencia)} · {d.revisada ? "Revisada" : "Pendiente de revisión"}
            </p>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

export default function FlujoCajaPage() {
  const { usuario } = useSesionActual();
  if (usuario && normalizarRol(usuario.rol) === "CONSULTA") {
    return <p className="p-6 text-sm text-destructive">No tienes permisos para consultar conciliaciones de caja y bancos.</p>;
  }
  return <CajaBancosProvider><FlujoCaja /></CajaBancosProvider>;
}
