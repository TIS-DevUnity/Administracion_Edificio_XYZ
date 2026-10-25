"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CajaBancosProvider } from "@/components/caja-bancos/CajaBancosProvider";
import { cajaBancosService } from "@/services/caja-bancos.service";
import { dinero, fechaLegible, mensajeError, mesActual } from "@/components/caja-bancos/format";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

const input = "w-full rounded-md border bg-background px-3 py-2 text-sm";
function HistorialCierres() {
  const { usuario } = useSesionActual();
  const administrador = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState(mesActual);
  const [pagina, setPagina] = useState(1);
  const [paginaEventos, setPaginaEventos] = useState(1);
  const [seleccion, setSeleccion] = useState("");
  const [observacion, setObservacion] = useState("");
  const [confirmar, setConfirmar] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState("");
  const preview = useQuery({ queryKey: ["hu7", "previa", periodo], queryFn: () => cajaBancosService.vistaPreviaCierre(periodo) });
  const cierres = useQuery({ queryKey: ["hu7", "cierres", pagina], queryFn: () => cajaBancosService.cierres(pagina, 10) });
  const eventos = useQuery({ queryKey: ["hu7", "eventos", periodo, paginaEventos], queryFn: () => cajaBancosService.eventos({ periodo, pagina: paginaEventos, porPagina: 10 }) });
  const detalle = useQuery({ queryKey: ["hu7", "cierre", seleccion], queryFn: () => cajaBancosService.detalleCierre(seleccion), enabled: Boolean(seleccion) });
  const cerrar = useMutation({
    mutationFn: () => cajaBancosService.cerrar(periodo, confirmar, observacion),
    onSuccess: async r => { setMensaje(r.mensaje); setConfirmar([]); setObservacion(""); await qc.invalidateQueries({ queryKey: ["hu7"] }); },
    onError: e => setMensaje(mensajeError(e)),
  });
  const p = preview.data;
  const cuentasConDiferencia = p?.cuentas.filter(c => c.requiereConfirmacion) ?? [];
  const listo = Boolean(administrador && p?.puedeCerrar && cuentasConDiferencia.every(c => confirmar.includes(c.cuenta.id)));
  return <main className="mx-auto max-w-7xl space-y-5 p-4 pb-12 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Cierre mensual e historial</h1><p className="text-sm text-muted-foreground">Revisión previa, cierres inalterables, responsables y resultados históricos.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/admin/finanzas/conciliacion">Conciliación</Link></Button><Button asChild variant="outline"><Link href="/admin/finanzas/flujo-caja">Gráficos</Link></Button></div></header>
    <section className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-end gap-3"><label className="text-xs">Período de revisión <input className={input} type="month" value={periodo} onChange={e => { setPeriodo(e.target.value); setConfirmar([]); setMensaje(""); setPaginaEventos(1); }}/></label><Button size="sm" variant="outline" onClick={() => preview.refetch()} disabled={preview.isFetching}>Actualizar validación</Button></div>
      {preview.isLoading && <p className="mt-3 text-sm">Validando período...</p>}
      {preview.isError && <p role="alert" className="mt-3 text-sm text-destructive">{mensajeError(preview.error)}</p>}
      {p && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-3 text-sm"><span className="rounded-md bg-muted px-3 py-2">Pendientes: {p.sinResolver.pendientes}</span><span className="rounded-md bg-muted px-3 py-2">Con diferencia: {p.sinResolver.conDiferencia}</span><span className="rounded-md bg-muted px-3 py-2">{p.mesTerminado ? "Mes terminado" : "Mes sin terminar"}</span></div>
        {p.bloqueos.length > 0 && <div role="alert" className="rounded-lg border border-amber-500/40 p-3"><p className="font-semibold">No se puede cerrar el período</p>{p.bloqueos.map((b,i) => <p className="mt-1 text-xs" key={`${b.codigo}-${i}`}>{b.mensaje} ({b.codigo})</p>)}</div>}
        {p.sinResolver.movimientos.length > 0 && <div><h2 className="font-medium">Movimientos por resolver</h2><div className="mt-2 max-h-48 overflow-auto rounded-lg border p-2">{p.sinResolver.movimientos.map(m => <p className="mb-1 text-xs" key={m.id}>{fechaLegible(m.fecha)} · {m.concepto} · {m.estado} · {dinero(m.monto)}</p>)}{p.sinResolver.hayMas && <p className="text-xs text-muted-foreground">Hay más movimientos; consulta el listado completo.</p>}</div></div>}
        {administrador && p.puedeCerrar && <div className="space-y-3 rounded-lg border p-3"><p className="font-medium">Confirmar cierre mensual</p><p className="text-xs text-muted-foreground">Los períodos cerrados son de solo lectura y no se pueden reabrir mediante este módulo.</p>
          {cuentasConDiferencia.length > 0 && <div className="space-y-2"><p className="text-xs font-medium">Confirmar expresamente las diferencias revisadas:</p>{cuentasConDiferencia.map(c => <label key={c.cuenta.id} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmar.includes(c.cuenta.id)} onChange={e => setConfirmar(v => e.target.checked ? [...v,c.cuenta.id] : v.filter(x => x !== c.cuenta.id))}/><span>{c.cuenta.nombre}: diferencia {dinero(c.diferencia)}. {c.observacion ?? ""}</span></label>)}</div>}
          <label className="block text-xs">Observación de cierre (opcional) <textarea className={input} maxLength={500} value={observacion} onChange={e => setObservacion(e.target.value)}/></label>
          <Button disabled={!listo || cerrar.isPending} onClick={() => { if (window.confirm(`¿Cerrar definitivamente el período ${periodo}? Esta acción no se puede deshacer.`)) cerrar.mutate(); }}>{cerrar.isPending ? "Cerrando..." : "Cerrar conciliación"}</Button>
        </div>}
        {administrador && !p.puedeCerrar && <p className="text-xs text-muted-foreground">Resuelve los bloqueos del backend antes de confirmar el cierre.</p>}
      </div>}
      {mensaje && <p role="status" className="mt-3 rounded-md bg-muted p-2 text-sm">{mensaje}</p>}
    </section>
    <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Períodos cerrados</h2>{cierres.isLoading ? <p className="mt-3 text-sm">Cargando...</p> : cierres.isError ? <p role="alert" className="mt-3 text-sm text-destructive">{mensajeError(cierres.error)}</p> : !cierres.data?.cierres.length ? <p className="mt-3 text-sm text-muted-foreground">Aún no existen cierres mensuales.</p> : <div className="mt-3 space-y-2">{cierres.data.cierres.map(c => <button type="button" key={c.id} onClick={() => setSeleccion(c.periodo)} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted ${seleccion === c.periodo ? "border-primary" : ""}`}><span><strong>{c.periodo}</strong> · {fechaLegible(c.cerradoEn)} · {c.cerradoPor ? `${c.cerradoPor.nombre ?? ""} ${c.cerradoPor.apellido ?? ""}` : "Sin responsable"}</span><span>{dinero(c.totales.saldoRegistrado)}</span></button>)}</div>}
      {cierres.data && cierres.data.paginacion.totalPaginas > 1 && <div className="mt-3 flex items-center gap-2"><Button size="sm" variant="outline" disabled={pagina===1} onClick={() => setPagina(p=>p-1)}>Anterior</Button><span className="text-xs">{pagina} / {cierres.data.paginacion.totalPaginas}</span><Button size="sm" variant="outline" disabled={pagina>=cierres.data.paginacion.totalPaginas} onClick={() => setPagina(p=>p+1)}>Siguiente</Button></div>}
      {seleccion && <div className="mt-4 rounded-lg border p-3"><h3 className="font-semibold">Resultado histórico: {seleccion}</h3>{detalle.isLoading ? <p className="text-sm">Cargando cierre...</p> : detalle.isError ? <p role="alert" className="text-sm text-destructive">{mensajeError(detalle.error)}</p> : detalle.data && <><p className="mt-2 text-xs">Saldo registrado: {dinero(detalle.data.totales.saldoRegistrado)} · Conciliado: {dinero(detalle.data.totales.saldoConciliado)} · Real: {dinero(detalle.data.totales.saldoReal)}</p><p className="mt-2 text-xs">Ingresos: {dinero(detalle.data.resumen.totalIngresos)} · Egresos: {dinero(detalle.data.resumen.totalEgresos)}</p>{detalle.data.cuentas.map(c => <p className="mt-2 text-xs" key={c.cuenta.id}>{c.cuenta.nombre}: registrado {dinero(c.saldoRegistrado)} / real {dinero(c.saldoReal)} / diferencia {dinero(c.diferencia)} {c.diferenciaConfirmada ? "(confirmada)" : ""}</p>)}</>}</div>}
    </section>
    <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Historial de conciliaciones — {periodo}</h2>{eventos.isLoading ? <p className="mt-3 text-sm">Cargando...</p> : eventos.isError ? <p role="alert" className="mt-3 text-sm text-destructive">{mensajeError(eventos.error)}</p> : !eventos.data?.eventos.length ? <p className="mt-3 text-sm text-muted-foreground">No hay eventos registrados en este período.</p> : <div className="mt-3 space-y-2">{eventos.data.eventos.map(e => <div key={e.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 text-xs"><span>{fechaLegible(e.fecha)} · <strong>{e.operacion}</strong> · {e.resultado} · {e.cuenta.nombre}</span><span>{e.usuario ? `${e.usuario.nombre ?? ""} ${e.usuario.apellido ?? ""}` : "Sin usuario"} {e.movimiento ? `· ${e.movimiento.concepto}` : ""}</span></div>)}</div>}
      {eventos.data && eventos.data.paginacion.totalPaginas > 1 && <div className="mt-3 flex items-center gap-2"><Button variant="outline" size="sm" disabled={paginaEventos===1} onClick={()=>setPaginaEventos(p=>p-1)}>Anterior</Button><span className="text-xs">{paginaEventos} / {eventos.data.paginacion.totalPaginas}</span><Button variant="outline" size="sm" disabled={paginaEventos>=eventos.data.paginacion.totalPaginas} onClick={()=>setPaginaEventos(p=>p+1)}>Siguiente</Button></div>}
    </section>
  </main>;
}
export default function HistorialPage() {
  const { usuario } = useSesionActual();
  if (usuario && normalizarRol(usuario.rol) === "CONSULTA") {
    return <p className="p-6 text-sm text-destructive">No tienes permisos para consultar conciliaciones de caja y bancos.</p>;
  }
  return <CajaBancosProvider><HistorialCierres/></CajaBancosProvider>;
}
