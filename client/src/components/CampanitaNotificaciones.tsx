"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Clock,
  Percent,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notificacionesService } from "@/services/notificaciones.service";
import type { DetalleNotificacionDTO, ListaNotificacionesDTO, TipoNotificacion } from "@/types/notificaciones";

const CLASE_AYUDA = "font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const INTERVALO_MS = 60_000;

const ICONO_TIPO: Record<TipoNotificacion, LucideIcon> = {
  PROXIMO_VENCIMIENTO: CalendarClock,
  PROXIMA_MORA: Clock,
  OBLIGACION_VENCIDA: AlertTriangle,
  MORA_APLICADA: Percent,
  DEUDA_CON_MORA: Wallet,
  PAGO_REGISTRADO: BadgeCheck,
};

const CLASE_ICONO_TIPO: Record<TipoNotificacion, string> = {
  PROXIMO_VENCIMIENTO: "bg-primary/15 text-primary",
  PROXIMA_MORA: "bg-accent-secondary/15 text-accent-secondary",
  OBLIGACION_VENCIDA: "bg-danger-subtle text-destructive",
  MORA_APLICADA: "bg-danger-subtle text-destructive",
  DEUDA_CON_MORA: "bg-danger-subtle text-destructive",
  PAGO_REGISTRADO: "bg-success-subtle text-success",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Pago parcial",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
};

function bs(valor: string | number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor));
}

function fechaCorta(iso: string) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/La_Paz",
  }).format(new Date(iso));
}

