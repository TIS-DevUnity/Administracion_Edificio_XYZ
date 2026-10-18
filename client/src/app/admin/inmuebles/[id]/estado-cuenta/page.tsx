"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import { CalendarRange, Download, FileText, Printer, RefreshCw } from "lucide-react";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { BadgeTipoInmueble } from "@/components/BadgeTipoInmueble";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSesionActual } from "@/lib/session";
import { MENSAJE_SOLO_ADMIN_ESTADO_CUENTA, normalizarRol, puedeEmitirEstadoCuenta } from "@/lib/permissions";
import { Inmueble, obtenerInmueble } from "@/lib/inmuebles";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import {
  EstadoCuentaDTO,
  FiltroPeriodoCuenta,
  MovimientoLibro,
  SaldoInstantanea,
  TipoMovimientoLibro,
} from "@/types/cuentaInmueble";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
const CLASE_CIFRA = "font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";
const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";

function claseCampo(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

const ETIQUETA_TIPO: Record<TipoMovimientoLibro, string> = {
  EXPENSA: "Expensa",
  MORA: "Mora",
  PAGO: "Pago",
  APLICACION_SALDO: "Uso de saldo a favor",
  SALDO_A_FAVOR: "Saldo a favor",
};

const CLASE_BADGE_TIPO: Record<TipoMovimientoLibro, string> = {
  EXPENSA: "bg-muted text-muted-foreground",
  MORA: "bg-danger-subtle text-destructive",
  PAGO: "bg-success-subtle text-success",
  APLICACION_SALDO: "bg-accent-secondary/10 text-accent-secondary",
  SALDO_A_FAVOR: "bg-accent-secondary/10 text-accent-secondary",
};

function bs(valor: string | number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor));
}

/** "2026-10-05" → "05/10/2026" sin pasar por Date (son días de calendario, no instantes). */
function fecha(strIso: string) {
  const [strAnio, strMes, strDia] = strIso.slice(0, 10).split("-");
  return `${strDia}/${strMes}/${strAnio}`;
}

function mesActualBolivia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit" }).format(new Date());
}

/** Los errores de una petición con responseType "blob" llegan como Blob: se lee el JSON de adentro. */
async function mensajeDeError(error: unknown, strFallback: string): Promise<string> {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return MENSAJE_SOLO_ADMIN_ESTADO_CUENTA;
    let data: unknown = error.response?.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = null;
      }
    }
    const strMensaje = (data as { error?: string } | null)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

function SaldoTexto({ saldo, bolGrande = false }: { saldo: SaldoInstantanea; bolGrande?: boolean }) {
  const strClase = bolGrande ? CLASE_CIFRA : "text-[13px] font-medium tabular-nums";
  if (saldo.situacion === "DEBE") {
    return <span className={`${strClase} text-destructive`}>{bs(saldo.saldoAdeudado)}</span>;
  }
  if (saldo.situacion === "A_FAVOR") {
    return <span className={`${strClase} text-accent-secondary`}>A favor {bs(saldo.saldoAFavorRestante)}</span>;
  }
  return <span className={`${strClase} text-success`}>{bs(0)}</span>;
}

