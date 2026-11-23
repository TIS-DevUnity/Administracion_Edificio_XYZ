"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Eye, RefreshCw, Send } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { descargarBlob } from "@/components/nomina/nomina-utils";
import { listarInmuebles, type Inmueble } from "@/lib/inmuebles";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import {
  ETIQUETA_METODO,
  FORMATOS_COMPROBANTE,
  MAX_COMPROBANTE_BYTES,
  mensajeErrorPago,
  misPagosService,
  type EstadoPagoInformado,
  type PagoHistorial,
  type PagoInformado,
} from "@/services/misPagos.service";
import type { MetodoPago } from "@/types/finance";
import { fechaRealBolivia, formatCurrency, formatearFecha, formatearFechaCalendario } from "@/app/admin/morosidad/utils/morosidad";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
const CLASE_HEADER = "font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground";
const CLASE_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";

const ESTADO_INFORMADO: Record<EstadoPagoInformado, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: "En revisión", clase: "bg-accent-secondary/15 text-accent-secondary" },
  CONFIRMADO: { etiqueta: "Confirmado", clase: "bg-success-subtle text-success" },
  RECHAZADO: { etiqueta: "Rechazado", clase: "bg-danger-subtle text-destructive" },
};
const METODOS: MetodoPago[] = ["TRANSFERENCIA", "EFECTIVO", "TARJETA", "CHEQUE"];

function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!anio || !mes) return periodo;
  const texto = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface Formulario {
  inmuebleId: string;
  monto: string;
  metodoPago: MetodoPago | "";
  fechaPago: string;
  referencia: string;
}

/**
 * Portal del copropietario (HU14): informar un pago hecho fuera del sistema (queda en revisión hasta que la
 * administración lo confirme) y consultar el historial de pagos con sus recibos.
 */