/** "2026-10-15" (fecha de calendario) → "15/10/2026", sin correr un día por la zona horaria. */
function fechaCalendario(strFecha: string) {
  const [anio, mes, dia] = strFecha.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

function mensajeDeError(error: unknown, strFallback: string) {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

/**
 * Campanita del encabezado (HU3 CA-15): avisos de vencimiento, mora y pagos de la persona vinculada
 * al usuario. Al elegir uno se ve el detalle de la obligación; el backend lo marca como leído.
 */
export function CampanitaNotificaciones() {
  const [bolAbierta, setBolAbierta] = useState(false);
  const [datos, setDatos] = useState<ListaNotificacionesDTO | null>(null);
  const [bolCargando, setBolCargando] = useState(false);
  const [strError, setStrError] = useState("");
  const [bolMarcando, setBolMarcando] = useState(false);
  const [detalle, setDetalle] = useState<DetalleNotificacionDTO | null>(null);
  const [strIdCargandoDetalle, setStrIdCargandoDetalle] = useState<string | null>(null);
  const [strErrorDetalle, setStrErrorDetalle] = useState("");
  const refContenedor = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    setBolCargando(true);
    try {
      setDatos(await notificacionesService.listar({ limite: 30 }));
      setStrError("");
    } catch (error) {
      setStrError(mensajeDeError(error, "No se pudieron cargar las notificaciones."));
    } finally {
      setBolCargando(false);
    }
  }, []);

  // Carga inicial y actualización periódica mientras la pestaña está visible.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, INTERVALO_MS);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  // Cerrar con clic afuera o Escape.
  useEffect(() => {
    if (!bolAbierta) return;
    function alClicAfuera(event: MouseEvent) {
      if (refContenedor.current && !refContenedor.current.contains(event.target as Node)) setBolAbierta(false);
    }
    function alTeclear(event: KeyboardEvent) {
      if (event.key === "Escape") setBolAbierta(false);
    }
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [bolAbierta]);

  async function abrirDetalle(strId: string) {
    setStrIdCargandoDetalle(strId);
    setStrErrorDetalle("");
    try {
      setDetalle(await notificacionesService.obtenerDetalle(strId));
      setBolAbierta(false);
      void cargar();
    } catch (error) {
      setStrErrorDetalle(mensajeDeError(error, "No se pudo abrir la notificación."));
    } finally {
      setStrIdCargandoDetalle(null);
    }
  }

  async function marcarTodas() {
    setBolMarcando(true);
    try {
      await notificacionesService.marcarTodasLeidas();
      await cargar();
    } catch (error) {
      setStrError(mensajeDeError(error, "No se pudieron marcar como leídas."));
    } finally {
      setBolMarcando(false);
    }
  }

  const intNoLeidas = datos?.noLeidas ?? 0;
  const notificaciones = datos?.notificaciones ?? [];
  const obligacion = detalle?.obligacion ?? null;

  return (
    <div ref={refContenedor} className="relative">
      <button
        type="button"
        onClick={() => {
          setBolAbierta((abierta) => !abierta);
          if (!bolAbierta) void cargar();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={intNoLeidas > 0 ? `Notificaciones: ${intNoLeidas} sin leer` : "Notificaciones"}
        aria-expanded={bolAbierta}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {intNoLeidas > 0 && (
          <span className="font-caption absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-primary-foreground">
            {intNoLeidas > 99 ? "99+" : intNoLeidas}
          </span>
        )}
      </button>

      {bolAbierta && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-subtitle text-[13px] font-semibold tracking-[-0.005em] text-foreground">Notificaciones</p>
            {intNoLeidas > 0 && (
              <Button size="xs" variant="ghost" cargando={bolMarcando} onClick={marcarTodas}>
                Marcar todas como leídas
              </Button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {strError && <p className="px-4 py-3 text-[13px] text-destructive">{strError}</p>}
            {strErrorDetalle && <p className="px-4 py-3 text-[13px] text-destructive">{strErrorDetalle}</p>}
            {!datos && bolCargando ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : datos?.mensaje ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{datos.mensaje}.</p>
            ) : notificaciones.length === 0 && !strError ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No tienes notificaciones.</p>
            ) : (
              <ul>
                {notificaciones.map((notif) => {
                  const Icono = ICONO_TIPO[notif.tipo] ?? CalendarClock;
                  return (
                    <li key={notif.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => abrirDetalle(notif.id)}
                        disabled={strIdCargandoDetalle !== null}
                        className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-wait ${notif.leida ? "" : "bg-primary/5"}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CLASE_ICONO_TIPO[notif.tipo] ?? "bg-muted text-muted-foreground"}`}>
                          <Icono className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`text-[13px] leading-[1.3] text-foreground ${notif.leida ? "" : "font-semibold"}`}>{notif.titulo}</span>
                            {!notif.leida && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[1.4] text-muted-foreground">{notif.mensaje}</span>
                          <span className={`${CLASE_AYUDA} mt-1 block`}>
                            {fechaCorta(notif.createdAt)}
                            {notif.monto !== null && <> · <span className="tabular-nums text-foreground">{bs(notif.monto)}</span></>}
                            {strIdCargandoDetalle === notif.id && " · Abriendo..."}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={detalle !== null} onOpenChange={(abierto) => !abierto && setDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              {detalle?.notificacion.titulo}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {detalle?.notificacion.mensaje}
            </DialogDescription>
          </DialogHeader>

          {obligacion ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className={CLASE_LABEL}>Inmueble</p>
                  <p className="mt-1 text-[13px] text-foreground">{obligacion.inmueble.codigo}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL}>Periodo</p>
                  <p className="mt-1 text-[13px] text-foreground">{obligacion.periodo}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL}>Vencimiento</p>
                  <p className="mt-1 text-[13px] text-foreground">{fechaCalendario(obligacion.fechaVencimiento)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL}>Estado</p>
                  <p className="mt-1 text-[13px] text-foreground">{ETIQUETA_ESTADO[obligacion.estado] ?? obligacion.estado}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-[13px] tabular-nums">
                <p className={CLASE_LABEL}>Detalle de la obligación</p>
                {obligacion.desglose.map((linea) => (
                  <div key={linea.concepto} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{linea.concepto}</span>
                    <span className="text-foreground">{bs(linea.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 border-t border-border pt-2">
                  <span className="font-medium text-foreground">Total expensa</span>
                  <span className="font-medium text-foreground">{bs(obligacion.montoTotal)}</span>
                </div>
                {obligacion.moras.map((mora) => (
                  <div key={mora.mes} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Mora {mora.mes} (sobre {bs(mora.base)})</span>
                    <span className="text-destructive">{bs(mora.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Pagado</span>
                  <span className="text-success">{bs(obligacion.pagado)}</span>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-2">
                  <span className="font-medium text-foreground">Saldo pendiente</span>
                  <span className={`font-title text-[18px] font-bold leading-[1.2] ${Number(obligacion.pendiente) > 0 ? "text-destructive" : "text-success"}`}>
                    {bs(obligacion.pendiente)}
                  </span>
                </div>
                {Number(obligacion.pendienteMora) > 0 && (
                  <p className={CLASE_AYUDA}>
                    De ese saldo, {bs(obligacion.pendienteExpensa)} son de la expensa y {bs(obligacion.pendienteMora)} de mora.
                  </p>
                )}
              </div>
            </div>
          ) : (
            detalle && <p className="text-[13px] text-muted-foreground">Este aviso no está asociado a una obligación.</p>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDetalle(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
