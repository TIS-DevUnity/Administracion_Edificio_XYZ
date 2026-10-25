"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { CajaBancosProvider } from "@/components/caja-bancos/CajaBancosProvider";
import { dinero, fechaLegible, mensajeError, mesActual } from "@/components/caja-bancos/format";
import { cajaBancosService } from "@/services/caja-bancos.service";
import type { EstadoMovimientoCaja, MovimientoCaja, TipoMovimientoCaja } from "@/types/caja-bancos";
import DetalleConciliacion from "./components/DetalleConciliacion";
import { Button } from "@/components/ui/button";

const input = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";
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
  const params = useMemo(() => ({ periodo, cuentaId: cuentaId || undefined, tipo: (tipo || undefined) as TipoMovimientoCaja | undefined, estado: (estado || undefined) as EstadoMovimientoCaja | undefined, medio: medio || undefined, pagina, porPagina: 10 }), [periodo, cuentaId, tipo, estado, medio, pagina]);
  const cuentas = useQuery({ queryKey: ["hu7", "cuentas"], queryFn: cajaBancosService.cuentas });
  const consulta = useQuery({ queryKey: ["hu7", "movimientos", params], queryFn: () => cajaBancosService.movimientos(params) });
  const r = consulta.data;
  const filtro = (fn: () => void) => { fn(); setPagina(1); };
  return <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Conciliación de caja y bancos</h1><p className="text-sm text-muted-foreground">Consulta, verifica y concilia movimientos del edificio.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/finanzas/flujo-caja">Flujo de caja</Link></Button><Button asChild variant="outline"><Link href="/admin/finanzas/conciliacion/historial">Cierres e historial</Link></Button></div></header>
    <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros de movimientos">
      <label className="text-xs">Período <input className={input} type="month" value={periodo} onChange={e => filtro(() => setPeriodo(e.target.value))}/></label>
      <label className="text-xs">Cuenta o caja <select className={input} value={cuentaId} onChange={e => filtro(() => setCuentaId(e.target.value))}><option value="">Todas</option>{(cuentas.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label className="text-xs">Tipo <select className={input} value={tipo} onChange={e => filtro(() => setTipo(e.target.value))}><option value="">Todos</option><option value="INGRESO">Ingresos</option><option value="EGRESO">Egresos</option></select></label>
      <label className="text-xs">Estado <select className={input} value={estado} onChange={e => filtro(() => setEstado(e.target.value))}><option value="">Todos</option><option value="PENDIENTE">Pendientes</option><option value="CON_DIFERENCIA">Con diferencia</option><option value="CONCILIADO">Conciliados</option></select></label>
      <label className="text-xs">Medio <select className={input} value={medio} onChange={e => filtro(() => setMedio(e.target.value))}><option value="">Todos</option><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Banco / transferencia</option></select></label>
    </section>
    {cuentas.isError && <p role="alert" className="text-sm text-destructive">No fue posible cargar las cuentas: {mensajeError(cuentas.error)}</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Ingresos", r?.resumen.ingresos, "dinero"], ["Egresos", r?.resumen.egresos, "dinero"], ["Balance del filtro", r?.resumen.balance, "dinero"],
        ["Pendientes", r?.resumen.porEstado.PENDIENTE.cantidad, "numero"], ["Con diferencia", r?.resumen.porEstado.CON_DIFERENCIA.cantidad, "numero"],
      ].map(([titulo, valor, modo]) => <div key={String(titulo)} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{titulo}</p><p className="mt-2 text-xl font-semibold">{r ? (modo === "dinero" ? dinero(valor as string) : String(valor)) : "—"}</p></div>)}
    </section>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Movimientos del período</h2><Button variant="outline" size="sm" disabled={consulta.isFetching} onClick={() => consulta.refetch()}>Actualizar</Button></div>
      {consulta.isLoading ? <p className="p-5 text-sm">Cargando movimientos...</p> : consulta.isError ? <p role="alert" className="p-5 text-sm text-destructive">{mensajeError(consulta.error)}</p> : !r?.movimientos.length ? <p className="p-5 text-sm text-muted-foreground">.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-sm"><thead className="bg-muted/50 text-xs"><tr>{["Fecha", "Concepto", "Medio y cuenta", "Tipo", "Importe", "Estado", "Acción"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{r.movimientos.map(m => <tr key={m.id} className="border-t"><td className="whitespace-nowrap px-3 py-3">{fechaLegible(m.fecha)}</td><td className="max-w-56 px-3 py-3"><p className="font-medium">{m.concepto}</p><p className="text-xs text-muted-foreground">{m.referencia ?? m.origen}</p></td><td className="px-3 py-3">{m.cuenta.nombre}<p className="text-xs text-muted-foreground">{m.medio === "EFECTIVO" ? "Efectivo" : "Banco / transferencia"}</p></td><td className="px-3 py-3">{m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</td><td className={`whitespace-nowrap px-3 py-3 font-medium ${m.tipo === "INGRESO" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{m.tipo === "INGRESO" ? "+" : "−"} {dinero(m.monto)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${m.estado === "CONCILIADO" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : m.estado === "CON_DIFERENCIA" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{m.estadoEtiqueta ?? m.estado}</span></td><td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => setSeleccion(m)}>{administrador && m.estado !== "CONCILIADO" && !m.bloqueado ? "Revisar" : "Ver detalle"}</Button></td></tr>)}</tbody></table></div>}
      {r && r.paginacion.total > 0 && <div className="flex items-center justify-between gap-2 border-t p-3 text-sm"><span>{r.paginacion.total} movimientos · página {r.paginacion.pagina} de {Math.max(1,r.paginacion.totalPaginas)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p-1)}>Anterior</Button><Button variant="outline" size="sm" disabled={pagina >= r.paginacion.totalPaginas} onClick={() => setPagina(p => p+1)}>Siguiente</Button></div></div>}
    </section>
    <DetalleConciliacion movimiento={seleccion} onClose={() => setSeleccion(null)} administrador={administrador}/>
  </main>;
}
export default function ConciliacionPage() {
  const { usuario } = useSesionActual();
  if (usuario && normalizarRol(usuario.rol) === "CONSULTA") {
    return <p className="p-6 text-sm text-destructive">No tienes permisos para consultar conciliaciones de caja y bancos.</p>;
  }
  return <CajaBancosProvider><VistaConciliacion/></CajaBancosProvider>;
}
