"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Info, Trees } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import {
  MENSAJE_HORARIO_NO_DISPONIBLE,
  MENSAJE_RESERVA_EXITOSA,
  areasComunesService,
  errorDeReserva,
  type ErrorReserva,
} from "@/services/areasComunes.service";
import type { AreaComun, DiaDisponibilidad, TurnoDisponibilidad } from "@/types/areasComunes";
import { formatCurrency } from "@/app/admin/morosidad/utils/morosidad";
import { CalendarioArea } from "./components/CalendarioArea";
import {
  CLASE_AYUDA,
  CLASE_LABEL,
  CLASE_TITULO_SECCION,
  NOMBRE_DIA,
  fechaLarga,
  fechaMaximaReserva,
  franja,
  hoyBolivia,
  horariosPorDia,
  limitesDelMes,
} from "./utils";

type Turno = { horaInicio: string; horaFin: string };

export default function AreasComunesPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeReservar = puedeEjecutar(rol, "areasComunes", "crear");

  const hoy = hoyBolivia();
  const fechaMaxima = fechaMaximaReserva(hoy);
  const mesMinimo = hoy.slice(0, 7);
  const mesMaximo = fechaMaxima.slice(0, 7);

  // Áreas (CA 1.1.1)
  const [areas, setAreas] = useState<AreaComun[]>([]);
  const [cargandoAreas, setCargandoAreas] = useState(true);
  const [errorAreas, setErrorAreas] = useState("");
  const [intRecargaAreas, setIntRecargaAreas] = useState(0);
  const [areaId, setAreaId] = useState<string | null>(null);

  // Calendario (CA 1.2.1 y 1.2.2)
  const [mes, setMes] = useState(mesMinimo);
  const [dias, setDias] = useState<DiaDisponibilidad[]>([]);
  const [cargandoDias, setCargandoDias] = useState(false);
  const [errorDias, setErrorDias] = useState("");
  const [intRecargaDias, setIntRecargaDias] = useState(0);

  // Selección y reserva (CA 2.1.x)
  const [fecha, setFecha] = useState<string | null>(null);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [bolConfirmando, setBolConfirmando] = useState(false);
  const [bolReservando, setBolReservando] = useState(false);
  const [errorReserva, setErrorReserva] = useState<ErrorReserva | null>(null);
  const [strAviso, setStrAviso] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strPermiso, setStrPermiso] = useState("");

  const area = areas.find((a) => a.id === areaId) ?? null;

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoAreas(true);
    setErrorAreas("");
    areasComunesService
      .listar(ctrl.signal)
      .then((lista) => {
        setAreas(lista);
        setAreaId((actual) => (actual && lista.some((a) => a.id === actual) ? actual : lista[0]?.id ?? null));
      })
      .catch((error) => !ctrl.signal.aborted && setErrorAreas(errorDeReserva(error, "No se pudieron cargar las áreas comunes.").mensaje))
      .finally(() => !ctrl.signal.aborted && setCargandoAreas(false));
    return () => ctrl.abort();
  }, [intRecargaAreas]);

  // Solo se consulta la parte del mes que se puede reservar (de hoy al límite de 60 días): siempre ≤ 31 días.
  const rango = useMemo(() => {
    const { inicio, fin } = limitesDelMes(mes);
    const desde = inicio < hoy ? hoy : inicio;
    const hasta = fin > fechaMaxima ? fechaMaxima : fin;
    return desde <= hasta ? { desde, hasta } : null;
  }, [mes, hoy, fechaMaxima]);

  useEffect(() => {
    if (!areaId || !rango) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDias([]);
      return;
    }
    const ctrl = new AbortController();
    setCargandoDias(true);
    setErrorDias("");
    areasComunesService
      .disponibilidad(areaId, rango.desde, rango.hasta, ctrl.signal)
      .then((r) => setDias(r.dias))
      .catch((error) => !ctrl.signal.aborted && setErrorDias(errorDeReserva(error, "No se pudo cargar el calendario.").mensaje))
      .finally(() => !ctrl.signal.aborted && setCargandoDias(false));
    return () => ctrl.abort();
  }, [areaId, rango, intRecargaDias]);

  // Si al recargar el calendario el turno elegido ya no está libre, se quita la selección y se avisa (CA 3.1.2).
  useEffect(() => {
    if (!fecha || !turno || cargandoDias) return;
    const actual = dias.find((d) => d.fecha === fecha)?.turnos.find((t) => t.horaInicio === turno.horaInicio && t.horaFin === turno.horaFin);
    if (actual && actual.estado !== "DISPONIBLE") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTurno(null);
      setStrAviso(MENSAJE_HORARIO_NO_DISPONIBLE);
    }
  }, [dias, fecha, turno, cargandoDias]);

  const limpiarMensajes = useCallback(() => {
    setFaltantes([]);
    setErrorReserva(null);
    setStrAviso("");
    setStrExito("");
  }, []);

  function elegirArea(id: string) {
    if (id === areaId) return;
    setAreaId(id);
    setFecha(null);
    setTurno(null);
    limpiarMensajes();
  }

  function elegirFecha(nueva: string) {
    setFecha(nueva);
    if (nueva !== fecha) setTurno(null);
    limpiarMensajes();
  }

  function elegirTurno(t: TurnoDisponibilidad) {
    setTurno({ horaInicio: t.horaInicio, horaFin: t.horaFin });
    limpiarMensajes();
  }

  function cambiarMes(nuevo: string) {
    setMes(nuevo);
    setFecha(null);
    setTurno(null);
    limpiarMensajes();
  }

  /** CA 4.2.1: no se confirma sin área, fecha y horario; se indica qué falta. */
  function pedirConfirmacion() {
    limpiarMensajes();
    const validacion = validarAccion(rol, "areasComunes", "crear");
    if (!validacion.permitido) {
      setStrPermiso(validacion.mensaje);
      return;
    }
    const falta = [!area && "el área común", !fecha && "la fecha", !turno && "el horario"].filter(Boolean) as string[];
    if (falta.length > 0) {
      setFaltantes(falta);
      return;
    }
    setBolConfirmando(true);
  }

  async function reservar() {
    if (!area || !fecha || !turno || bolReservando) return;
    setBolReservando(true);
    setErrorReserva(null);
    try {
      await areasComunesService.reservar(area.id, { fecha, ...turno });
      setBolConfirmando(false);
      setStrExito(MENSAJE_RESERVA_EXITOSA);
      setTurno(null);
      setIntRecargaDias((n) => n + 1); // el turno pasa a "Reservado" en el calendario
    } catch (error) {
      const e = errorDeReserva(error, "No se pudo registrar la reserva. Intenta de nuevo.");
      setErrorReserva(e);
      setBolConfirmando(false);
      if (e.codigo === "TURNO_NO_DISPONIBLE") {
        setTurno(null);
        setIntRecargaDias((n) => n + 1);
      }
    } finally {
      setBolReservando(false);
    }
  }

  if (!usuario) return <div className="px-4 py-6 sm:px-6"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Consulta los espacios del edificio, revisa su disponibilidad y reserva un horario. Puedes reservar desde hoy hasta el {fechaLarga(fechaMaxima).toLowerCase()}.
        </p>
        <Button asChild variant="outline">
          <Link href="/admin/areas-comunes/mis-reservas"><CalendarCheck className="h-4 w-4" /> Mis reservas</Link>
        </Button>
      </div>

      {strPermiso && <AlertaPermiso mensaje={strPermiso} />}

      {/* Áreas habilitadas (CA 1.1.1) */}
      <section aria-label="Áreas comunes">
        <h2 className={`${CLASE_TITULO_SECCION} mb-3`}>Áreas disponibles para reserva</h2>
        {errorAreas ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
            <span>{errorAreas}</span>
            <Button size="sm" variant="outline" onClick={() => setIntRecargaAreas((n) => n + 1)}>Reintentar</Button>
          </div>
        ) : cargandoAreas ? (
          <div className="grid gap-3 md:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : areas.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
            Por ahora no hay áreas comunes habilitadas para reserva.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Elige un área común" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((a) => {
              const activa = a.id === areaId;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => elegirArea(a.id)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    activa ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <Trees className={`mt-0.5 h-5 w-5 shrink-0 ${activa ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-foreground">{a.nombre}</span>
                    <span className={`${CLASE_AYUDA} mt-0.5 line-clamp-2 block`}>{a.descripcion || "Sin descripción."}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {area && (
        <>
          {/* Información del área (CA 1.1.2) */}
          <Card className="shadow-sm">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className={CLASE_TITULO_SECCION}>{area.nombre}</CardTitle>
              {area.descripcion && <p className="mt-1 text-[13px] text-muted-foreground">{area.descripcion}</p>}
            </CardHeader>
            <CardContent className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <p className={`${CLASE_LABEL} mb-2`}>Horarios de uso</p>
                {horariosPorDia(area.horarios).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Esta área todavía no tiene horarios configurados.</p>
                ) : (
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                    {horariosPorDia(area.horarios).map(({ dia, franjas }) => (
                      <div key={dia} className="contents">
                        <dt className="text-muted-foreground">{NOMBRE_DIA[dia]}</dt>
                        <dd className="tabular-nums text-foreground">{franjas.join(" · ")}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div>
                <p className={`${CLASE_LABEL} mb-2`}>Condiciones de reserva</p>
                <p className="whitespace-pre-line text-[13px] text-foreground">
                  {area.condiciones || "No hay condiciones especiales configuradas."}
                </p>
                <p className={`${CLASE_AYUDA} mt-3 flex gap-1.5`}>
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  Para reservar debes estar al día en tus pagos.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Calendario y horarios (CA 1.2.x, 2.1.1, 4.1.x) */}
          <Card className="shadow-sm">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className={CLASE_TITULO_SECCION}>Disponibilidad de {area.nombre}</CardTitle>
              <p className={`${CLASE_AYUDA} mt-1`}>Elige una fecha y luego un horario disponible.</p>
            </CardHeader>
            <CardContent className="p-5">
              <CalendarioArea
                mes={mes}
                mesMinimo={mesMinimo}
                mesMaximo={mesMaximo}
                onCambiarMes={cambiarMes}
                dias={dias}
                cargando={cargandoDias}
                error={errorDias}
                onReintentar={() => setIntRecargaDias((n) => n + 1)}
                fechaSeleccionada={fecha}
                onSeleccionarFecha={elegirFecha}
                turnoSeleccionado={turno}
                onSeleccionarTurno={elegirTurno}
                onTurnoNoElegible={(mensaje) => { limpiarMensajes(); setStrAviso(mensaje); }}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Resumen y confirmación (CA 2.1.2 y 4.2.1) */}
      {areas.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <dl className="grid flex-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Área común", valor: area?.nombre },
                { label: "Fecha", valor: fecha ? fechaLarga(fecha) : null },
                { label: "Horario", valor: turno ? franja(turno) : null },
              ].map((c) => (
                <div key={c.label}>
                  <dt className={CLASE_LABEL}>{c.label}</dt>
                  <dd className={`mt-1 text-[13px] ${c.valor ? "font-medium text-foreground" : "text-muted-foreground"}`}>{c.valor ?? "Sin seleccionar"}</dd>
                </div>
              ))}
            </dl>
            {bolPuedeReservar && (
              <Button size="lg" className="px-4 font-medium" onClick={pedirConfirmacion}>
                <CalendarCheck className="h-4 w-4" /> Confirmar reserva
              </Button>
            )}
          </CardContent>
          <div className="space-y-2 px-5 pb-5 empty:hidden">
            {faltantes.length > 0 && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                Para reservar falta seleccionar: {faltantes.join(", ")}.
              </p>
            )}
            {strAviso && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">{strAviso}</p>
            )}
            {errorReserva && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                <p>{errorReserva.mensaje}</p>
                {errorReserva.codigo === "NO_AL_DIA" && (
                  <p className="mt-1">
                    {errorReserva.deudaVencida && <>Deuda vencida: <span className="font-medium">{formatCurrency(Number(errorReserva.deudaVencida))}</span>. </>}
                    <Link href="/admin/mi-deuda" className="font-medium underline underline-offset-2">Ver mi deuda</Link>
                  </p>
                )}
              </div>
            )}
            {strExito && (
              <p role="status" className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">
                {strExito} <Link href="/admin/areas-comunes/mis-reservas" className="font-medium underline underline-offset-2">Ver mis reservas</Link>
              </p>
            )}
          </div>
        </Card>
      )}

      <Dialog open={bolConfirmando} onOpenChange={(abierto) => !abierto && !bolReservando && setBolConfirmando(false)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">Confirmar reserva</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              Revisa los datos antes de registrar la reserva.
            </DialogDescription>
          </DialogHeader>
          {area && fecha && turno && (
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 rounded-lg bg-muted/30 p-4 text-[13px]">
              <dt className="text-muted-foreground">Área común</dt><dd className="font-medium text-foreground">{area.nombre}</dd>
              <dt className="text-muted-foreground">Fecha</dt><dd className="font-medium text-foreground">{fechaLarga(fecha)}</dd>
              <dt className="text-muted-foreground">Horario</dt><dd className="font-medium tabular-nums text-foreground">{franja(turno)}</dd>
              <dt className="text-muted-foreground">A nombre de</dt><dd className="text-foreground">{usuario.nombre} {usuario.apellido}</dd>
            </dl>
          )}
          {area?.condiciones && <p className={CLASE_AYUDA}>Al reservar aceptas las condiciones de uso del área.</p>}
          <DialogFooter>
            <Button variant="outline" disabled={bolReservando} onClick={() => setBolConfirmando(false)}>Volver</Button>
            <Button cargando={bolReservando} onClick={() => void reservar()}>Reservar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