export default function MisPagosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeInformar = puedeEjecutar(rol, "misPagos", "crear");
  const hoy = fechaRealBolivia();

  const [deptos, setDeptos] = useState<Inmueble[]>([]);
  const [deudas, setDeudas] = useState<Record<string, number>>({});
  const [cargandoDeptos, setCargandoDeptos] = useState(true);
  const [errorDeptos, setErrorDeptos] = useState("");

  const [form, setForm] = useState<Formulario>({ inmuebleId: "", monto: "", metodoPago: "", fechaPago: hoy, referencia: "" });
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [errores, setErrores] = useState<Partial<Record<keyof Formulario | "archivo", string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strPermiso, setStrPermiso] = useState("");
  // Una clave por pago: si un envío falla por la red y se reintenta, el backend no lo duplica.
  const clave = useRef(misPagosService.nuevaClave());

  const [informados, setInformados] = useState<PagoInformado[]>([]);
  const [cargandoInformados, setCargandoInformados] = useState(true);
  const [errorInformados, setErrorInformados] = useState("");
  const [intRecarga, setIntRecarga] = useState(0);

  const [deptoHistorial, setDeptoHistorial] = useState("");
  const [historial, setHistorial] = useState<PagoHistorial[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState("");

  // Departamentos del copropietario (GET /inmuebles ya devuelve solo los suyos) y su deuda como referencia.
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const lista = (await listarInmuebles()).filter((i) => i.clase === "DEPARTAMENTO");
        const saldos = await Promise.all(lista.map((i) => cuentaInmuebleService.obtenerSaldo(i.id).catch(() => null)));
        if (!activo) return;
        setDeptos(lista);
        setDeudas(Object.fromEntries(saldos.filter(Boolean).map((s) => [s!.inmueble.id, Number(s!.deudaPendiente)])));
        // ?inmuebleId= llega desde "Mi deuda"; con un solo departamento se elige solo.
        const pedido = new URLSearchParams(window.location.search).get("inmuebleId");
        const inicial = lista.find((i) => i.id === pedido)?.id ?? (lista.length === 1 ? lista[0].id : "");
        setForm((f) => ({ ...f, inmuebleId: f.inmuebleId || inicial }));
        setDeptoHistorial((d) => d || inicial || lista[0]?.id || "");
      } catch (error) {
        if (activo) setErrorDeptos(await mensajeErrorPago(error, "No se pudieron cargar tus departamentos."));
      } finally {
        if (activo) setCargandoDeptos(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoInformados(true);
    setErrorInformados("");
    misPagosService
      .listarInformados(ctrl.signal)
      .then((p) => setInformados([...p].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(async (error) => !ctrl.signal.aborted && setErrorInformados(await mensajeErrorPago(error, "No se pudieron cargar tus pagos informados.")))
      .finally(() => !ctrl.signal.aborted && setCargandoInformados(false));
    return () => ctrl.abort();
  }, [intRecarga]);

  useEffect(() => {
    if (!deptoHistorial) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoHistorial(true);
    setErrorHistorial("");
    misPagosService
      .historial(deptoHistorial, ctrl.signal)
      .then(setHistorial)
      .catch(async (error) => !ctrl.signal.aborted && setErrorHistorial(await mensajeErrorPago(error, "No se pudo cargar el historial de pagos.")))
      .finally(() => !ctrl.signal.aborted && setCargandoHistorial(false));
    return () => ctrl.abort();
  }, [deptoHistorial, intRecarga]);

  function cambiar(parcial: Partial<Formulario>) {
    setForm((f) => ({ ...f, ...parcial }));
    setErrores({});
    setErrorEnvio("");
    setStrExito("");
  }

  function elegirArchivo(nuevo: File | null) {
    setErrores({});
    setStrExito("");
    if (nuevo && !FORMATOS_COMPROBANTE.includes(nuevo.type)) {
      setErrores({ archivo: "El comprobante debe ser una imagen JPG, PNG o WEBP." });
      if (inputArchivo.current) inputArchivo.current.value = "";
      return;
    }
    if (nuevo && nuevo.size > MAX_COMPROBANTE_BYTES) {
      setErrores({ archivo: "El comprobante no puede pesar más de 5 MB." });
      if (inputArchivo.current) inputArchivo.current.value = "";
      return;
    }
    setArchivo(nuevo);
  }

  function validar(): boolean {
    const e: typeof errores = {};
    if (!form.inmuebleId) e.inmuebleId = "Elige el departamento.";
    const monto = form.monto.trim().replace(",", ".");
    if (!monto) e.monto = "Ingresa el monto pagado.";
    else if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) e.monto = "Ingresa un monto mayor que cero, con hasta 2 decimales.";
    if (!form.metodoPago) e.metodoPago = "Elige cómo pagaste.";
    if (!form.fechaPago) e.fechaPago = "Ingresa la fecha del pago.";
    else if (form.fechaPago > hoy) e.fechaPago = "La fecha del pago no puede ser futura.";
    if (form.referencia.length > 100) e.referencia = "La referencia no puede superar 100 caracteres.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function informar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validacion = validarAccion(rol, "misPagos", "crear");
    if (!validacion.permitido) {
      setStrPermiso(validacion.mensaje);
      return;
    }
    if (enviando || !validar()) return;
    setEnviando(true);
    setErrorEnvio("");
    try {
      const r = await misPagosService.informar(
        { ...form, monto: form.monto.trim().replace(",", "."), metodoPago: form.metodoPago as MetodoPago, archivo },
        clave.current
      );
      const depto = deptos.find((d) => d.id === form.inmuebleId)?.codigo ?? "";
      setStrExito(
        r.duplicado
          ? "Este pago ya estaba informado; no se registró de nuevo."
          : `Tu pago de ${formatCurrency(Number(r.pago.monto))} del departamento ${depto} fue informado. La administración lo revisará y, al confirmarlo, se descontará de tu deuda.`
      );
      clave.current = misPagosService.nuevaClave();
      setForm((f) => ({ ...f, monto: "", metodoPago: "", referencia: "", fechaPago: hoy }));
      setArchivo(null);
      if (inputArchivo.current) inputArchivo.current.value = "";
      setIntRecarga((n) => n + 1);
    } catch (error) {
      setErrorEnvio(await mensajeErrorPago(error, "No se pudo informar el pago. Intenta de nuevo."));
    } finally {
      setEnviando(false);
    }
  }

  async function verComprobante(id: string) {
    setErrorDescarga("");
    // La pestaña se abre antes del await para que el navegador no la bloquee como ventana emergente.
    const ventana = window.open("", "_blank");
    try {
      const url = await misPagosService.urlComprobante(id);
      if (ventana) ventana.location.assign(url);
      else window.location.assign(url);
    } catch (error) {
      ventana?.close();
      setErrorDescarga(await mensajeErrorPago(error, "No se pudo abrir el comprobante."));
    }
  }

  async function descargarRecibo(reciboId: string, folio: string | null) {
    setDescargando(reciboId);
    setErrorDescarga("");
    try {
      descargarBlob(await misPagosService.reciboPdf(reciboId), `recibo-${folio ?? reciboId}.pdf`);
    } catch (error) {
      setErrorDescarga(await mensajeErrorPago(error, "No se pudo descargar el recibo. Intenta de nuevo."));
    } finally {
      setDescargando(null);
    }
  }

  const codigoDe = (id: string, codigo?: string) => codigo ?? deptos.find((d) => d.id === id)?.codigo ?? "—";
  const deudaSeleccionada = form.inmuebleId ? deudas[form.inmuebleId] : undefined;

  if (!usuario) return <div className="px-4 py-6 sm:px-6"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <p className="max-w-3xl text-[13px] leading-[1.45] text-muted-foreground">
        Informa los pagos que hiciste por transferencia, depósito u otro medio, y revisa el historial de pagos de tus departamentos con sus recibos.
      </p>

      {strPermiso && <AlertaPermiso mensaje={strPermiso} />}
      {errorDeptos && <p role="alert" className={CLASE_ERROR}>{errorDeptos}</p>}

      {/* ───────── Informar un pago ───────── */}
      {bolPuedeInformar && (
        <Card className="shadow-sm">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className={CLASE_TITULO}>Informar un pago</CardTitle>
            <p className={`${CLASE_AYUDA} mt-1`}>
              El pago queda <strong>en revisión</strong> hasta que la administración lo confirme; recién ahí se descuenta de tu deuda y se genera el recibo.
            </p>
          </CardHeader>
          <CardContent className="p-5">
            {cargandoDeptos ? (
              <Skeleton className="h-40 w-full" />
            ) : deptos.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No tienes departamentos a tu cargo registrados. Comunícate con la administración.</p>
            ) : (
              <form onSubmit={informar} noValidate className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <span className={CLASE_LABEL}>Departamento *</span>
                    <Select value={form.inmuebleId} onValueChange={(v) => cambiar({ inmuebleId: v })}>
                      <SelectTrigger aria-label="Departamento" aria-invalid={Boolean(errores.inmuebleId) || undefined} className="h-9 w-full">
                        <SelectValue placeholder="Elige el departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {deptos.map((d) => <SelectItem key={d.id} value={d.id}>{d.codigo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errores.inmuebleId && <p className="text-[12px] text-destructive">{errores.inmuebleId}</p>}
                    {deudaSeleccionada !== undefined && (
                      <p className={CLASE_AYUDA}>
                        Deuda pendiente: <span className={deudaSeleccionada > 0 ? "text-destructive" : "text-success"}>{formatCurrency(deudaSeleccionada)}</span>
                        {deudaSeleccionada > 0 && (
                          <button type="button" className="ml-2 font-medium text-primary underline-offset-2 hover:underline" onClick={() => cambiar({ monto: deudaSeleccionada.toFixed(2) })}>
                            Usar este monto
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="pago-monto" className={CLASE_LABEL}>Monto pagado (Bs) *</label>
                    <Input id="pago-monto" inputMode="decimal" placeholder="0.00" className="h-9 text-right tabular-nums" value={form.monto}
                      aria-invalid={Boolean(errores.monto) || undefined} onChange={(e) => cambiar({ monto: e.target.value })} />
                    {errores.monto && <p className="text-[12px] text-destructive">{errores.monto}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={CLASE_LABEL}>Método de pago *</span>
                    <Select value={form.metodoPago} onValueChange={(v) => cambiar({ metodoPago: v as MetodoPago })}>
                      <SelectTrigger aria-label="Método de pago" aria-invalid={Boolean(errores.metodoPago) || undefined} className="h-9 w-full">
                        <SelectValue placeholder="¿Cómo pagaste?" />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS.map((m) => <SelectItem key={m} value={m}>{ETIQUETA_METODO[m]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errores.metodoPago && <p className="text-[12px] text-destructive">{errores.metodoPago}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="pago-fecha" className={CLASE_LABEL}>Fecha del pago *</label>
                    <Input id="pago-fecha" type="date" max={hoy} className="h-9" value={form.fechaPago}
                      aria-invalid={Boolean(errores.fechaPago) || undefined} onChange={(e) => cambiar({ fechaPago: e.target.value })} />
                    {errores.fechaPago && <p className="text-[12px] text-destructive">{errores.fechaPago}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="pago-referencia" className={CLASE_LABEL}>Referencia</label>
                    <Input id="pago-referencia" maxLength={100} placeholder="N.º de transacción o depósito" className="h-9" value={form.referencia}
                      onChange={(e) => cambiar({ referencia: e.target.value })} />
                    {errores.referencia && <p className="text-[12px] text-destructive">{errores.referencia}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="pago-comprobante" className={CLASE_LABEL}>Foto del comprobante</label>
                    <Input id="pago-comprobante" ref={inputArchivo} type="file" accept={FORMATOS_COMPROBANTE.join(",")} className="h-9 cursor-pointer text-[12px]"
                      onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
                    {errores.archivo ? <p className="text-[12px] text-destructive">{errores.archivo}</p> : <p className={CLASE_AYUDA}>Opcional. JPG, PNG o WEBP, hasta 5 MB. Ayuda a que lo confirmen más rápido.</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button type="submit" size="lg" className="px-4 font-medium" cargando={enviando}>
                    <Send className="h-4 w-4" /> Informar pago
                  </Button>
                  <p className={CLASE_AYUDA}>Los campos con * son obligatorios.</p>
                </div>
                {errorEnvio && <p role="alert" className={CLASE_ERROR}>{errorEnvio}</p>}
                {strExito && <p role="status" className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strExito}</p>}
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {errorDescarga && <p role="alert" className={CLASE_ERROR}>{errorDescarga}</p>}

      {/* ───────── Pagos informados ───────── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className={CLASE_TITULO}>Pagos informados</CardTitle>
            <p className={`${CLASE_AYUDA} mt-1`}>Los pagos que informaste y en qué quedó su revisión.</p>
          </div>
          <Button variant="outline" size="sm" cargando={cargandoInformados} onClick={() => setIntRecarga((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {errorInformados ? (
            <p role="alert" className="px-5 py-6 text-[13px] text-destructive">{errorInformados}</p>
          ) : cargandoInformados && informados.length === 0 ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /></div>
          ) : informados.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">Todavía no informaste ningún pago.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={CLASE_HEADER}>Fecha del pago</TableHead>
                    <TableHead className={CLASE_HEADER}>Departamento</TableHead>
                    <TableHead className={`${CLASE_HEADER} text-right`}>Monto</TableHead>
                    <TableHead className={CLASE_HEADER}>Método</TableHead>
                    <TableHead className={CLASE_HEADER}>Estado</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {informados.map((p) => {
                    const e = ESTADO_INFORMADO[p.estado];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-[13px] tabular-nums">
                          {formatearFechaCalendario(p.fechaPago)}
                          <span className="font-caption block text-[11px] text-muted-foreground">Informado el {formatearFecha(p.createdAt)}</span>
                        </TableCell>
                        <TableCell className="text-[13px]">{codigoDe(p.inmueble.id, p.inmueble.codigo)}</TableCell>
                        <TableCell className="text-right text-[13px] font-medium tabular-nums">{formatCurrency(Number(p.monto))}</TableCell>
                        <TableCell className="text-[13px]">
                          {ETIQUETA_METODO[p.metodoPago]}
                          {p.referencia && <span className="font-caption block text-[11px] text-muted-foreground">Ref. {p.referencia}</span>}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <Badge className={`font-caption text-[11px] ${e.clase}`}>{e.etiqueta}</Badge>
                          {p.estado === "RECHAZADO" && p.motivoRechazo && <span className="font-caption mt-1 block text-[11px] text-destructive">{p.motivoRechazo}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {p.tieneComprobante && (
                              <Button variant="ghost" size="xs" onClick={() => void verComprobante(p.id)}><Eye className="h-3 w-3" /> Comprobante</Button>
                            )}
                            {p.reciboId && (
                              <Button variant="ghost" size="xs" cargando={descargando === p.reciboId} onClick={() => void descargarRecibo(p.reciboId!, null)}>
                                <Download className="h-3 w-3" /> Recibo
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────── Historial de pagos ───────── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className={CLASE_TITULO}>Historial de pagos</CardTitle>
            <p className={`${CLASE_AYUDA} mt-1`}>Pagos registrados en tus expensas, del más reciente al más antiguo, con su recibo.</p>
          </div>
          {deptos.length > 1 && (
            <div className="flex w-full flex-col gap-1 sm:w-48">
              <span className={CLASE_LABEL}>Departamento</span>
              <Select value={deptoHistorial} onValueChange={setDeptoHistorial}>
                <SelectTrigger aria-label="Departamento del historial" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{deptos.map((d) => <SelectItem key={d.id} value={d.id}>{d.codigo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {errorHistorial ? (
            <p role="alert" className="px-5 py-6 text-[13px] text-destructive">{errorHistorial}</p>
          ) : cargandoDeptos || (cargandoHistorial && historial.length === 0) ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /></div>
          ) : historial.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No hay pagos registrados en este departamento.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={CLASE_HEADER}>Fecha</TableHead>
                    <TableHead className={CLASE_HEADER}>Expensa</TableHead>
                    <TableHead className={`${CLASE_HEADER} text-right`}>Monto</TableHead>
                    <TableHead className={CLASE_HEADER}>Método</TableHead>
                    <TableHead className={CLASE_HEADER}>Folio</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historial.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-[13px] tabular-nums">{formatearFecha(p.fechaPago)}</TableCell>
                      <TableCell className="text-[13px]">{p.expensa ? etiquetaPeriodo(p.expensa.periodo) : "—"}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums">
                        <span className="font-medium">{formatCurrency(Number(p.monto))}</span>
                        {Number(p.montoMora) > 0 && (
                          <span className="font-caption block text-[11px] text-muted-foreground">
                            {formatCurrency(Number(p.montoExpensa))} + <span className="text-destructive">mora {formatCurrency(Number(p.montoMora))}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[13px]">{ETIQUETA_METODO[p.metodoPago] ?? p.metodoPago}</TableCell>
                      <TableCell className="text-[13px] tabular-nums">{p.folio ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {p.reciboId && (
                          <Button variant="ghost" size="xs" cargando={descargando === p.reciboId} onClick={() => void descargarRecibo(p.reciboId!, p.folio)}>
                            <Download className="h-3 w-3" /> Recibo PDF
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
