"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, CalendarRange, Eye, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Inmueble, listarInmuebles } from "@/lib/inmuebles";
import { financeService } from "@/services/finance.service";
import { planesPagoService } from "@/services/planesPago.service";
import type { ExpensaDTO, MetodoPago } from "@/types/finance";
import type { EstadoCuota, EstadoPlan, PlanPagoDTO } from "@/types/planesPago";
import {
  fechaHoyBolivia,
  formatCurrency,
  formatearFecha,
  formatearFechaCalendario,
  obtenerMensajeError,
  resumenSaldo,
} from "../../morosidad/utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO = CLASE_HEADER_TABLA;
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
const CLASE_CIFRA = "font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";
const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";
const CLASE_AVISO_EXITO = "rounded-lg border border-success/20 bg-success-subtle px-3.5 py-2.5 text-[13px] text-success";
const IMPORTE_VALIDO = /^\d+(\.\d{1,2})?$/;
const MIN_CUOTAS = 2;
const MAX_CUOTAS = 60;

const ETIQUETA_ESTADO_PLAN: Record<EstadoPlan, string> = {
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};
const CLASE_ESTADO_PLAN: Record<EstadoPlan, string> = {
  ACTIVO: "bg-accent-secondary/10 text-accent-secondary",
  COMPLETADO: "bg-success-subtle text-success",
  CANCELADO: "bg-muted text-muted-foreground",
};
const ETIQUETA_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
};
const CLASE_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  PENDIENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-accent-secondary/10 text-accent-secondary",
  PAGADA: "bg-success-subtle text-success",
  VENCIDA: "bg-danger-subtle text-destructive",
};
const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
};

