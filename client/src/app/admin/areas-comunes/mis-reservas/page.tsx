"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, RefreshCw, XCircle } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import { areasComunesService, errorDeReserva } from "@/services/areasComunes.service";
import type { EstadoReserva, ReservaArea } from "@/types/areasComunes";
import { CLASE_HEADER_TABLA, CLASE_LABEL, estadoReservaVisible, fechaCorta, fechaLarga, franja, hoyBolivia } from "../utils";

type Filtro = EstadoReserva | "TODAS";

/** CA 2.2.2: estado visible de la reserva (Reservado, Cancelado o Finalizado si ya pasó). */
function Estado({ r, hoy }: { r: ReservaArea; hoy: string }) {
  const e = estadoReservaVisible(r, hoy);
  return <Badge className={`font-caption text-[11px] ${e.clase}`}>{e.etiqueta}</Badge>;
}

export default function MisReservasPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeCancelar = puedeEjecutar(rol, "misReservas", "eliminar");
  const hoy = hoyBolivia();

  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [reservas, setReservas] = useState<ReservaArea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [strError, setStrError] = useState("");
  const [intRecarga, setIntRecarga] = useState(0);
  const [aCancelar, setACancelar] = useState<ReservaArea | null>(null);
  const [bolCancelando, setBolCancelando] = useState(false);
  const [strErrorCancelar, setStrErrorCancelar] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strPermiso, setStrPermiso] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setStrError("");
    areasComunesService
      .misReservas(filtro === "TODAS" ? undefined : filtro, ctrl.signal)
      .then(setReservas)
      .catch((error) => !ctrl.signal.aborted && setStrError(errorDeReserva(error, "No se pudieron cargar tus reservas.").mensaje))
      .finally(() => !ctrl.signal.aborted && setCargando(false));
    return () => ctrl.abort();
  }, [filtro, intRecarga]);

  // Solo se cancela una reserva vigente que todavía no pasó (el backend rechaza el turno ya iniciado).
  const cancelable = (r: ReservaArea) => bolPuedeCancelar && r.estado === "RESERVADA" && r.fecha >= hoy;

  function pedirCancelacion(r: ReservaArea) {
    const validacion = validarAccion(rol, "misReservas", "eliminar");
    if (!validacion.permitido) {
      setStrPermiso(validacion.mensaje);
      return;
    }
    setStrErrorCancelar("");
    setStrExito("");
    setACancelar(r);
  }

  async function cancelar() {
    if (!aCancelar || bolCancelando) return;
    setBolCancelando(true);
    setStrErrorCancelar("");
    try {
      await areasComunesService.cancelar(aCancelar.id);
      setStrExito(`Se canceló tu reserva de ${aCancelar.area?.nombre ?? "el área"} del ${fechaCorta(aCancelar.fecha)}.`);
      setACancelar(null);
      setIntRecarga((n) => n + 1);
    } catch (error) {
      setStrErrorCancelar(errorDeReserva(error, "No se pudo cancelar la reserva. Intenta de nuevo.").mensaje);
    } finally {
      setBolCancelando(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Tus reservas de áreas comunes: primero las próximas y después las pasadas.
        </p>
        <Button asChild>
          <Link href="/admin/areas-comunes"><CalendarPlus className="h-4 w-4" /> Nueva reserva</Link>
        </Button>
      </div>

      {strPermiso && <AlertaPermiso mensaje={strPermiso} />}
      {strExito && <p role="status" className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strExito}</p>}

      <Card className="shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <span className={CLASE_LABEL}>Estado</span>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="RESERVADA">Reservadas</SelectItem>
                <SelectItem value="CANCELADA">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" cargando={cargando} onClick={() => setIntRecarga((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>

        <CardContent className="p-0">
          {strError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-destructive">
              <span>{strError}</span>
              <Button size="sm" variant="outline" onClick={() => setIntRecarga((n) => n + 1)}>Reintentar</Button>
            </div>
          ) : cargando && reservas.length === 0 ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : reservas.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              {filtro === "TODAS" ? "Todavía no tienes reservas." : filtro === "RESERVADA" ? "No tienes reservas vigentes." : "No tienes reservas canceladas."}
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Área común</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Fecha</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Horario</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservas.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-[13px] font-medium">{r.area?.nombre ?? "—"}</TableCell>
                        <TableCell className="text-[13px]">{fechaLarga(r.fecha)}</TableCell>
                        <TableCell className="text-[13px] tabular-nums">{franja(r)}</TableCell>
                        <TableCell>
                          <Estado r={r} hoy={hoy} />
                          {r.estado === "CANCELADA" && r.motivoCancelacion && (
                            <span className="font-caption mt-1 block text-[11px] text-muted-foreground">{r.motivoCancelacion}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {cancelable(r) && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => pedirCancelacion(r)}>
                              <XCircle className="h-4 w-4" /> Cancelar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="flex flex-col divide-y divide-border md:hidden">
                {reservas.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-medium text-foreground">{r.area?.nombre ?? "—"}</p>
                      <Estado r={r} hoy={hoy} />
                    </div>
                    <p className="text-[13px] text-muted-foreground">{fechaLarga(r.fecha)} · <span className="tabular-nums">{franja(r)}</span></p>
                    {cancelable(r) && (
                      <Button variant="outline" size="sm" className="self-start text-destructive" onClick={() => pedirCancelacion(r)}>
                        <XCircle className="h-4 w-4" /> Cancelar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={aCancelar !== null} onOpenChange={(abierto) => !abierto && !bolCancelando && setACancelar(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">Cancelar reserva</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {aCancelar && `${aCancelar.area?.nombre ?? "Área común"}, ${fechaLarga(aCancelar.fecha)}, de ${franja(aCancelar)}. El horario quedará libre para otros copropietarios.`}
            </DialogDescription>
          </DialogHeader>
          {strErrorCancelar && <p role="alert" className="text-[13px] text-destructive">{strErrorCancelar}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={bolCancelando} onClick={() => setACancelar(null)}>Volver</Button>
            <Button variant="destructive" cargando={bolCancelando} onClick={() => void cancelar()}>Cancelar reserva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