/** Detalle bajo la descripción de cada movimiento (desglose, cálculo de mora, método, obligación). */
function DetalleMovimiento({ mov }: { mov: MovimientoLibro }) {
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {mov.tipo === "EXPENSA" && mov.desglose && (
        <>
          {mov.desglose.map((linea) => (
            <div key={linea.concepto} className={`${CLASE_AYUDA} flex justify-between gap-4`}>
              <span>{linea.concepto}</span>
              <span className="tabular-nums">{bs(linea.monto)}</span>
            </div>
          ))}
          <div className={`${CLASE_AYUDA} flex justify-between gap-4 border-t border-border pt-0.5 font-medium text-foreground`}>
            <span>Total expensa</span>
            <span className="tabular-nums">{bs(mov.cargo)}</span>
          </div>
        </>
      )}

      {mov.tipo === "MORA" && mov.detalle && (
        <p className={CLASE_AYUDA}>
          {mov.detalle.tipoValor === "PORCENTAJE"
            ? `${Number(mov.detalle.valor)}% sobre ${bs(mov.detalle.base)}`
            : `Monto fijo ${bs(mov.detalle.valor)}`}{" "}
          · periodo relacionado {mov.periodo}
        </p>
      )}

      {(mov.tipo === "PAGO" || mov.tipo === "APLICACION_SALDO" || mov.tipo === "SALDO_A_FAVOR") && (
        <p className={CLASE_AYUDA}>
          {[
            mov.metodoEtiqueta,
            mov.folio && `Recibo ${mov.folio}`,
            mov.referencia,
            mov.tipo === "PAGO" &&
              mov.detalle &&
              `a mora ${bs(mov.detalle.aMora)} · a expensa ${bs(mov.detalle.aExpensa)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {mov.obligacion && (
        <p className={CLASE_AYUDA}>
          Obligación {mov.obligacion.periodo}: importe original {bs(mov.obligacion.importeOriginal)} (más moras) ·
          pagado {bs(mov.obligacion.pagadoHastaAqui)} ·{" "}
          {Number(mov.obligacion.saldoPendiente) > 0 ? (
            <span className="text-destructive">pendiente {bs(mov.obligacion.saldoPendiente)}</span>
          ) : (
            <span className="text-success">cancelada</span>
          )}
        </p>
      )}

      {mov.aplicadoDeSaldoAFavor && (
        <p className={CLASE_AYUDA}>
          Se cubrió con {bs(mov.aplicadoDeSaldoAFavor)} del saldo a favor: baja la deuda y el saldo a favor por igual.
        </p>
      )}
    </div>
  );
}

export default function EstadoCuentaInmueblePage() {
  const params = useParams<{ id: string }>();
  const strId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeEmitir = puedeEmitirEstadoCuenta(rol);

  const [inmueble, setInmueble] = useState<Inmueble | null>(null);
  const [strErrorInmueble, setStrErrorInmueble] = useState("");
  const [bolCargandoInmueble, setBolCargandoInmueble] = useState(true);

  const [strModo, setStrModo] = useState<"MES" | "RANGO">("MES");
  const [strMes, setStrMes] = useState(mesActualBolivia());
  const [strDesde, setStrDesde] = useState("");
  const [strHasta, setStrHasta] = useState("");
  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strErrorPeriodo, setStrErrorPeriodo] = useState("");

  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuentaDTO | null>(null);
  const [filtroGenerado, setFiltroGenerado] = useState<FiltroPeriodoCuenta | null>(null);
  const [bolGenerando, setBolGenerando] = useState(false);
  const [strErrorReporte, setStrErrorReporte] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  const [strUrlVistaPrevia, setStrUrlVistaPrevia] = useState<string | null>(null);
  const [bolPreparandoVista, setBolPreparandoVista] = useState(false);
  const [bolDescargando, setBolDescargando] = useState(false);
  const [strErrorDocumento, setStrErrorDocumento] = useState("");
  const refIframe = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!strId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStrErrorInmueble("Selecciona un inmueble válido para emitir su estado de cuenta.");
      setBolCargandoInmueble(false);
      return;
    }
    let bolCancelado = false;
    obtenerInmueble(strId)
      .then((resultado) => !bolCancelado && setInmueble(resultado))
      .catch(
        () =>
          !bolCancelado &&
          setStrErrorInmueble("El inmueble no existe o no se pudo identificar. Selecciona un inmueble válido.")
      )
      .finally(() => !bolCancelado && setBolCargandoInmueble(false));
    return () => {
      bolCancelado = true;
    };
  }, [strId]);

  useEffect(() => {
    return () => {
      if (strUrlVistaPrevia) URL.revokeObjectURL(strUrlVistaPrevia);
    };
  }, [strUrlVistaPrevia]);

  function limpiarError(strCampo: string) {
    setStrErrorPeriodo("");
    setCamposError((prev) => {
      const next = new Set(prev);
      next.delete(strCampo);
      return next;
    });
  }

  /** Valida el formulario y devuelve el filtro, o null si hay algo que corregir. */
  function construirFiltro(): FiltroPeriodoCuenta | null {
    if (strModo === "MES") {
      if (!strMes) {
        setCamposError(new Set(["mes"]));
        setStrErrorPeriodo("Selecciona el mes a consultar.");
        return null;
      }
      return { mes: strMes };
    }

    const faltantes = new Set<string>();
    if (!strDesde) faltantes.add("desde");
    if (!strHasta) faltantes.add("hasta");
    if (faltantes.size > 0) {
      setCamposError(faltantes);
      setStrErrorPeriodo("Completa la fecha de inicio y la fecha de fin del rango.");
      return null;
    }
    if (strDesde > strHasta) {
      setCamposError(new Set(["desde", "hasta"]));
      setStrErrorPeriodo("El rango de fechas no es válido: la fecha de inicio es posterior a la fecha de fin.");
      return null;
    }
    return { desde: strDesde, hasta: strHasta };
  }

  async function handleGenerar(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!bolPuedeEmitir) {
      setStrMensajePermiso(MENSAJE_SOLO_ADMIN_ESTADO_CUENTA);
      return;
    }
    if (!inmueble) {
      setStrErrorReporte("Selecciona un inmueble válido para emitir su estado de cuenta.");
      return;
    }

    const filtro = construirFiltro();
    if (!filtro) return;

    setCamposError(new Set());
    setStrErrorPeriodo("");
    setStrErrorReporte("");
    setBolGenerando(true);
    // Si falla, no se deja a la vista un reporte anterior como si fuera el del nuevo periodo.
    setEstadoCuenta(null);

    try {
      const resultado = await cuentaInmuebleService.obtenerEstadoCuenta(inmueble.id, filtro);
      setEstadoCuenta(resultado);
      setFiltroGenerado(filtro);
    } catch (error: unknown) {
      setFiltroGenerado(null);
      const strMensaje = await mensajeDeError(error, "No se pudo generar el estado de cuenta. Intenta nuevamente.");
      if (/rango/i.test(strMensaje)) {
        setCamposError(new Set(["desde", "hasta"]));
        setStrErrorPeriodo(strMensaje);
      } else {
        setStrErrorReporte(
          `${strMensaje} No se muestran cálculos parciales para evitar información incompleta.`
        );
      }
    } finally {
      setBolGenerando(false);
    }
  }

  async function abrirVistaPrevia() {
    if (!bolPuedeEmitir || !inmueble || !filtroGenerado) {
      setStrMensajePermiso(MENSAJE_SOLO_ADMIN_ESTADO_CUENTA);
      return;
    }
    setStrErrorDocumento("");
    setBolPreparandoVista(true);
    try {
      const blob = await cuentaInmuebleService.obtenerEstadoCuentaPdf(inmueble.id, filtroGenerado, true);
      setStrUrlVistaPrevia(URL.createObjectURL(new Blob([blob], { type: "application/pdf" })));
    } catch (error: unknown) {
      setStrErrorDocumento(await mensajeDeError(error, "No se pudo preparar la vista previa de impresión."));
    } finally {
      setBolPreparandoVista(false);
    }
  }

  function imprimir() {
    const ventana = refIframe.current?.contentWindow;
    if (ventana) {
      ventana.focus();
      ventana.print();
    } else if (strUrlVistaPrevia) {
      window.open(strUrlVistaPrevia, "_blank", "noopener,noreferrer");
    }
  }

  async function descargarPdf() {
    if (!bolPuedeEmitir || !inmueble || !filtroGenerado || !estadoCuenta) {
      setStrMensajePermiso(MENSAJE_SOLO_ADMIN_ESTADO_CUENTA);
      return;
    }
    setStrErrorDocumento("");
    setBolDescargando(true);
    try {
      const blob = await cuentaInmuebleService.obtenerEstadoCuentaPdf(inmueble.id, filtroGenerado);
      const strUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const strSufijo =
        estadoCuenta.periodo.mes ??
        ([estadoCuenta.periodo.desde, estadoCuenta.periodo.hasta].filter(Boolean).join("_a_") || "completo");
      const enlace = document.createElement("a");
      enlace.href = strUrl;
      enlace.download = `estado-cuenta-${estadoCuenta.inmueble.codigo}-${strSufijo}.pdf`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(strUrl), 1000);
    } catch (error: unknown) {
      setStrErrorDocumento(await mensajeDeError(error, "No se pudo descargar el PDF del estado de cuenta."));
    } finally {
      setBolDescargando(false);
    }
  }

  if (bolCargandoInmueble) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (strErrorInmueble || !inmueble) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <p className={CLASE_AVISO_ERROR}>{strErrorInmueble || "Selecciona un inmueble válido."}</p>
        <Link href="/admin/inmuebles" className="mt-3 inline-block text-[13px] font-medium text-primary hover:text-primary/80">
          Ir a Inmuebles para elegir uno →
        </Link>
      </div>
    );
  }

  const saldoFinal = estadoCuenta?.resumenPeriodo.saldoFinal;

  return (
    <div className="px-4 py-6 sm:px-6">
      <Link
        href={`/admin/inmuebles/${inmueble.id}`}
        className="font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground hover:text-foreground"
      >
        ← Ficha de {inmueble.codigo}
      </Link>

      <div className="mb-5 mt-1 flex flex-wrap items-center gap-2">
        <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Estado de cuenta · {inmueble.codigo}
        </h1>
        <BadgeTipoInmueble inmueble={inmueble} />
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      {!bolPuedeEmitir ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <AlertaPermiso mensaje={MENSAJE_SOLO_ADMIN_ESTADO_CUENTA} />
          <p className={CLASE_AYUDA}>
            Puedes consultar los cargos del inmueble desde su ficha con &quot;Ver cargos y estado de cuenta&quot;.
          </p>
        </div>
      ) : (
        <>
          {/* Selección del periodo */}
          <form
            onSubmit={handleGenerar}
            noValidate
            className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" />
              <h2 className={CLASE_TITULO_SECCION}>Periodo del reporte</h2>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex flex-col gap-1">
                <span className={CLASE_LABEL}>Consultar por</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
                  {(["MES", "RANGO"] as const).map((strOpcion) => (
                    <button
                      key={strOpcion}
                      type="button"
                      aria-pressed={strModo === strOpcion}
                      onClick={() => {
                        setStrModo(strOpcion);
                        setCamposError(new Set());
                        setStrErrorPeriodo("");
                      }}
                      className={`h-7 rounded-md px-3 text-[13px] font-medium transition-colors ${
                        strModo === strOpcion
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {strOpcion === "MES" ? "Mes" : "Rango de fechas"}
                    </button>
                  ))}
                </div>
              </div>

              {strModo === "MES" ? (
                <div className="flex flex-col gap-1 lg:w-52">
                  <label htmlFor="mes" className={CLASE_LABEL}>
                    Mes
                  </label>
                  <input
                    id="mes"
                    type="month"
                    value={strMes}
                    onChange={(event) => {
                      setStrMes(event.target.value);
                      limpiarError("mes");
                    }}
                    className={claseCampo(camposError.has("mes"))}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-md">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="desde" className={CLASE_LABEL}>
                      Desde
                    </label>
                    <input
                      id="desde"
                      type="date"
                      value={strDesde}
                      aria-invalid={camposError.has("desde") || undefined}
                      onChange={(event) => {
                        setStrDesde(event.target.value);
                        limpiarError("desde");
                      }}
                      className={claseCampo(camposError.has("desde"))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="hasta" className={CLASE_LABEL}>
                      Hasta
                    </label>
                    <input
                      id="hasta"
                      type="date"
                      value={strHasta}
                      aria-invalid={camposError.has("hasta") || undefined}
                      onChange={(event) => {
                        setStrHasta(event.target.value);
                        limpiarError("hasta");
                      }}
                      className={claseCampo(camposError.has("hasta"))}
                    />
                  </div>
                </div>
              )}

              <Button type="submit" cargando={bolGenerando} className="h-9 px-4">
                {estadoCuenta ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {bolGenerando ? "Generando..." : estadoCuenta ? "Volver a generar" : "Generar estado de cuenta"}
              </Button>
            </div>

            {strErrorPeriodo && <p className={`${CLASE_AVISO_ERROR} mt-3`}>{strErrorPeriodo}</p>}
            <p className={`${CLASE_AYUDA} mt-3`}>
              Se incluyen solo los movimientos de este inmueble en el periodo elegido. Cada vez que generas el reporte
              se consultan los registros actuales, así que refleja los pagos y cargos más recientes.
            </p>
          </form>

          {strErrorReporte && <p role="alert" className={`${CLASE_AVISO_ERROR} mb-6`}>{strErrorReporte}</p>}

          {bolGenerando && (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          {estadoCuenta && saldoFinal && (
            <div className="flex flex-col gap-6">
              {/* Acciones del documento */}
              <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={CLASE_TITULO_SECCION}>Estado de cuenta generado</p>
                  <p className={CLASE_AYUDA}>
                    {estadoCuenta.inmueble.codigo} · {estadoCuenta.periodo.etiqueta} · emitido el{" "}
                    {new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(estadoCuenta.generadoEn)
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" cargando={bolPreparandoVista} onClick={abrirVistaPrevia}>
                    <Printer className="h-4 w-4" />
                    {bolPreparandoVista ? "Preparando..." : "Vista previa e imprimir"}
                  </Button>
                  <Button cargando={bolDescargando} onClick={descargarPdf}>
                    <Download className="h-4 w-4" />
                    {bolDescargando ? "Descargando..." : "Descargar PDF"}
                  </Button>
                </div>
              </div>
              {strErrorDocumento && <p className={CLASE_AVISO_ERROR}>{strErrorDocumento}</p>}

              {/* Cabecera del reporte */}
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-3">
                <div>
                  <p className={CLASE_LABEL}>Inmueble</p>
                  <p className="mt-1 text-[14px] font-medium text-foreground">{estadoCuenta.inmueble.codigo}</p>
                  <p className={CLASE_AYUDA}>
                    {estadoCuenta.inmueble.clase === "DEPARTAMENTO" || !estadoCuenta.inmueble.clase
                      ? `Departamento tipo ${estadoCuenta.inmueble.tipo}`
                      : estadoCuenta.inmueble.tipo}
                    {inmueble.piso ? ` · piso ${inmueble.piso}` : ""}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL}>Propietario / responsable</p>
                  {estadoCuenta.ocupantes.length === 0 ? (
                    <p className="mt-1 text-[13px] text-muted-foreground">Sin propietario ni inquilino vigente</p>
                  ) : (
                    estadoCuenta.ocupantes.map((ocupante) => (
                      <div key={`${ocupante.id}-${ocupante.rol}`} className="mt-1">
                        <p className="text-[13px] font-medium text-foreground">
                          {ocupante.nombre} {ocupante.apellido}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({ocupante.rol === "PROPIETARIO" ? "propietario" : "inquilino"})
                          </span>
                        </p>
                        <p className={CLASE_AYUDA}>
                          CI {ocupante.ci}
                          {ocupante.telefono ? ` · ${ocupante.telefono}` : ""}
                          {ocupante.email ? ` · ${ocupante.email}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <p className={CLASE_LABEL}>Periodo consultado</p>
                  <p className="mt-1 text-[14px] font-medium capitalize text-foreground">{estadoCuenta.periodo.etiqueta}</p>
                  {estadoCuenta.periodo.desde && estadoCuenta.periodo.hasta && (
                    <p className={CLASE_AYUDA}>
                      {fecha(estadoCuenta.periodo.desde)} al {fecha(estadoCuenta.periodo.hasta)}
                    </p>
                  )}
                </div>
              </div>

              {/* Resumen de saldos */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className={CLASE_LABEL}>Saldo anterior</p>
                  <p className="mt-2">
                    <SaldoTexto saldo={estadoCuenta.saldoAnterior} bolGrande />
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className={CLASE_LABEL}>Cargos del periodo</p>
                  <p className={`${CLASE_CIFRA} mt-2 text-foreground`}>{bs(estadoCuenta.resumenPeriodo.totalCargos)}</p>
                  <p className={CLASE_AYUDA}>Expensas y moras</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className={CLASE_LABEL}>Abonos del periodo</p>
                  <p className={`${CLASE_CIFRA} mt-2 text-success`}>{bs(estadoCuenta.resumenPeriodo.totalAbonos)}</p>
                  <p className={CLASE_AYUDA}>Pagos y saldo a favor generado</p>
                </div>
                <div
                  className={`rounded-2xl border p-4 shadow-sm ${
                    saldoFinal.situacion === "DEBE"
                      ? "border-destructive/30 bg-danger-subtle"
                      : saldoFinal.situacion === "A_FAVOR"
                        ? "border-accent-secondary/30 bg-accent-secondary/10"
                        : "border-success/30 bg-success-subtle"
                  }`}
                >
                  <p className={CLASE_LABEL}>
                    {saldoFinal.situacion === "A_FAVOR" ? "Saldo a favor restante" : "Saldo total adeudado"}
                  </p>
                  <p className="mt-2">
                    <SaldoTexto saldo={saldoFinal} bolGrande />
                  </p>
                  <p className={CLASE_AYUDA}>
                    {saldoFinal.situacion === "DEBE"
                      ? `Deuda ${bs(saldoFinal.deuda)} − saldo a favor ${bs(saldoFinal.saldoFavor)}`
                      : saldoFinal.situacion === "A_FAVOR"
                        ? "Las deudas están cubiertas; no hay saldo adeudado."
                        : "Todos los cargos están cubiertos."}
                  </p>
                </div>
              </div>

              {/* Movimientos */}
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className={CLASE_TITULO_SECCION}>Movimientos del periodo</h2>
                  <p className={`${CLASE_AYUDA} mt-1`}>
                    Ordenados del más antiguo al más reciente, con el saldo después de cada movimiento.
                  </p>
                </div>

                {estadoCuenta.sinMovimientos ? (
                  <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
                    {estadoCuenta.mensaje ?? "No existen movimientos para el periodo seleccionado."}
                  </p>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-200 border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className={`${CLASE_LABEL} px-5 py-2.5 text-left`}>Fecha</th>
                            <th className={`${CLASE_LABEL} px-3 py-2.5 text-left`}>Concepto</th>
                            <th className={`${CLASE_LABEL} px-3 py-2.5 text-right`}>Cargo</th>
                            <th className={`${CLASE_LABEL} px-3 py-2.5 text-right`}>Abono</th>
                            <th className={`${CLASE_LABEL} px-5 py-2.5 text-right`}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border bg-muted/20">
                            <td className="px-5 py-2.5 text-[13px] text-muted-foreground">
                              {estadoCuenta.periodo.desde ? fecha(estadoCuenta.periodo.desde) : "—"}
                            </td>
                            <td colSpan={3} className="px-3 py-2.5 text-[13px] font-medium text-foreground">
                              Saldo anterior al periodo
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <SaldoTexto saldo={estadoCuenta.saldoAnterior} />
                            </td>
                          </tr>
                          {estadoCuenta.movimientos.map((mov, intIndice) => (
                            <tr key={`${mov.tipo}-${mov.expensaId ?? "s"}-${intIndice}`} className="border-b border-border align-top last:border-0">
                              <td className="whitespace-nowrap px-5 py-3 text-[13px] text-foreground">{fecha(mov.fecha)}</td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASE_BADGE_TIPO[mov.tipo]}`}
                                  >
                                    {ETIQUETA_TIPO[mov.tipo]}
                                  </span>
                                  <span className="text-[13px] text-foreground">{mov.descripcion}</span>
                                </div>
                                <DetalleMovimiento mov={mov} />
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] tabular-nums text-foreground">
                                {Number(mov.cargo) > 0 ? bs(mov.cargo) : "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] tabular-nums text-success">
                                {Number(mov.abono) > 0 ? bs(mov.abono) : "—"}
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 text-right">
                                <SaldoTexto saldo={mov.saldoCorrido} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-muted/20">
                            <td colSpan={2} className="px-5 py-3 text-[13px] font-medium text-foreground">
                              Totales del periodo
                            </td>
                            <td className="px-3 py-3 text-right text-[13px] font-medium tabular-nums text-foreground">
                              {bs(estadoCuenta.resumenPeriodo.totalCargos)}
                            </td>
                            <td className="px-3 py-3 text-right text-[13px] font-medium tabular-nums text-success">
                              {bs(estadoCuenta.resumenPeriodo.totalAbonos)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <SaldoTexto saldo={saldoFinal} />
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile */}
                    <div className="flex flex-col divide-y divide-border md:hidden">
                      {estadoCuenta.movimientos.map((mov, intIndice) => (
                        <div key={`m-${mov.tipo}-${mov.expensaId ?? "s"}-${intIndice}`} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span
                                className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASE_BADGE_TIPO[mov.tipo]}`}
                              >
                                {ETIQUETA_TIPO[mov.tipo]}
                              </span>
                              <p className="mt-1 text-[13px] text-foreground">{mov.descripcion}</p>
                              <p className={CLASE_AYUDA}>{fecha(mov.fecha)}</p>
                            </div>
                            <div className="text-right">
                              {Number(mov.cargo) > 0 && (
                                <p className="text-[13px] tabular-nums text-foreground">+{bs(mov.cargo)}</p>
                              )}
                              {Number(mov.abono) > 0 && (
                                <p className="text-[13px] tabular-nums text-success">−{bs(mov.abono)}</p>
                              )}
                              <p className={CLASE_AYUDA}>
                                Saldo <SaldoTexto saldo={mov.saldoCorrido} />
                              </p>
                            </div>
                          </div>
                          <DetalleMovimiento mov={mov} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Deudas pendientes */}
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className={CLASE_TITULO_SECCION}>Deudas pendientes al cierre del periodo</h2>
                  <p className={`${CLASE_AYUDA} mt-1`}>Obligaciones que no se pagaron completas y lo que resta de cada una.</p>
                </div>
                {estadoCuenta.deudasPendientes.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-success">
                    No hay obligaciones pendientes: todos los cargos están cubiertos.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className={`${CLASE_LABEL} px-5 py-2.5 text-left`}>Expensa</th>
                          <th className={`${CLASE_LABEL} px-3 py-2.5 text-right`}>Importe cargado</th>
                          <th className={`${CLASE_LABEL} px-3 py-2.5 text-right`}>Pagado</th>
                          <th className={`${CLASE_LABEL} px-5 py-2.5 text-right`}>Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estadoCuenta.deudasPendientes.map((deuda) => (
                          <tr key={deuda.expensaId} className="border-b border-border last:border-0">
                            <td className="px-5 py-2.5 text-[13px] text-foreground">Periodo {deuda.periodo}</td>
                            <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-foreground">
                              {bs(deuda.importeCargado)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-success">{bs(deuda.pagado)}</td>
                            <td className="px-5 py-2.5 text-right text-[13px] font-medium tabular-nums text-destructive">
                              {bs(deuda.pendiente)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {Number(saldoFinal.saldoFavor) > 0 && (
                  <p className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
                    Saldo a favor disponible:{" "}
                    <span className="font-medium tabular-nums text-accent-secondary">{bs(saldoFinal.saldoFavor)}</span>
                    {saldoFinal.situacion === "A_FAVOR"
                      ? " — supera las deudas; queda a favor para próximas expensas."
                      : " — se descuenta del saldo adeudado."}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Vista previa de impresión (PDF generado por el backend, paginado) */}
      <Dialog
        open={strUrlVistaPrevia !== null}
        onOpenChange={(bolOpen) => {
          if (!bolOpen) setStrUrlVistaPrevia(null);
        }}
      >
        <DialogContent className="flex h-[90vh] max-w-[calc(100%-2rem)] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Vista previa de impresión
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {estadoCuenta
                ? `${estadoCuenta.inmueble.codigo} · ${estadoCuenta.periodo.etiqueta}. Revisa el documento y confirma la impresión.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {strUrlVistaPrevia && (
            <iframe
              ref={refIframe}
              src={strUrlVistaPrevia}
              title="Vista previa del estado de cuenta"
              className="min-h-0 w-full flex-1 rounded-lg border border-border bg-background"
            />
          )}
          <DialogFooter>
            {strUrlVistaPrevia && (
              <a
                href={strUrlVistaPrevia}
                target="_blank"
                rel="noopener noreferrer"
                className="font-caption mr-auto self-center text-[12px] font-medium text-primary hover:text-primary/80"
              >
                Abrir en otra pestaña
              </a>
            )}
            <Button variant="outline" onClick={() => setStrUrlVistaPrevia(null)}>
              Cerrar
            </Button>
            <Button onClick={imprimir}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
