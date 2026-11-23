"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listarInmuebles } from "@/lib/inmuebles";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import type { SaldoInmuebleDTO, SituacionCuenta } from "@/types/cuentaInmueble";
import { formatCurrency, obtenerMensajeError } from "@/app/admin/morosidad/utils/morosidad";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_CIFRA = "font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";
const CLASE_TITULO = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";

const SITUACION: Record<SituacionCuenta, { etiqueta: string; clase: string }> = {
  DEBE: { etiqueta: "Con deuda", clase: "bg-danger-subtle text-destructive" },
  AL_DIA: { etiqueta: "Al día", clase: "bg-success-subtle text-success" },
  A_FAVOR: { etiqueta: "Saldo a favor", clase: "bg-accent-secondary/15 text-accent-secondary" },
};

function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) return periodo;
  const texto = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Portal del copropietario (HU14): su deuda por departamento. GET /inmuebles ya devuelve a CONSULTA solo sus
 * inmuebles, y /financiero/inmuebles/:id/saldo solo responde por los suyos (soloSuInmueble).
 */
export default function MiDeudaPage() {
  const [cuentas, setCuentas] = useState<SaldoInmuebleDTO[]>([]);
  const [cargando, setCargando] = useState(true);
  const [strError, setStrError] = useState("");
  const [intRecarga, setIntRecarga] = useState(0);

  useEffect(() => {
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setStrError("");
    (async () => {
      try {
        const inmuebles = await listarInmuebles();
        // Las expensas se generan por departamento (su parqueo y baulera van incluidos en ellas).
        const deptos = inmuebles.filter((i) => i.clase === "DEPARTAMENTO");
        const saldos = await Promise.all((deptos.length > 0 ? deptos : inmuebles).map((i) => cuentaInmuebleService.obtenerSaldo(i.id)));
        if (activo) setCuentas(saldos.sort((a, b) => a.inmueble.codigo.localeCompare(b.inmueble.codigo, "es", { numeric: true })));
      } catch (error) {
        if (activo) setStrError(obtenerMensajeError(error, "No se pudo cargar tu deuda. Intenta de nuevo en unos minutos."));
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [intRecarga]);

  const totalDeuda = cuentas.reduce((acc, c) => acc + Number(c.deudaPendiente), 0);
  const totalFavor = cuentas.reduce((acc, c) => acc + Number(c.saldoFavor), 0);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Lo que debes por cada departamento a tu cargo, con la mora aplicada. Para reservar áreas comunes debes estar al día.
        </p>
        <Button variant="outline" size="sm" cargando={cargando} onClick={() => setIntRecarga((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {strError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
          <span>{strError}</span>
          <Button size="sm" variant="outline" onClick={() => setIntRecarga((n) => n + 1)}>Reintentar</Button>
        </div>
      ) : cargando ? (
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-48 sm:col-span-2" /></div>
      ) : cuentas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-10 text-center text-[13px] text-muted-foreground">
          No tienes departamentos a tu cargo registrados. Si crees que es un error, comunícate con la administración.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <p className={CLASE_LABEL}>Deuda pendiente</p>
                <p className={`${CLASE_CIFRA} ${totalDeuda > 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(totalDeuda)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <p className={CLASE_LABEL}>Saldo a favor</p>
                <p className={`${CLASE_CIFRA} text-accent-secondary`}>{formatCurrency(totalFavor)}</p>
              </CardContent>
            </Card>
          </div>

          {cuentas.map((c) => {
            const sit = SITUACION[c.situacion];
            return (
              <Card key={c.inmueble.id} className="shadow-sm">
                <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className={CLASE_TITULO}>Departamento {c.inmueble.codigo}</CardTitle>
                    <Badge className={`font-caption text-[11px] ${sit.clase}`}>{sit.etiqueta}</Badge>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/inmuebles/${c.inmueble.id}/estado-cuenta`}><FileText className="h-4 w-4" /> Ver estado de cuenta</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap gap-6 text-[13px]">
                    <p>Debe: <span className={`font-medium tabular-nums ${Number(c.deudaPendiente) > 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(Number(c.deudaPendiente))}</span></p>
                    <p>Saldo a favor: <span className="font-medium tabular-nums text-foreground">{formatCurrency(Number(c.saldoFavor))}</span></p>
                  </div>
                  {c.expensasPendientes.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No tienes expensas pendientes en este departamento.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {c.expensasPendientes.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                          <span>
                            Expensa de {etiquetaPeriodo(e.periodo)}
                            {e.estado === "VENCIDA" && <Badge className="font-caption ml-2 bg-danger-subtle text-[10px] text-destructive">Vencida</Badge>}
                          </span>
                          <span className="text-right tabular-nums">
                            <span className="font-medium text-foreground">{formatCurrency(Number(e.pendiente))}</span>
                            {Number(e.pendienteMora ?? 0) > 0 && (
                              <span className="font-caption block text-[11px] text-muted-foreground">
                                {formatCurrency(Number(e.pendienteExpensa ?? 0))} + <span className="text-destructive">mora {formatCurrency(Number(e.pendienteMora))}</span>
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
