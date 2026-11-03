"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronsRight, FlaskConical, LogOut, RotateCcw, Trash2 } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizarRol, puedeEjecutar } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import { leerEstado, modificarEstado, RUTA_SIMULACION } from "@/lib/simulacion/almacen";
import { capturarDatos } from "@/lib/simulacion/captura";
import { eliminarUltimoPeriodo, ErrorSimulacion, moverFecha, sumarDias, sumarMeses, ultimoPeriodo } from "@/lib/simulacion/motor";
import { formatearFecha, formatearFechaCalendario, obtenerMensajeError } from "../utils/morosidad";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

const SECCIONES = [
  { href: RUTA_SIMULACION, label: "Expensas y mora" },
  { href: `${RUTA_SIMULACION}/pagos`, label: "Pagos" },
  { href: `${RUTA_SIMULACION}/anticipados`, label: "Pagos anticipados" },
];

type Borrado = "MES" | "TODO";

/**
 * Entorno de simulación de Morosidad y Expensas. Las pantallas de abajo son las reales; esta barra
 * maneja la fecha simulada y los datos de prueba, que solo existen en este navegador.
 */
export default function LayoutSimulacion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { usuario } = useSesionActual();
  const bolPuedeUsar = Boolean(usuario) && puedeEjecutar(normalizarRol(usuario?.rol ?? "CONSULTA"), "morosidad", "editar");

  const [bolListo, setBolListo] = useState(false);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  // Al cambiar la fecha o los datos se vuelven a montar las pantallas, como si se abrieran en ese día.
  const [intVersion, setIntVersion] = useState(0);
  const [strFechaElegida, setStrFechaElegida] = useState("");
  const [strResultado, setStrResultado] = useState("");
  const [strError, setStrError] = useState("");
  const [borrado, setBorrado] = useState<Borrado | null>(null);
  const [bolProcesando, setBolProcesando] = useState(false);

  async function cargar(bolReiniciar = false) {
    setBolListo(false);
    setStrErrorCarga("");
    try {
      if (bolReiniciar || !leerEstado()) await capturarDatos();
      setStrFechaElegida(leerEstado()?.fecha ?? "");
      setIntVersion((version) => version + 1);
      setBolListo(true);
    } catch (error) {
      setStrErrorCarga(obtenerMensajeError(error, "No se pudieron leer los inmuebles y propietarios del sistema."));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (bolPuedeUsar) void cargar();
  }, [bolPuedeUsar]);

  function irAFecha(strFecha: string) {
    setStrError("");
    setStrResultado("");
    setBolProcesando(true);
    // Se deja pintar el estado "procesando" antes de un cálculo que puede recorrer muchos días.
    setTimeout(() => {
      try {
        const resumen = modificarEstado((estado) => moverFecha(estado, strFecha));
        setStrFechaElegida(strFecha);
        setIntVersion((version) => version + 1);
        setStrResultado(
          `Fecha cambiada al ${formatearFechaCalendario(strFecha)}. ` +
            (resumen.expensasGeneradas > 0
              ? `Se generaron ${resumen.expensasGeneradas} expensas (${resumen.periodos.join(", ")}). `
              : "No correspondía generar expensas. ") +
            (resumen.expensasConMora > 0 ? `Se aplicó mora ${resumen.expensasConMora} veces.` : "No se aplicó mora nueva.")
        );
      } catch (error) {
        setStrFechaElegida(leerEstado()?.fecha ?? "");
        setStrError(error instanceof ErrorSimulacion ? error.message : "No se pudo cambiar la fecha.");
      } finally {
        setBolProcesando(false);
      }
    }, 0);
  }

  async function confirmarBorrado() {
    setStrError("");
    setStrResultado("");
    setBolProcesando(true);
    try {
      if (borrado === "MES") {
        const { periodo, eliminadas } = modificarEstado(eliminarUltimoPeriodo);
        setIntVersion((version) => version + 1);
        setStrResultado(`Se eliminaron ${eliminadas} expensas de ${periodo}. Ya puedes volver a generarlas.`);
      } else {
        await cargar(true);
        setStrResultado("Se eliminaron todos los datos de la simulación y se volvieron a leer los inmuebles y propietarios.");
      }
    } catch (error) {
      setStrError(error instanceof ErrorSimulacion ? error.message : obtenerMensajeError(error, "No se pudieron eliminar los datos."));
    } finally {
      setBorrado(null);
      setBolProcesando(false);
    }
  }

  if (!usuario) return <div className="px-4 py-6 sm:px-6"><Skeleton className="h-32 w-full" /></div>;
  if (!bolPuedeUsar) {
    return <div className="px-4 py-6 sm:px-6"><AlertaPermiso mensaje="El entorno de simulación está disponible solo para Administración." /></div>;
  }

  const estado = bolListo ? leerEstado() : null;
  const strUltimoPeriodo = estado ? ultimoPeriodo(estado) : null;

  return (
    <>
      <div className="mx-4 mt-6 space-y-3 rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-4 sm:mx-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-accent-secondary" />
            <div>
              <h2 className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">Entorno de simulación</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
                Todo lo que hagas aquí es de prueba: no cambia nada del sistema real, no se envían correos y los datos quedan solo en este navegador.
              </p>
              {estado && (
                <p className={`${CLASE_AYUDA} mt-1`}>
                  {estado.inmuebles.length} inmuebles y {estado.ocupantes.length} asignaciones leídos del sistema el {formatearFecha(estado.capturadoEn)}.
                </p>
              )}
            </div>
          </div>
          <Button asChild variant="outline" className="w-full lg:w-auto">
            <Link href="/admin/morosidad"><LogOut className="h-4 w-4" /> Salir de la simulación</Link>
          </Button>
        </div>

        {strErrorCarga && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
            <span>{strErrorCarga}</span>
            <Button size="sm" variant="outline" onClick={() => void cargar()}>Reintentar</Button>
          </div>
        )}

        {estado && (
          <>
            <div className="flex flex-col gap-3 border-t border-accent-secondary/20 pt-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex flex-col gap-1">
                  <label htmlFor="fecha-simulada" className={CLASE_LABEL}>Fecha simulada</label>
                  <Input
                    id="fecha-simulada"
                    type="date"
                    className="h-8 w-full cursor-pointer bg-card sm:w-[160px]"
                    value={strFechaElegida}
                    disabled={bolProcesando}
                    onClick={(event) => {
                      try {
                        event.currentTarget.showPicker?.();
                      } catch {
                        // Sin showPicker queda el ícono del campo.
                      }
                    }}
                    onChange={(event) => setStrFechaElegida(event.target.value)}
                  />
                </div>
                <Button
                  className="bg-accent-secondary text-white hover:bg-accent-secondary/80"
                  cargando={bolProcesando}
                  disabled={!strFechaElegida || strFechaElegida === estado.fecha}
                  onClick={() => irAFecha(strFechaElegida)}
                >
                  <CalendarDays className="h-4 w-4" /> Aplicar fecha
                </Button>
                <Button variant="outline" disabled={bolProcesando} onClick={() => irAFecha(sumarDias(estado.fecha, 1))}>
                  <ChevronsRight className="h-4 w-4" /> 1 día
                </Button>
                <Button variant="outline" disabled={bolProcesando} onClick={() => irAFecha(sumarMeses(estado.fecha, 1))}>
                  <ChevronsRight className="h-4 w-4" /> 1 mes
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" disabled={bolProcesando || !strUltimoPeriodo} onClick={() => setBorrado("MES")}>
                  <Trash2 className="h-4 w-4" /> {strUltimoPeriodo ? `Eliminar expensas de ${strUltimoPeriodo}` : "Eliminar expensas del mes"}
                </Button>
                <Button variant="destructive" disabled={bolProcesando} onClick={() => setBorrado("TODO")}>
                  <RotateCcw className="h-4 w-4" /> Eliminar todo y reiniciar
                </Button>
              </div>
            </div>

            <p className={CLASE_AYUDA}>
              Al avanzar la fecha se repite, día por día, lo que hace el proceso automático real: genera las expensas del mes y aplica la mora que corresponda.
            </p>

            {strResultado && <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strResultado}</p>}
            {strError && <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">{strError}</p>}

            <nav aria-label="Secciones de la simulación" className="flex flex-wrap gap-2">
              {SECCIONES.map(({ href, label }) => {
                const bolActiva = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={bolActiva ? "page" : undefined}
                    className={`font-body rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${bolActiva ? "border-accent-secondary bg-accent-secondary text-white" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {bolListo ? <Fragment key={intVersion}>{children}</Fragment> : !strErrorCarga && (
        <div className="space-y-3 px-4 py-6 sm:px-6">
          <p className={CLASE_AYUDA}>Leyendo inmuebles y propietarios del sistema...</p>
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      <Dialog open={borrado !== null} onOpenChange={(abierto) => !abierto && !bolProcesando && setBorrado(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>{borrado === "MES" ? `Eliminar expensas de ${strUltimoPeriodo}` : "Eliminar todos los datos"}</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {borrado === "MES"
                ? "Se borran las expensas de ese mes con sus pagos, mora y agua. El saldo a favor que usaron se devuelve. Solo afecta a la simulación."
                : "Se borran las expensas, pagos, mora y cambios de configuración de la simulación, la fecha vuelve a hoy y se leen de nuevo los inmuebles y propietarios. Solo afecta a la simulación."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={bolProcesando} onClick={() => setBorrado(null)}>Cancelar</Button>
            <Button variant="destructive" cargando={bolProcesando} onClick={() => void confirmarBorrado()}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
