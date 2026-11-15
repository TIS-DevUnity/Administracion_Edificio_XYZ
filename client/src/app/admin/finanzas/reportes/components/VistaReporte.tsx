"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BalanceGeneral, BloqueBalance, FlujoCaja, ListadoMorosos, ReporteFinanciero } from "@/types/reportes";
import {
  CLASE_AYUDA,
  CLASE_CIFRA,
  CLASE_HEADER_TABLA,
  CLASE_LABEL,
  CLASE_TITULO_SECCION,
  bs,
  etiquetaPeriodo,
  fechaCal,
  fechaHora,
  type AvisosReporte,
} from "../utils";

const ROL: Record<string, string> = { ADMINISTRADOR: "Administrador", DIRECTORIO: "Directorio", CONSULTA: "Consulta" };

/** Encabezado común: título, tipo, rango aplicado, fecha y hora de generación y usuario generador. */
function Encabezado({ reporte }: { reporte: ReporteFinanciero }) {
  const strRango =
    reporte.tipoReporte === "BALANCE_GENERAL"
      ? `Al ${fechaCal(reporte.fechaCorte)} (fecha de emisión)`
      : `Del ${fechaCal(reporte.rango.desde)} al ${fechaCal(reporte.rango.hasta)}`;
  const strFiltro =
    reporte.tipoReporte === "FLUJO_CAJA"
      ? `Movimientos: ${reporte.tipo === "Ingreso" ? "solo ingresos" : reporte.tipo === "Gasto" ? "solo egresos" : "ingresos y egresos"}`
      : reporte.tipoReporte === "MOROSOS"
        ? `Orden: ${reporte.orden === "antiguedad" ? "mayor antigüedad primero" : "mayor monto primero"}`
        : null;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p className={CLASE_LABEL}>Edificio XYZ · Reporte financiero</p>
        <h2 className="font-subtitle mt-1 text-[16px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">{reporte.titulo}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{strRango}</p>
        {strFiltro && <p className={`${CLASE_AYUDA} mt-0.5`}>{strFiltro}</p>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] md:text-right">
        <dt className="text-muted-foreground">Generado</dt>
        <dd className="tabular-nums text-foreground">{fechaHora(reporte.generadoEn)}</dd>
        <dt className="text-muted-foreground">Por</dt>
        <dd className="text-foreground">
          {reporte.generadoPor ? `${reporte.generadoPor.nombre} (${ROL[reporte.generadoPor.rol] ?? reporte.generadoPor.rol})` : "Usuario no identificado"}
        </dd>
      </dl>
    </div>
  );
}