/** Mismo cálculo que el backend (mora.util.js → sumarMeses): conserva el día o usa el último del mes. */
function sumarMeses(strFecha: string, intMeses: number): string {
  const [anio, mes, dia] = strFecha.split("-").map(Number);
  const total = anio * 12 + (mes - 1) + intMeses;
  const anioFinal = Math.floor(total / 12);
  const mesFinal = total % 12;
  const ultimoDia = new Date(Date.UTC(anioFinal, mesFinal + 1, 0)).getUTCDate();
  return `${anioFinal}-${String(mesFinal + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

const aCentavos = (valor: number) => Math.round(valor * 100);

/** Cuotas iguales como las arma el backend: base truncada a 2 decimales y la diferencia en la última. */
function cuotasIguales(intTotalCentavos: number, intCantidad: number, strPrimerVencimiento: string) {
  const intBase = Math.floor(intTotalCentavos / intCantidad);
  return Array.from({ length: intCantidad }, (_, i) => ({
    monto: (i === intCantidad - 1 ? intTotalCentavos - intBase * (intCantidad - 1) : intBase) / 100,
    fechaVencimiento: sumarMeses(strPrimerVencimiento, i),
  }));
}

function nuevaClave(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function BadgeEstado({ texto, clase }: { texto: string; clase: string }) {
  return <Badge className={`font-caption text-[11px] ${clase}`}>{texto}</Badge>;
}

export default function PlanesPagoPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  // Crear planes, registrar pagos y cancelar: solo ADMINISTRADOR (planes-pago.routes.js → GESTION).
  const bolPuedeGestionar = puedeEjecutar(rol, "pagos", "crear");

  const [planes, setPlanes] = useState<PlanPagoDTO[]>([]);
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [bolCargando, setBolCargando] = useState(true);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  const [strFiltroEstado, setStrFiltroEstado] = useState<EstadoPlan | "TODOS">("ACTIVO");
  const [strFiltroInmueble, setStrFiltroInmueble] = useState("TODOS");
  const [strExito, setStrExito] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  // Detalle
  const [planDetalle, setPlanDetalle] = useState<PlanPagoDTO | null>(null);
  const [bolFormPago, setBolFormPago] = useState(false);
  const [strMontoPago, setStrMontoPago] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [strReferencia, setStrReferencia] = useState("");
  const [strClavePago, setStrClavePago] = useState("");
  const [bolPagando, setBolPagando] = useState(false);
  const [strErrorDetalle, setStrErrorDetalle] = useState("");
  const [bolConfirmarCancelar, setBolConfirmarCancelar] = useState(false);
  const [bolCancelando, setBolCancelando] = useState(false);

  // Nuevo plan
  const [bolDialogoNuevo, setBolDialogoNuevo] = useState(false);
  const [strInmuebleNuevo, setStrInmuebleNuevo] = useState("");
  const [expensasDeuda, setExpensasDeuda] = useState<ExpensaDTO[]>([]);
  const [bolCargandoDeuda, setBolCargandoDeuda] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [strModo, setStrModo] = useState<"IGUALES" | "PERSONALIZADAS">("IGUALES");
  const [strCantidad, setStrCantidad] = useState("3");
  const [strPrimerVencimiento, setStrPrimerVencimiento] = useState("");
  const [cuotasManuales, setCuotasManuales] = useState<{ monto: string; fecha: string }[]>([]);
  const [strObservacion, setStrObservacion] = useState("");
  const [strErrorNuevo, setStrErrorNuevo] = useState("");
  const [bolCreando, setBolCreando] = useState(false);

  async function cargarPlanes() {
    setBolCargando(true);
    setStrErrorCarga("");
    try {
      setPlanes(
        await planesPagoService.listar({
          ...(strFiltroEstado !== "TODOS" ? { estado: strFiltroEstado } : {}),
          ...(strFiltroInmueble !== "TODOS" ? { inmuebleId: strFiltroInmueble } : {}),
        })
      );
    } catch (error) {
      setStrErrorCarga(obtenerMensajeError(error, "No se pudieron cargar los planes de pago."));
    } finally {
      setBolCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarPlanes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strFiltroEstado, strFiltroInmueble]);

  useEffect(() => {
    listarInmuebles()
      .then((lista) =>
        setInmuebles(
          lista
            .filter((inmueble) => inmueble.clase === "DEPARTAMENTO")
            .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
        )
      )
      .catch(() => undefined);
  }, []);

  // ---------------------------------------------------------------- detalle y pagos

  function abrirDetalle(plan: PlanPagoDTO) {
    setPlanDetalle(plan);
    setBolFormPago(false);
    setStrErrorDetalle("");
    setBolConfirmarCancelar(false);
  }

  function abrirFormPago() {
    const permiso = validarAccion(rol, "pagos", "crear");
    if (!permiso.permitido) {
      setStrErrorDetalle(permiso.mensaje);
      return;
    }
    if (!planDetalle) return;
    setStrMontoPago(planDetalle.proximaCuota ? Number(planDetalle.proximaCuota.saldoPendiente).toFixed(2) : "");
    setMetodoPago("EFECTIVO");
    setStrReferencia("");
    setStrClavePago(nuevaClave());
    setStrErrorDetalle("");
    setBolFormPago(true);
  }

  async function handleRegistrarPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planDetalle) return;
    const permiso = validarAccion(rol, "pagos", "crear");
    if (!permiso.permitido) {
      setStrErrorDetalle(permiso.mensaje);
      return;
    }
    const strMonto = strMontoPago.trim();
    const intMonto = Number(strMonto);
    if (!IMPORTE_VALIDO.test(strMonto) || intMonto <= 0) {
      setStrErrorDetalle("Ingresa un monto mayor a cero, con máximo 2 decimales.");
      return;
    }
    if (aCentavos(intMonto) > aCentavos(Number(planDetalle.saldoPendiente))) {
      setStrErrorDetalle(`El monto no puede superar el saldo del plan (${formatCurrency(Number(planDetalle.saldoPendiente))}).`);
      return;
    }

    setBolPagando(true);
    setStrErrorDetalle("");
    try {
      const resultado = await planesPagoService.registrarPago(
        planDetalle.id,
        { monto: intMonto, metodoPago, ...(strReferencia.trim() ? { referencia: strReferencia.trim() } : {}) },
        strClavePago
      );
      const planActualizado = resultado.plan ?? (await planesPagoService.obtener(planDetalle.id));
      setPlanDetalle(planActualizado);
      setBolFormPago(false);
      const strCuotas = (resultado.aplicacionesCuotas ?? [])
        .map((c) => `cuota ${c.numero} (${formatCurrency(Number(c.montoAplicado))})`)
        .join(", ");
      setStrExito(
        resultado.duplicado
          ? "Ese pago ya estaba registrado: no se cobró de nuevo."
          : `Pago de ${formatCurrency(intMonto)} registrado en el plan de ${planActualizado.inmueble.codigo}` +
              (resultado.recibo?.folio ? ` (recibo ${resultado.recibo.folio})` : "") +
              (strCuotas ? `, aplicado a ${strCuotas}` : "") +
              `. Saldo del plan: ${formatCurrency(Number(planActualizado.saldoPendiente))}.`
      );
      await cargarPlanes();
    } catch (error) {
      setStrErrorDetalle(obtenerMensajeError(error, "No se pudo registrar el pago del plan."));
    } finally {
      setBolPagando(false);
    }
  }

  async function handleCancelarPlan() {
    if (!planDetalle) return;
    const permiso = validarAccion(rol, "pagos", "crear");
    if (!permiso.permitido) {
      setStrErrorDetalle(permiso.mensaje);
      return;
    }
    setBolCancelando(true);
    setStrErrorDetalle("");
    try {
      const plan = await planesPagoService.cancelar(planDetalle.id);
      setPlanDetalle(plan);
      setBolConfirmarCancelar(false);
      setStrExito(`Plan de ${plan.inmueble.codigo} cancelado: sus expensas vuelven al cobro normal.`);
      await cargarPlanes();
    } catch (error) {
      setStrErrorDetalle(obtenerMensajeError(error, "No se pudo cancelar el plan."));
    } finally {
      setBolCancelando(false);
    }
  }

  // ---------------------------------------------------------------- nuevo plan

  function abrirNuevoPlan() {
    const permiso = validarAccion(rol, "pagos", "crear");
    if (!permiso.permitido) {
      setStrMensajePermiso(permiso.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setStrInmuebleNuevo("");
    setExpensasDeuda([]);
    setSeleccionadas(new Set());
    setStrModo("IGUALES");
    setStrCantidad("3");
    setStrPrimerVencimiento(fechaHoyBolivia());
    setCuotasManuales([
      { monto: "", fecha: fechaHoyBolivia() },
      { monto: "", fecha: sumarMeses(fechaHoyBolivia(), 1) },
    ]);
    setStrObservacion("");
    setStrErrorNuevo("");
    setBolDialogoNuevo(true);
  }

  async function elegirInmuebleNuevo(strId: string) {
    setStrInmuebleNuevo(strId);
    setStrErrorNuevo("");
    setBolCargandoDeuda(true);
    try {
      const { expensas } = await financeService.getExpensasPaginadas({ inmuebleId: strId, pagina: 1, porPagina: 200 });
      // Solo la deuda que todavía no está en otro plan.
      const conDeuda = expensas
        .filter((exp) => exp.estado !== "PAGADA" && !exp.planPagoId && resumenSaldo(exp).total > 0)
        .sort((a, b) => a.periodo.localeCompare(b.periodo));
      setExpensasDeuda(conDeuda);
      setSeleccionadas(new Set(conDeuda.map((exp) => exp.id)));
    } catch (error) {
      setExpensasDeuda([]);
      setStrErrorNuevo(obtenerMensajeError(error, "No se pudo consultar la deuda del departamento."));
    } finally {
      setBolCargandoDeuda(false);
    }
  }

  const intTotalCentavos = useMemo(
    () =>
      expensasDeuda
        .filter((exp) => seleccionadas.has(exp.id))
        .reduce((acc, exp) => acc + aCentavos(resumenSaldo(exp).total), 0),
    [expensasDeuda, seleccionadas]
  );

  const vistaPreviaIguales = useMemo(() => {
    const intCantidad = Number(strCantidad);
    if (!Number.isInteger(intCantidad) || intCantidad < MIN_CUOTAS || intCantidad > MAX_CUOTAS) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(strPrimerVencimiento) || intTotalCentavos <= 0) return [];
    return cuotasIguales(intTotalCentavos, intCantidad, strPrimerVencimiento);
  }, [strCantidad, strPrimerVencimiento, intTotalCentavos]);

  const intSumaManualCentavos = cuotasManuales.reduce(
    (acc, cuota) => acc + (IMPORTE_VALIDO.test(cuota.monto.trim()) ? aCentavos(Number(cuota.monto)) : 0),
    0
  );

  function validarNuevoPlan(): string | null {
    if (!strInmuebleNuevo) return "Selecciona el departamento.";
    if (seleccionadas.size === 0) return "Selecciona al menos una expensa con deuda.";
    if (intTotalCentavos <= 0) return "Las expensas elegidas no tienen saldo pendiente.";
    const hoy = fechaHoyBolivia();

    if (strModo === "IGUALES") {
      const intCantidad = Number(strCantidad);
      if (!Number.isInteger(intCantidad) || intCantidad < MIN_CUOTAS || intCantidad > MAX_CUOTAS) {
        return `La cantidad de cuotas debe ser un número entero entre ${MIN_CUOTAS} y ${MAX_CUOTAS}.`;
      }
      if (!strPrimerVencimiento || strPrimerVencimiento < hoy) return "El primer vencimiento no puede ser anterior a hoy.";
      if (vistaPreviaIguales.some((cuota) => cuota.monto <= 0)) return "El total es muy bajo para tantas cuotas.";
      return null;
    }

    if (cuotasManuales.length < MIN_CUOTAS || cuotasManuales.length > MAX_CUOTAS) {
      return `El plan debe tener entre ${MIN_CUOTAS} y ${MAX_CUOTAS} cuotas.`;
    }
    for (const [i, cuota] of cuotasManuales.entries()) {
      if (!IMPORTE_VALIDO.test(cuota.monto.trim()) || Number(cuota.monto) <= 0) {
        return `El importe de la cuota ${i + 1} debe ser mayor a cero, con máximo 2 decimales.`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cuota.fecha)) return `Indica la fecha de vencimiento de la cuota ${i + 1}.`;
      if (i === 0 && cuota.fecha < hoy) return "La primera cuota no puede vencer antes de hoy.";
      if (i > 0 && cuota.fecha < cuotasManuales[i - 1].fecha) {
        return `La cuota ${i + 1} no puede vencer antes que la cuota ${i}.`;
      }
    }
    if (intSumaManualCentavos !== intTotalCentavos) {
      return `La suma de las cuotas (${formatCurrency(intSumaManualCentavos / 100)}) debe coincidir con el total acordado (${formatCurrency(intTotalCentavos / 100)}).`;
    }
    return null;
  }

  async function handleCrearPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const permiso = validarAccion(rol, "pagos", "crear");
    if (!permiso.permitido) {
      setStrErrorNuevo(permiso.mensaje);
      return;
    }
    const strError = validarNuevoPlan();
    if (strError) {
      setStrErrorNuevo(strError);
      return;
    }

    setBolCreando(true);
    setStrErrorNuevo("");
    try {
      const bolTodas = seleccionadas.size === expensasDeuda.length;
      const plan = await planesPagoService.crear({
        inmuebleId: strInmuebleNuevo,
        ...(bolTodas ? {} : { expensaIds: [...seleccionadas] }),
        montoTotal: intTotalCentavos / 100,
        ...(strModo === "IGUALES"
          ? { cantidadCuotas: Number(strCantidad), primerVencimiento: strPrimerVencimiento }
          : { cuotas: cuotasManuales.map((c) => ({ monto: Number(c.monto), fechaVencimiento: c.fecha })) }),
        ...(strObservacion.trim() ? { observacion: strObservacion.trim() } : {}),
      });
      setBolDialogoNuevo(false);
      setStrExito(
        `Plan registrado para ${plan.inmueble.codigo}: ${plan.cantidadCuotas} cuotas por un total de ${formatCurrency(Number(plan.montoTotal))}.`
      );
      await cargarPlanes();
      abrirDetalle(plan);
    } catch (error) {
      setStrErrorNuevo(obtenerMensajeError(error, "No se pudo registrar el plan de pagos."));
    } finally {
      setBolCreando(false);
    }
  }

  // ---------------------------------------------------------------- vista

  const resumen = useMemo(() => {
    const activos = planes.filter((plan) => plan.estado === "ACTIVO");
    return {
      intActivos: activos.length,
      saldo: activos.reduce((acc, plan) => acc + Number(plan.saldoPendiente), 0),
      intCuotasVencidas: activos.reduce((acc, plan) => acc + plan.cuotasVencidas, 0),
    };
  }, [planes]);

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Link href="/admin/pagos" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Pagos
          </Link>
          <h2 className={CLASE_TITULO_SECCION}>Planes de pago en cuotas</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
            Divide la deuda de un departamento en cuotas con su propio importe y vencimiento. Mientras el plan está
            activo, sus expensas se cobran por cuotas y no generan mora nueva.
          </p>
        </div>
        {bolPuedeGestionar && (
          <Button className="w-full md:w-auto" onClick={abrirNuevoPlan}>
            <Plus className="h-4 w-4" />
            Nuevo plan de pagos
          </Button>
        )}
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}
      {strExito && <div className={`${CLASE_AVISO_EXITO} mb-4`}>{strExito}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Planes activos</p>
            <p className={`${CLASE_CIFRA} mt-2 text-accent-secondary`}>{resumen.intActivos}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Saldo por cobrar en planes</p>
            <p className={`${CLASE_CIFRA} mt-2 text-foreground`}>{formatCurrency(resumen.saldo)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Cuotas vencidas</p>
            <p className={`${CLASE_CIFRA} mt-2 ${resumen.intCuotasVencidas > 0 ? "text-destructive" : "text-foreground"}`}>
              {resumen.intCuotasVencidas}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className={CLASE_TITULO_SECCION}>Planes registrados</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={strFiltroEstado} onValueChange={(valor: EstadoPlan | "TODOS") => setStrFiltroEstado(valor)}>
              <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los estados</SelectItem>
                {(Object.keys(ETIQUETA_ESTADO_PLAN) as EstadoPlan[]).map((estado) => (
                  <SelectItem key={estado} value={estado}>{ETIQUETA_ESTADO_PLAN[estado]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={strFiltroInmueble} onValueChange={setStrFiltroInmueble}>
              <SelectTrigger aria-label="Filtrar por departamento" className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los departamentos</SelectItem>
                {inmuebles.map((inmueble) => (
                  <SelectItem key={inmueble.id} value={inmueble.id}>{inmueble.codigo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" cargando={bolCargando} onClick={() => void cargarPlanes()}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {strErrorCarga && <p role="alert" className={`${CLASE_AVISO_ERROR} m-5`}>{strErrorCarga}</p>}
          {bolCargando && planes.length === 0 ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : planes.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              No hay planes de pago{strFiltroEstado !== "TODOS" ? ` en estado "${ETIQUETA_ESTADO_PLAN[strFiltroEstado]}"` : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${CLASE_HEADER_TABLA} pl-5`}>Departamento</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total acordado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Pagado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Saldo</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Cuotas</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Próxima cuota</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} pr-5 text-right`}>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planes.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="pl-5">
                        <p className="text-[13px] font-medium text-foreground">{plan.inmueble.codigo}</p>
                        <p className={CLASE_AYUDA}>Desde {formatearFecha(plan.createdAt)}</p>
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-foreground">{formatCurrency(Number(plan.montoTotal))}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-success">{formatCurrency(Number(plan.totalPagado))}</TableCell>
                      <TableCell className="text-right text-[13px] font-medium tabular-nums text-foreground">{formatCurrency(Number(plan.saldoPendiente))}</TableCell>
                      <TableCell className="text-[13px] text-foreground">
                        {plan.cuotas.filter((c) => c.estado === "PAGADA").length}/{plan.cantidadCuotas} pagadas
                        {plan.cuotasVencidas > 0 && <p className="text-[12px] text-destructive">{plan.cuotasVencidas} vencida{plan.cuotasVencidas === 1 ? "" : "s"}</p>}
                      </TableCell>
                      <TableCell className="text-[13px] text-foreground">
                        {plan.proximaCuota ? (
                          <>
                            N.º {plan.proximaCuota.numero} · {formatearFechaCalendario(plan.proximaCuota.fechaVencimiento)}
                            <p className={CLASE_AYUDA}>{formatCurrency(Number(plan.proximaCuota.saldoPendiente))}</p>
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <BadgeEstado texto={ETIQUETA_ESTADO_PLAN[plan.estado]} clase={CLASE_ESTADO_PLAN[plan.estado]} />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirDetalle(plan)}>
                          <Eye className="h-4 w-4" /> Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle del plan */}
      <Dialog open={planDetalle !== null} onOpenChange={(abierto) => !abierto && !bolPagando && !bolCancelando && setPlanDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          {planDetalle && (
            <>
              <DialogHeader>
                <DialogTitle className={CLASE_TITULO_DIALOGO}>Plan de pagos · {planDetalle.inmueble.codigo}</DialogTitle>
                <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
                  Registrado el {formatearFecha(planDetalle.createdAt)}
                  {planDetalle.registradoPor ? ` por ${planDetalle.registradoPor.nombre} ${planDetalle.registradoPor.apellido}` : ""}
                  {planDetalle.observacion ? ` · ${planDetalle.observacion}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <BadgeEstado texto={ETIQUETA_ESTADO_PLAN[planDetalle.estado]} clase={CLASE_ESTADO_PLAN[planDetalle.estado]} />
                {planDetalle.cuotasVencidas > 0 && (
                  <BadgeEstado texto={`${planDetalle.cuotasVencidas} cuota${planDetalle.cuotasVencidas === 1 ? "" : "s"} vencida${planDetalle.cuotasVencidas === 1 ? "" : "s"}`} clase={CLASE_ESTADO_CUOTA.VENCIDA} />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { etiqueta: "Total acordado", valor: planDetalle.montoTotal, clase: "text-foreground" },
                  { etiqueta: "Pagado", valor: planDetalle.totalPagado, clase: "text-success" },
                  { etiqueta: "Saldo del acuerdo", valor: planDetalle.saldoPendiente, clase: Number(planDetalle.saldoPendiente) > 0 ? "text-destructive" : "text-success" },
                ].map((item) => (
                  <div key={item.etiqueta} className="rounded-lg border border-border p-3">
                    <p className={CLASE_LABEL_CAMPO}>{item.etiqueta}</p>
                    <p className={`mt-1 text-[16px] font-semibold tabular-nums ${item.clase}`}>{formatCurrency(Number(item.valor))}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Cuotas</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={CLASE_HEADER_TABLA}>N.º</TableHead>
                        <TableHead className={CLASE_HEADER_TABLA}>Vence</TableHead>
                        <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Importe</TableHead>
                        <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Pagado</TableHead>
                        <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Saldo</TableHead>
                        <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planDetalle.cuotas.map((cuota) => (
                        <TableRow key={cuota.id}>
                          <TableCell className="text-[13px] text-foreground">{cuota.numero}</TableCell>
                          <TableCell className="text-[13px] text-foreground">{formatearFechaCalendario(cuota.fechaVencimiento)}</TableCell>
                          <TableCell className="text-right text-[13px] tabular-nums text-foreground">{formatCurrency(Number(cuota.monto))}</TableCell>
                          <TableCell className="text-right text-[13px] tabular-nums text-success">
                            {formatCurrency(Number(cuota.montoPagado))}
                            {cuota.pagos.length > 0 && (
                              <p className={CLASE_AYUDA}>{cuota.pagos.map((p) => p.folio ?? formatCurrency(Number(p.monto))).join(", ")}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[13px] font-medium tabular-nums text-foreground">{formatCurrency(Number(cuota.saldoPendiente))}</TableCell>
                          <TableCell>
                            <BadgeEstado texto={ETIQUETA_ESTADO_CUOTA[cuota.estado]} clase={CLASE_ESTADO_CUOTA[cuota.estado]} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Expensas incluidas</p>
                <div className="flex flex-col gap-1.5">
                  {planDetalle.expensas.map((exp) => (
                    <div key={exp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
                      <span className="text-foreground">Expensa {exp.periodo}</span>
                      <span className="tabular-nums text-muted-foreground">
                        Total {formatCurrency(Number(exp.montoTotal))}
                        {Number(exp.montoMora) > 0 && ` + mora ${formatCurrency(Number(exp.montoMora))}`} · Falta{" "}
                        <span className="font-medium text-foreground">{formatCurrency(Number(exp.pendiente))}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {strErrorDetalle && <p role="alert" className={CLASE_AVISO_ERROR}>{strErrorDetalle}</p>}

              {bolFormPago && planDetalle.estado === "ACTIVO" && (
                <form onSubmit={handleRegistrarPago} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className={CLASE_TITULO_SECCION}>Registrar pago al plan</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="montoPlan" className={CLASE_LABEL_CAMPO}>Monto (Bs)</label>
                      <Input id="montoPlan" type="number" min="0.01" step="0.01" value={strMontoPago} onChange={(e) => setStrMontoPago(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={CLASE_LABEL_CAMPO}>Método</span>
                      <Select value={metodoPago} onValueChange={(valor: MetodoPago) => setMetodoPago(valor)}>
                        <SelectTrigger aria-label="Método de pago" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ETIQUETA_METODO_PAGO) as MetodoPago[]).map((metodo) => (
                            <SelectItem key={metodo} value={metodo}>{ETIQUETA_METODO_PAGO[metodo]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="referenciaPlan" className={CLASE_LABEL_CAMPO}>Referencia (opcional)</label>
                      <Input id="referenciaPlan" maxLength={200} value={strReferencia} onChange={(e) => setStrReferencia(e.target.value)} placeholder="Comprobante 00123" />
                    </div>
                  </div>
                  <p className={CLASE_AYUDA}>
                    Se aplica a las cuotas de la más antigua a la más nueva. No puede superar el saldo del plan ({formatCurrency(Number(planDetalle.saldoPendiente))}).
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={bolPagando} onClick={() => setBolFormPago(false)}>Cancelar</Button>
                    <Button type="submit" cargando={bolPagando}>{bolPagando ? "Registrando..." : "Confirmar pago"}</Button>
                  </div>
                </form>
              )}

              {bolConfirmarCancelar && (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-danger-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] text-destructive">¿Cancelar el plan? Sus expensas vuelven al cobro normal.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={bolCancelando} onClick={() => setBolConfirmarCancelar(false)}>No</Button>
                    <Button size="sm" variant="destructive" cargando={bolCancelando} onClick={handleCancelarPlan}>Sí, cancelar plan</Button>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                {bolPuedeGestionar && planDetalle.estado === "ACTIVO" && Number(planDetalle.totalPagado) === 0 && !bolConfirmarCancelar && (
                  <Button variant="destructive" disabled={bolPagando} onClick={() => setBolConfirmarCancelar(true)}>
                    <XCircle className="h-4 w-4" /> Cancelar plan
                  </Button>
                )}
                {bolPuedeGestionar && planDetalle.estado === "ACTIVO" && !bolFormPago && (
                  <Button onClick={abrirFormPago}>
                    <Banknote className="h-4 w-4" /> Registrar pago
                  </Button>
                )}
                <Button variant="outline" disabled={bolPagando || bolCancelando} onClick={() => setPlanDetalle(null)}>Cerrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nuevo plan */}
      <Dialog open={bolDialogoNuevo} onOpenChange={(abierto) => !abierto && !bolCreando && setBolDialogoNuevo(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Nuevo plan de pagos</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              Elige la deuda a financiar y cómo se divide. La suma de las cuotas debe coincidir con el total acordado.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCrearPlan} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className={CLASE_LABEL_CAMPO}>Departamento</span>
              <Select value={strInmuebleNuevo} onValueChange={(valor) => void elegirInmuebleNuevo(valor)}>
                <SelectTrigger aria-label="Departamento" className="w-full"><SelectValue placeholder="Selecciona un departamento" /></SelectTrigger>
                <SelectContent>
                  {inmuebles.filter((inmueble) => inmueble.activo).map((inmueble) => (
                    <SelectItem key={inmueble.id} value={inmueble.id}>{inmueble.codigo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {strInmuebleNuevo && (
              <div className="flex flex-col gap-2">
                <p className={CLASE_LABEL_CAMPO}>Deuda a financiar</p>
                {bolCargandoDeuda ? (
                  <Skeleton className="h-16 w-full" />
                ) : expensasDeuda.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
                    Este departamento no tiene deuda pendiente fuera de otros planes.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {expensasDeuda.map((exp) => {
                      const saldo = resumenSaldo(exp);
                      return (
                        <label key={exp.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13px]">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--primary)]"
                              checked={seleccionadas.has(exp.id)}
                              onChange={(event) => {
                                const siguiente = new Set(seleccionadas);
                                if (event.target.checked) siguiente.add(exp.id);
                                else siguiente.delete(exp.id);
                                setSeleccionadas(siguiente);
                              }}
                            />
                            <span className="text-foreground">Expensa {exp.periodo}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {saldo.moraPendiente > 0 && `incluye mora ${formatCurrency(saldo.moraPendiente)} · `}
                            <span className="font-medium text-foreground">{formatCurrency(saldo.total)}</span>
                          </span>
                        </label>
                      );
                    })}
                    <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2 text-[13px]">
                      <span className="font-medium text-foreground">Total acordado</span>
                      <span className="font-title text-[16px] font-bold tabular-nums text-foreground">{formatCurrency(intTotalCentavos / 100)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {strInmuebleNuevo && expensasDeuda.length > 0 && (
              <>
                <div className="flex flex-col gap-1">
                  <span className={CLASE_LABEL_CAMPO}>Cuotas</span>
                  <Select value={strModo} onValueChange={(valor: "IGUALES" | "PERSONALIZADAS") => setStrModo(valor)}>
                    <SelectTrigger aria-label="Tipo de cuotas" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IGUALES">Cuotas iguales, una por mes</SelectItem>
                      <SelectItem value="PERSONALIZADAS">Importes y fechas personalizados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {strModo === "IGUALES" ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="cantidadCuotas" className={CLASE_LABEL_CAMPO}>Cantidad de cuotas ({MIN_CUOTAS}-{MAX_CUOTAS})</label>
                        <Input id="cantidadCuotas" type="number" min={MIN_CUOTAS} max={MAX_CUOTAS} value={strCantidad} onChange={(e) => setStrCantidad(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="primerVencimiento" className={CLASE_LABEL_CAMPO}>Primer vencimiento</label>
                        <Input
                          id="primerVencimiento"
                          type="date"
                          className="cursor-pointer"
                          min={fechaHoyBolivia()}
                          value={strPrimerVencimiento}
                          onClick={(event) => {
                            try {
                              event.currentTarget.showPicker?.();
                            } catch {
                              // Sin showPicker queda el ícono del campo.
                            }
                          }}
                          onChange={(e) => setStrPrimerVencimiento(e.target.value)}
                        />
                      </div>
                    </div>
                    {vistaPreviaIguales.length > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Vista previa</p>
                        <div className="grid max-h-40 gap-1 overflow-y-auto text-[13px] tabular-nums sm:grid-cols-2">
                          {vistaPreviaIguales.map((cuota, i) => (
                            <span key={i} className="text-muted-foreground">
                              {i + 1}. {formatearFechaCalendario(cuota.fechaVencimiento)} ·{" "}
                              <span className="text-foreground">{formatCurrency(cuota.monto)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cuotasManuales.map((cuota, i) => (
                      <div key={i} className="grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2">
                        <span className="text-[13px] text-muted-foreground">{i + 1}.</span>
                        <Input
                          aria-label={`Importe de la cuota ${i + 1}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Importe"
                          value={cuota.monto}
                          onChange={(e) =>
                            setCuotasManuales((prev) => prev.map((c, j) => (j === i ? { ...c, monto: e.target.value } : c)))
                          }
                        />
                        <Input
                          aria-label={`Vencimiento de la cuota ${i + 1}`}
                          type="date"
                          className="cursor-pointer"
                          value={cuota.fecha}
                          onClick={(event) => {
                            try {
                              event.currentTarget.showPicker?.();
                            } catch {
                              // Sin showPicker queda el ícono del campo.
                            }
                          }}
                          onChange={(e) =>
                            setCuotasManuales((prev) => prev.map((c, j) => (j === i ? { ...c, fecha: e.target.value } : c)))
                          }
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Quitar cuota ${i + 1}`}
                          disabled={cuotasManuales.length <= MIN_CUOTAS}
                          onClick={() => setCuotasManuales((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={cuotasManuales.length >= MAX_CUOTAS}
                        onClick={() =>
                          setCuotasManuales((prev) => [
                            ...prev,
                            { monto: "", fecha: prev.length > 0 && prev[prev.length - 1].fecha ? sumarMeses(prev[prev.length - 1].fecha, 1) : fechaHoyBolivia() },
                          ])
                        }
                      >
                        <CalendarRange className="h-4 w-4" /> Agregar cuota
                      </Button>
                      <span className={`text-[13px] tabular-nums ${intSumaManualCentavos === intTotalCentavos ? "text-success" : "text-destructive"}`}>
                        Suma {formatCurrency(intSumaManualCentavos / 100)} de {formatCurrency(intTotalCentavos / 100)}
                        {intSumaManualCentavos !== intTotalCentavos &&
                          ` (${intSumaManualCentavos < intTotalCentavos ? "faltan" : "sobran"} ${formatCurrency(Math.abs(intTotalCentavos - intSumaManualCentavos) / 100)})`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label htmlFor="observacionPlan" className={CLASE_LABEL_CAMPO}>Observación (opcional)</label>
                  <Input id="observacionPlan" maxLength={300} value={strObservacion} onChange={(e) => setStrObservacion(e.target.value)} placeholder="Ej. acuerdo firmado con el propietario" />
                </div>
              </>
            )}

            {strErrorNuevo && <p role="alert" className={CLASE_AVISO_ERROR}>{strErrorNuevo}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={bolCreando} onClick={() => setBolDialogoNuevo(false)}>Cancelar</Button>
              <Button type="submit" cargando={bolCreando} disabled={!strInmuebleNuevo || expensasDeuda.length === 0}>
                {bolCreando ? "Registrando..." : "Registrar plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
