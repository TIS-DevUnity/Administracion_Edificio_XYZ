"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Printer, RefreshCw } from "lucide-react";
import { nominaService, mensajeErrorNomina } from "@/services/nomina.service";
import { descargarBlob, dinero, fechaCorta, imprimirBlob, periodoActualBolivia, tituloPeriodo } from "@/components/nomina/nomina-utils";
import { NominaNav } from "@/components/nomina/NominaNav";
import { CLASE_LABEL, ErrorNomina, CargandoNomina, IndicadorNomina, EstadoBadge } from "@/components/nomina/NominaUI";
import { ETIQUETA_METODO } from "@/components/personal/PersonalUI";
import type { MetodoPagoNomina } from "@/types/nomina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Colores definidos en client/CLAUDE.md; no se introducen tonos hexadecimales. */
const COLOR_PAGADO = "var(--success)";
const COLOR_PENDIENTE = "var(--primary)";
const COLOR_TEXTO = "var(--muted-foreground)";
const COLOR_BORDE = "var(--border)";

export default function PaginaReporteNomina() {
  const [periodo, setPeriodo] = useState(periodoActualBolivia);
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");
  const reporte = useQuery({ queryKey: ["hu8", "reporte", periodo], queryFn: () => nominaService.reporte(periodo), enabled: Boolean(periodo) });
  const r = reporte.data;
  const grafico = [{ nombre: "Pagado", monto: Number(r?.resumen.pagado ?? 0), fill: COLOR_PAGADO }, { nombre: "Pendiente", monto: Number(r?.resumen.pendiente ?? 0), fill: COLOR_PENDIENTE }];
  async function pdf(imprimir: boolean) {
    if (descargando || !periodo) return;
    setDescargando(true); setErrorPdf("");
    try {
      if (imprimir) await imprimirBlob(nominaService.reportePdf(periodo));
      else descargarBlob(await nominaService.reportePdf(periodo), `reporte-personal-${periodo}.pdf`);
    } catch (err) { setErrorPdf(mensajeErrorNomina(err)); }
    finally { setDescargando(false); }
  }
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-foreground sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1">
      <h2 className="font-subtitle text-[16px]">Reporte de gastos de personal</h2>
      <p className="font-body text-[13px] text-muted-foreground">HU8 · Historial y reportes mensuales con datos del backend.</p>
    </div><Badge variant="outline">{tituloPeriodo(periodo)}</Badge></header>
    <NominaNav />
    <Card><CardContent className="flex flex-wrap items-end gap-3">
      <label className="min-w-44 space-y-1"><span className={CLASE_LABEL}>Período del reporte</span><Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></label>
      <Button variant="outline" onClick={() => void reporte.refetch()}><RefreshCw className="h-4 w-4" />Actualizar</Button>
      <Button variant="outline" onClick={() => void pdf(false)} cargando={descargando} disabled={!r}><Download className="h-4 w-4" /> Exportar PDF</Button>
      <Button variant="outline" onClick={() => void pdf(true)} disabled={!r || descargando}><Printer className="h-4 w-4" /> Imprimir</Button>
    </CardContent></Card>
    {errorPdf && <ErrorNomina mensaje={errorPdf} />}
    {reporte.isPending ? <CargandoNomina /> : reporte.isError ? <ErrorNomina mensaje={mensajeErrorNomina(reporte.error)} reintentar={() => void reporte.refetch()} /> : r && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IndicadorNomina etiqueta="Costo salarial devengado" valor={dinero(r.resumen.costoDelPeriodo)} detalle="Base + bonos + horas extra − descuentos" />
        <IndicadorNomina etiqueta="Sueldo neto pagado" valor={dinero(r.resumen.pagado)} tono="positivo" detalle={`${r.resumen.cantidadPagadas} nómina(s) pagadas`} />
        <IndicadorNomina etiqueta="Sueldo neto pendiente" valor={dinero(r.resumen.pendiente)} tono="negativo" detalle={`${r.resumen.cantidadPendientes} nómina(s) pendientes`} />
        <IndicadorNomina etiqueta="Anticipos otorgados en el mes" valor={dinero(r.anticiposOtorgados.total)} detalle={`${r.anticiposOtorgados.cantidad} anticipo(s) registrado(s)`} />
      </div>
      {/* HU8 7.2: totales de bonos y descuentos registrados y total de egresos destinados al personal. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <IndicadorNomina etiqueta="Bonos y horas extra" valor={dinero(Number(r.totales.bonos) + Number(r.totales.horasExtra))} tono="positivo"
          detalle={`Bonos ${dinero(r.totales.bonos)} · Horas extra ${dinero(r.totales.horasExtra)}`} />
        <IndicadorNomina etiqueta="Descuentos registrados" valor={dinero(r.totales.descuentos)} tono="negativo" detalle="Faltas, permisos y otros conceptos" />
        <IndicadorNomina etiqueta="Total egresos de personal" valor={dinero(Number(r.resumen.pagado) + Number(r.anticiposOtorgados.total))}
          detalle="Sueldos pagados + anticipos entregados en el mes" />
      </div>
      <Card><CardHeader><CardTitle className="font-subtitle">Pagos del período</CardTitle></CardHeader>
        <CardContent><div className="h-64 w-full">
          {r.vacio ? <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">No hay nóminas registradas para este período.</div> :
            <ResponsiveContainer width="100%" height="100%"><BarChart data={grafico} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke={COLOR_BORDE} strokeDasharray="3 3" />
              <XAxis dataKey="nombre" tick={{ fill: COLOR_TEXTO, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLOR_TEXTO, fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(value) => dinero(Number(value ?? 0))} contentStyle={{ backgroundColor: "var(--card)", borderColor: COLOR_BORDE, color: "var(--foreground)", borderRadius: 8 }} />
              <Bar dataKey="monto" name="Monto" radius={[6, 6, 0, 0]} maxBarSize={100} fill={COLOR_PAGADO}>{grafico.map((item) => <Cell key={item.nombre} fill={item.fill} />)}</Bar>
            </BarChart></ResponsiveContainer>}
        </div><p className="font-caption mt-2 text-[11px] text-muted-foreground">Los anticipos otorgados se presentan por separado: no se suman nuevamente al costo salarial devengado.</p>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="font-subtitle">Detalle de gastos por empleado</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow>
          <TableHead className={CLASE_LABEL}>Empleado</TableHead><TableHead className={CLASE_LABEL}>Sueldo base</TableHead><TableHead className={CLASE_LABEL}>Bonos</TableHead><TableHead className={CLASE_LABEL}>Horas extra</TableHead>
          <TableHead className={CLASE_LABEL}>Descuentos</TableHead><TableHead className={CLASE_LABEL}>Anticipos descontados</TableHead><TableHead className={CLASE_LABEL}>Sueldo neto</TableHead><TableHead className={CLASE_LABEL}>Estado</TableHead>
        </TableRow></TableHeader><TableBody>
          {r.filas.map((f) => <TableRow key={f.nominaId}>
            <TableCell><p className="font-medium">{f.empleado}</p><p className="font-caption text-[11px] text-muted-foreground">{f.cargo}</p></TableCell>
            <TableCell>{dinero(f.sueldoBase)}</TableCell><TableCell>{dinero(f.bonos)}</TableCell><TableCell>{dinero(f.horasExtra)}</TableCell>
            <TableCell>{dinero(f.descuentos)}</TableCell><TableCell>{dinero(f.anticipos)}</TableCell><TableCell className="font-medium">{dinero(f.sueldoNeto)}</TableCell><TableCell><EstadoBadge estado={f.estado} /></TableCell>
          </TableRow>)}
          {r.filas.length > 0 && <TableRow className="border-t-2 border-border font-medium">
            <TableCell className={CLASE_LABEL}>Totales</TableCell>
            <TableCell>{dinero(r.totales.sueldoBase)}</TableCell><TableCell>{dinero(r.totales.bonos)}</TableCell><TableCell>{dinero(r.totales.horasExtra)}</TableCell>
            <TableCell>{dinero(r.totales.descuentos)}</TableCell><TableCell>{dinero(r.totales.anticipos)}</TableCell><TableCell>{dinero(r.totales.sueldoNeto)}</TableCell><TableCell />
          </TableRow>}
        </TableBody></Table>
        {!r.filas.length && <p className="py-10 text-center text-[13px] text-muted-foreground">No hay empleados con nómina en este período.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="font-subtitle">Anticipos otorgados durante el período</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead className={CLASE_LABEL}>Empleado</TableHead><TableHead className={CLASE_LABEL}>Fecha</TableHead><TableHead className={CLASE_LABEL}>Método</TableHead><TableHead className={CLASE_LABEL}>Monto</TableHead><TableHead className={CLASE_LABEL}>Estado</TableHead></TableRow></TableHeader>
          <TableBody>{r.anticiposOtorgados.items.map((a) => <TableRow key={a.anticipoId}>
            <TableCell>{a.empleado}</TableCell><TableCell>{fechaCorta(a.fecha)}</TableCell><TableCell>{ETIQUETA_METODO[a.metodoPago as MetodoPagoNomina] ?? a.metodoPago}</TableCell><TableCell>{dinero(a.monto)}</TableCell><TableCell>{a.estadoEtiqueta}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {!r.anticiposOtorgados.items.length && <p className="py-8 text-center text-[13px] text-muted-foreground">No hay anticipos otorgados en este mes.</p>}
      </CardContent></Card>
    </>}
  </main>;
}