function Avisos({ avisos }: { avisos: AvisosReporte }) {
  if (avisos.inconsistencias.length === 0 && avisos.incompletos.length === 0) return null;
  return (
    <div className="space-y-2 px-5 pt-4">
      {avisos.inconsistencias.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Los datos de este reporte no son consistentes; no se puede exportar.</p>
            <ul className="mt-1 list-disc pl-4">{avisos.inconsistencias.map((a) => <li key={a}>{a}</li>)}</ul>
            <p className="mt-1">Vuelve a generarlo y, si se repite, avisa al equipo de backend.</p>
          </div>
        </div>
      )}
      {avisos.incompletos.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-disc pl-4">{avisos.incompletos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Verificacion({ ok, texto }: { ok: boolean | null; texto: string }) {
  return (
    <Badge
      variant="outline"
      className={`font-caption gap-1 text-[11px] ${ok === false ? "border-destructive/30 text-destructive" : ok ? "border-success/30 text-success" : "text-muted-foreground"}`}
    >
      {ok === false ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {texto}
    </Badge>
  );
}

function Vacio({ mensaje }: { mensaje: string }) {
  return <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">{mensaje}</p>;
}

// ───────── Balance general ─────────
function TablaBloque({ titulo, bloque, claseTotal }: { titulo: string; bloque: BloqueBalance; claseTotal: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3 className={`${CLASE_TITULO_SECCION} border-b border-border bg-muted/30 px-4 py-2.5`}>{titulo}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={CLASE_HEADER_TABLA}>Concepto</TableHead>
            <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Cantidad</TableHead>
            <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bloque.grupos.map((grupo) => (
            <Fragment key={grupo.nombre}>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="pt-3 text-[12px] font-medium text-muted-foreground">{grupo.nombre}</TableCell>
              </TableRow>
              {grupo.lineas.map((linea) => (
                <TableRow key={linea.concepto}>
                  <TableCell className="whitespace-normal pl-6 text-[13px]">{linea.concepto}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums text-muted-foreground">{linea.cantidad ?? "—"}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">{bs(linea.monto)}</TableCell>
                </TableRow>
              ))}
              {bloque.grupos.length > 1 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={2} className="pl-6 text-[12px] text-muted-foreground">Subtotal {grupo.nombre.toLowerCase()}</TableCell>
                  <TableCell className="text-right text-[13px] font-medium tabular-nums">{bs(grupo.subtotal)}</TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-[13px] font-semibold">Total {titulo.toLowerCase()}</TableCell>
            <TableCell className={`text-right text-[14px] font-semibold tabular-nums ${claseTotal}`}>{bs(bloque.total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

function VistaBalance({ r }: { r: BalanceGeneral }) {
  const patrimonioNegativo = Number(r.patrimonio.total) < 0;
  return (
    <div className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total activos", valor: r.activos.total, clase: "text-foreground" },
          { label: "Total pasivos", valor: r.pasivos.total, clase: "text-foreground" },
          { label: "Patrimonio", valor: r.patrimonio.total, clase: patrimonioNegativo ? "text-destructive" : "text-success" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-4">
            <p className={CLASE_LABEL}>{c.label}</p>
            <p className={`${CLASE_CIFRA} mt-1 ${c.clase}`}>{bs(c.valor)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Verificacion
          ok={r.verificacion.coincide}
          texto={`Activos ${bs(r.verificacion.activos)} ${r.verificacion.coincide ? "=" : "≠"} pasivos + patrimonio ${bs(r.verificacion.pasivosMasPatrimonio)}`}
        />
      </div>
      <TablaBloque titulo="Activos" bloque={r.activos} claseTotal="text-foreground" />
      <TablaBloque titulo="Pasivos" bloque={r.pasivos} claseTotal="text-foreground" />
      <TablaBloque titulo="Patrimonio" bloque={r.patrimonio} claseTotal={patrimonioNegativo ? "text-destructive" : "text-success"} />
      <p className={CLASE_AYUDA}>{r.nota}.</p>
    </div>
  );
}

// ───────── Flujo de caja ─────────
function FilaMonto({ concepto, cantidad, monto, sangria = false, fuerte = false, clase = "" }: {
  concepto: string; cantidad?: number | null; monto: string; sangria?: boolean; fuerte?: boolean; clase?: string;
}) {
  return (
    <TableRow className={fuerte ? "hover:bg-transparent" : undefined}>
      <TableCell className={`whitespace-normal text-[13px] ${sangria ? "pl-6" : ""} ${fuerte ? "font-medium" : ""}`}>{concepto}</TableCell>
      <TableCell className="text-right text-[13px] tabular-nums text-muted-foreground">{cantidad ?? "—"}</TableCell>
      <TableCell className={`text-right text-[13px] tabular-nums ${fuerte ? "font-medium" : ""} ${clase}`}>{bs(monto)}</TableCell>
    </TableRow>
  );
}

function CabeceraConceptos() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className={CLASE_HEADER_TABLA}>Concepto</TableHead>
        <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Movimientos</TableHead>
        <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function VistaFlujo({ r }: { r: FlujoCaja }) {
  const etiquetaFiltro = r.tipo === "Ingreso" ? "ingresos" : r.tipo === "Gasto" ? "egresos" : null;
  return (
    <div className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: `Saldo inicial (al ${fechaCal(r.saldoInicialAl)})`, valor: r.saldoInicial, clase: "text-foreground" },
          { label: "Total ingresos", valor: r.totalIngresos, clase: "text-success" },
          { label: "Total egresos", valor: r.totalEgresos, clase: "text-destructive" },
          { label: `Saldo final (al ${fechaCal(r.rango.hasta)})`, valor: r.saldoFinal, clase: Number(r.saldoFinal) < 0 ? "text-destructive" : "text-foreground" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-4">
            <p className={CLASE_LABEL}>{c.label}</p>
            <p className={`${CLASE_CIFRA} mt-1 ${c.clase}`}>{bs(c.valor)}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Verificacion ok={true} texto={`${bs(r.saldoInicial)} + ${bs(r.totalIngresos)} − ${bs(r.totalEgresos)} = ${bs(r.saldoFinal)}`} />
        <Verificacion
          ok={r.verificacion.coincide}
          texto={
            r.verificacion.coincide === null
              ? "Sin comparar con el saldo del edificio"
              : r.verificacion.coincide
                ? "Coincide con el saldo del edificio"
                : `No coincide con el saldo del edificio (${bs(r.verificacion.saldoEdificio)})`
          }
        />
      </div>

      {r.vacio && <Vacio mensaje={`${r.mensaje ?? "No hay movimientos en el rango de fechas indicado"}.`} />}

      {!r.vacio && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-lg border border-border">
            <h3 className={`${CLASE_TITULO_SECCION} border-b border-border bg-muted/30 px-4 py-2.5`}>Ingresos</h3>
            <Table>
              <CabeceraConceptos />
              <TableBody>
                <FilaMonto concepto="Pagos de expensas" cantidad={r.ingresos.expensas.cantidad} monto={r.ingresos.expensas.total} />
                <FilaMonto concepto="Otros conceptos" monto={r.ingresos.totalOtros} fuerte />
                {r.ingresos.otros.map((o) => <FilaMonto key={o.categoria} concepto={o.categoria} cantidad={o.cantidad} monto={o.total} sangria />)}
                {r.ingresos.otros.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="pl-6 text-[12px] text-muted-foreground">Sin ingresos por otros conceptos.</TableCell></TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-[13px] font-semibold">Total ingresos</TableCell>
                  <TableCell className="text-right text-[14px] font-semibold tabular-nums text-success">{bs(r.ingresos.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </section>

          <section className="overflow-hidden rounded-lg border border-border">
            <h3 className={`${CLASE_TITULO_SECCION} border-b border-border bg-muted/30 px-4 py-2.5`}>Egresos</h3>
            <Table>
              <CabeceraConceptos />
              <TableBody>
                <FilaMonto concepto="Por categoría" monto={String(Number(r.egresos.total) - Number(r.egresos.personal.total))} fuerte />
                {r.egresos.porCategoria.map((c) => <FilaMonto key={c.categoria} concepto={c.categoria} cantidad={c.cantidad} monto={c.total} sangria />)}
                {r.egresos.porCategoria.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="pl-6 text-[12px] text-muted-foreground">Sin gastos por categoría.</TableCell></TableRow>
                )}
                <FilaMonto concepto="Personal" monto={r.egresos.personal.total} fuerte />
                <FilaMonto concepto="Sueldos pagados" cantidad={r.egresos.personal.sueldos.cantidad} monto={r.egresos.personal.sueldos.total} sangria />
                <FilaMonto concepto="Anticipos salariales" cantidad={r.egresos.personal.anticipos.cantidad} monto={r.egresos.personal.anticipos.total} sangria />
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-[13px] font-semibold">Total egresos</TableCell>
                  <TableCell className="text-right text-[14px] font-semibold tabular-nums text-destructive">{bs(r.egresos.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </section>
        </div>
      )}

      {!r.vacio && (
        <section className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <h3 className={CLASE_TITULO_SECCION}>Movimientos</h3>
            <p className={CLASE_AYUDA}>
              {r.movimientos.length} {etiquetaFiltro ? `${etiquetaFiltro} (filtro aplicado; los totales incluyen todo)` : "movimientos"}, del más antiguo al más reciente
            </p>
          </div>
          {r.movimientos.length === 0 ? (
            <Vacio mensaje={`No hay ${etiquetaFiltro ?? "movimientos"} en el rango de fechas indicado.`} />
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <Table className="min-w-[680px]">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className={CLASE_HEADER_TABLA}>Fecha</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Tipo</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Concepto</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Categoría</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.movimientos.map((m, i) => (
                    <TableRow key={`${m.fecha}-${i}`}>
                      <TableCell className="text-[13px] tabular-nums">{fechaCal(m.fecha)}</TableCell>
                      <TableCell className="text-[13px]">{m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</TableCell>
                      <TableCell className="whitespace-normal text-[13px]">{m.concepto}</TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{m.categoria}</TableCell>
                      <TableCell className={`text-right text-[13px] tabular-nums ${m.tipo === "INGRESO" ? "text-success" : "text-destructive"}`}>
                        {m.tipo === "INGRESO" ? "+" : "−"} {bs(m.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ───────── Listado de morosos ─────────
function periodoDeuda(desde: string, hasta: string) {
  return desde === hasta ? etiquetaPeriodo(desde) : `${etiquetaPeriodo(desde)} a ${etiquetaPeriodo(hasta)}`;
}

function VistaMorosos({ r }: { r: ListadoMorosos }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  if (r.vacio) return <Vacio mensaje={`${r.mensaje ?? "No hay inmuebles morosos en el rango de fechas indicado"}.`} />;

  return (
    <div className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Inmuebles morosos", valor: String(r.totales.inmuebles), clase: "text-accent-secondary", detalle: `${r.totales.expensas} expensas vencidas` },
          { label: "Monto pendiente", valor: bs(r.totales.montoPendiente), clase: "text-foreground", detalle: "Ya descontados los pagos parciales" },
          { label: "Interés por mora", valor: bs(r.totales.interesMora), clase: "text-destructive", detalle: "Solo la mora ya aplicada" },
          { label: "Total acumulado", valor: bs(r.totales.totalAcumulado), clase: "text-destructive", detalle: "Monto pendiente + mora" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-4">
            <p className={CLASE_LABEL}>{c.label}</p>
            <p className={`${CLASE_CIFRA} mt-1 ${c.clase}`}>{c.valor}</p>
            <p className={`${CLASE_AYUDA} mt-1`}>{c.detalle}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className={CLASE_HEADER_TABLA}>Inmueble</TableHead>
              <TableHead className={CLASE_HEADER_TABLA}>Responsable de pago</TableHead>
              <TableHead className={CLASE_HEADER_TABLA}>Periodo de deuda</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Días de mora</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto pendiente</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Interés por mora</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.filas.map((f) => {
              const abierta = abiertas.has(f.inmuebleId);
              return (
                <Fragment key={f.inmuebleId}>
                  <TableRow>
                    <TableCell className="py-2">
                      <Button type="button" variant="ghost" size="icon-xs" aria-expanded={abierta}
                        aria-label={`${abierta ? "Ocultar" : "Ver"} expensas de ${f.inmueble}`} onClick={() => alternar(f.inmuebleId)}>
                        {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-[13px] font-medium">{f.inmueble}</TableCell>
                    <TableCell className="text-[13px]">{f.responsable ?? <span className="text-muted-foreground">Sin responsable registrado</span>}</TableCell>
                    <TableCell className="text-[13px]">
                      {periodoDeuda(f.periodoDeuda.desde, f.periodoDeuda.hasta)}
                      <span className={`${CLASE_AYUDA} block`}>{f.cantidadExpensas} expensa{f.cantidadExpensas === 1 ? "" : "s"}</span>
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">{f.diasMora}</TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">{bs(f.montoPendiente)}</TableCell>
                    <TableCell className={`text-right text-[13px] tabular-nums ${Number(f.interesMora) > 0 ? "text-destructive" : "text-muted-foreground"}`}>{bs(f.interesMora)}</TableCell>
                    <TableCell className="text-right text-[13px] font-medium tabular-nums">{bs(f.totalAcumulado)}</TableCell>
                  </TableRow>
                  {abierta && f.expensas.map((e) => (
                    <TableRow key={e.expensaId} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell />
                      <TableCell className="text-[12px] text-muted-foreground" colSpan={2}>Expensa {etiquetaPeriodo(e.periodo)} · vence {fechaCal(e.fechaVencimiento)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{e.responsable ?? "—"}</TableCell>
                      <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{e.diasMora}</TableCell>
                      <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{bs(e.montoPendiente)}</TableCell>
                      <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{bs(e.interesMora)}</TableCell>
                      <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">{bs(e.total)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell colSpan={4} className="text-[13px] font-semibold">Total ({r.totales.inmuebles} inmuebles, {r.totales.expensas} expensas)</TableCell>
              <TableCell className="text-right text-[13px] font-semibold tabular-nums">{bs(r.totales.montoPendiente)}</TableCell>
              <TableCell className="text-right text-[13px] font-semibold tabular-nums text-destructive">{bs(r.totales.interesMora)}</TableCell>
              <TableCell className="text-right text-[14px] font-semibold tabular-nums text-destructive">{bs(r.totales.totalAcumulado)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className={CLASE_AYUDA}>
        Entran las expensas que vencieron dentro del rango, siguen impagas y no están en un plan de pagos. Los días de mora son los de la expensa más antigua de cada inmueble.
      </p>
    </div>
  );
}

export function VistaReporte({ reporte, avisos }: { reporte: ReporteFinanciero; avisos: AvisosReporte }) {
  return (
    <>
      <Encabezado reporte={reporte} />
      <Avisos avisos={avisos} />
      {reporte.tipoReporte === "BALANCE_GENERAL" && <VistaBalance r={reporte} />}
      {reporte.tipoReporte === "FLUJO_CAJA" && <VistaFlujo r={reporte} />}
      {reporte.tipoReporte === "MOROSOS" && <VistaMorosos r={reporte} />}
    </>
  );
}
