"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Banknote,
  Download,
  FileText,
  History,
  Paperclip,
  Search,
  Wallet,
} from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Inmueble, listarInmuebles } from "@/lib/inmuebles";
import {
  FORMATOS_PERMITIDOS_COMPROBANTE,
  TAMANIO_MAXIMO_BYTES,
  listarDocumentos,
  obtenerDocumento,
  obtenerMensajeError as obtenerMensajeErrorDocumentos,
  subirDocumento,
  Documento,
} from "@/lib/documentos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { financeService } from "@/services/finance.service";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import { EstadoExpensa, MetodoPago } from "@/types/finance";
import {
  EstadoCuentaDTO,
  MovimientoSaldoDTO,
  SaldoInmuebleDTO,
  SituacionCuenta,
} from "@/types/cuentaInmueble";
import { DetalleAplicacionRecibo, generarReciboPdf } from "@/lib/reciboPago";

const CLASE_HEADER_TABLA =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO =
  "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
};

const ETIQUETA_SITUACION: Record<SituacionCuenta, string> = {
  DEBE: "Debe",
  AL_DIA: "Al día",
  A_FAVOR: "Saldo a favor",
};

const CLASE_BADGE_SITUACION: Record<SituacionCuenta, string> = {
  DEBE: "bg-danger-subtle text-destructive",
  AL_DIA: "bg-success-subtle text-success",
  A_FAVOR: "bg-accent-secondary/10 text-accent-secondary",
};

const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success",
  VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-muted text-muted-foreground",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(amount);
}

function formatearFecha(strFechaISO: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(strFechaISO)
  );
}

function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

interface CuentaInmuebleFila {
  inmueble: Inmueble;
  saldo: SaldoInmuebleDTO | null;
}

interface ResultadoRegistroPago {
  folioId: string;
  entidadComprobante: "Pago" | "MovimientoSaldo";
  inmuebleCodigo: string;
  fecha: string;
  metodoPago: MetodoPago;
  montoRecibido: number;
  referencia: string | null;
  detalle: DetalleAplicacionRecibo[];
  saldoFavorResultante: number;
}

export default function PagosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeRegistrar = puedeEjecutar(rol, "pagos", "crear");

  const [filas, setFilas] = useState<CuentaInmuebleFila[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");

  // Diálogo: registrar pago
  const [bolDialogoPago, setBolDialogoPago] = useState(false);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<SaldoInmuebleDTO | null>(null);
  const [strInmuebleElegido, setStrInmuebleElegido] = useState("");
  const [strMontoPago, setStrMontoPago] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago | "">("");
  const [strReferenciaPago, setStrReferenciaPago] = useState("");
  const [strErrorPago, setStrErrorPago] = useState("");
  const [bolRegistrando, setBolRegistrando] = useState(false);
  const [resultadoRegistro, setResultadoRegistro] = useState<ResultadoRegistroPago | null>(null);

  // Comprobante (dentro del diálogo de registro, tras confirmar)
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(null);
  const [bolSubiendoComprobante, setBolSubiendoComprobante] = useState(false);
  const [strErrorComprobante, setStrErrorComprobante] = useState("");
  const [documentoComprobante, setDocumentoComprobante] = useState<Documento | null>(null);

  // Diálogo: ver cuenta (estado de cuenta / historial)
  const [bolDialogoCuenta, setBolDialogoCuenta] = useState(false);
  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuentaDTO | null>(null);
  const [bolCargandoCuenta, setBolCargandoCuenta] = useState(false);
  const [strErrorCuenta, setStrErrorCuenta] = useState("");
  const [expensaExpandida, setExpensaExpandida] = useState<string | null>(null);

  async function cargarCuentas() {
    try {
      setIsLoading(true);
      const inmuebles = await listarInmuebles();
      const saldos = await Promise.all(
        inmuebles.map((inmueble) =>
          cuentaInmuebleService.obtenerSaldo(inmueble.id).catch(() => null)
        )
      );
      setFilas(inmuebles.map((inmueble, i) => ({ inmueble, saldo: saldos[i] })));
    } catch (error) {
      console.error("Error al cargar cuentas de inmuebles:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarCuentas();
  }, []);

  const filasFiltradas = filas.filter((fila) =>
    fila.inmueble.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totales = useMemo(() => {
    let intConDeuda = 0;
    let totalDeuda = 0;
    let totalSaldoFavor = 0;
    filas.forEach((fila) => {
      if (!fila.saldo) return;
      if (fila.saldo.situacion === "DEBE") intConDeuda += 1;
      totalDeuda += Number(fila.saldo.deudaPendiente);
      totalSaldoFavor += Number(fila.saldo.saldoFavor);
    });
    return { intConDeuda, totalDeuda, totalSaldoFavor };
  }, [filas]);

  function limpiarFormularioPago() {
    setStrMontoPago("");
    setMetodoPago("");
    setStrReferenciaPago("");
    setStrErrorPago("");
    setResultadoRegistro(null);
    setArchivoComprobante(null);
    setStrErrorComprobante("");
    setDocumentoComprobante(null);
  }

  function abrirDialogoPago(fila?: CuentaInmuebleFila) {
    const objValidacion = validarAccion(rol, "pagos", "crear");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    limpiarFormularioPago();
    setCuentaSeleccionada(fila?.saldo ?? null);
    setStrInmuebleElegido(fila?.inmueble.id ?? "");
    setBolDialogoPago(true);
  }

  function cerrarDialogoPago() {
    setBolDialogoPago(false);
    setCuentaSeleccionada(null);
    setStrInmuebleElegido("");
    limpiarFormularioPago();
  }

  async function handleSeleccionarInmuebleEnDialogo(inmuebleId: string) {
    setStrInmuebleElegido(inmuebleId);
    setStrErrorPago("");
    const filaExistente = filas.find((f) => f.inmueble.id === inmuebleId);
    if (filaExistente?.saldo) {
      setCuentaSeleccionada(filaExistente.saldo);
      return;
    }
    try {
      const saldo = await cuentaInmuebleService.obtenerSaldo(inmuebleId);
      setCuentaSeleccionada(saldo);
    } catch (error) {
      setStrErrorPago(obtenerMensajeError(error, "No se pudo cargar la cuenta del inmueble."));
    }
  }

  async function handleConfirmarPago() {
    if (!cuentaSeleccionada) {
      setStrErrorPago("Selecciona el inmueble que va a pagar.");
      return;
    }
    const monto = Number(strMontoPago);
    if (!strMontoPago || Number.isNaN(monto) || monto <= 0) {
      setStrErrorPago("Ingresa un monto válido, mayor a cero.");
      return;
    }
    if (!metodoPago) {
      setStrErrorPago("Selecciona un método de pago.");
      return;
    }

    setBolRegistrando(true);
    setStrErrorPago("");

    try {
      const cuenta = cuentaSeleccionada;
      const referencia = strReferenciaPago.trim() || undefined;

      if (cuenta.expensasPendientes.length === 0) {
        const resultado = await cuentaInmuebleService.registrarPagoAnticipado(cuenta.inmueble.id, {
          monto,
          metodoPago,
          referencia,
        });
        setResultadoRegistro({
          folioId: resultado.movimiento.id,
          entidadComprobante: "MovimientoSaldo",
          inmuebleCodigo: cuenta.inmueble.codigo,
          fecha: resultado.movimiento.createdAt,
          metodoPago,
          montoRecibido: monto,
          referencia: referencia ?? null,
          detalle: [],
          saldoFavorResultante: Number(resultado.saldoFavor),
        });
      } else {
        const primera = cuenta.expensasPendientes[0];
        const resultadoPago = await financeService.registrarPago(primera.id, {
          monto,
          metodoPago,
          referencia,
        });

        const detalle: DetalleAplicacionRecibo[] = [
          {
            periodo: resultadoPago.expensa.periodo,
            montoAplicado: Number(resultadoPago.montoAplicado),
            estadoResultante: resultadoPago.expensa.estado,
          },
        ];

        let saldoDisponible = Number(resultadoPago.saldoFavorGenerado);

        for (let i = 1; i < cuenta.expensasPendientes.length && saldoDisponible > 0; i++) {
          const siguiente = cuenta.expensasPendientes[i];
          try {
            const resultadoSaldo = await financeService.aplicarSaldoFavor(siguiente.id);
            const aplicado = Number(resultadoSaldo.saldoFavorAplicado);
            if (aplicado <= 0) break;
            detalle.push({
              periodo: resultadoSaldo.expensa.periodo,
              montoAplicado: aplicado,
              estadoResultante: resultadoSaldo.expensa.estado,
            });
            saldoDisponible -= aplicado;
          } catch {
            break;
          }
        }

        setResultadoRegistro({
          folioId: resultadoPago.pago?.id ?? resultadoPago.expensa.id,
          entidadComprobante: "Pago",
          inmuebleCodigo: cuenta.inmueble.codigo,
          fecha: resultadoPago.pago?.fechaPago ?? new Date().toISOString(),
          metodoPago,
          montoRecibido: Number(resultadoPago.montoRecibido),
          referencia: referencia ?? null,
          detalle,
          saldoFavorResultante: Math.max(saldoDisponible, 0),
        });
      }

      setStrExito("Pago registrado exitosamente.");
      await cargarCuentas();
    } catch (error) {
      setStrErrorPago(obtenerMensajeError(error, "Ocurrió un error al registrar el pago."));
    } finally {
      setBolRegistrando(false);
    }
  }

  function handleDescargarRecibo() {
    if (!resultadoRegistro) return;
    generarReciboPdf({
      folio: resultadoRegistro.folioId,
      inmuebleCodigo: resultadoRegistro.inmuebleCodigo,
      fecha: resultadoRegistro.fecha,
      metodoPago: resultadoRegistro.metodoPago,
      montoRecibido: resultadoRegistro.montoRecibido,
      referencia: resultadoRegistro.referencia,
      detalle: resultadoRegistro.detalle,
      saldoFavorResultante: resultadoRegistro.saldoFavorResultante,
    });
  }

  async function handleSubirComprobante() {
    if (!resultadoRegistro || !archivoComprobante) return;

    if (!FORMATOS_PERMITIDOS_COMPROBANTE[archivoComprobante.type]) {
      setStrErrorComprobante(
        `Formato no permitido. Formatos aceptados: ${Object.values(FORMATOS_PERMITIDOS_COMPROBANTE).join(", ")}.`
      );
      return;
    }
    if (archivoComprobante.size > TAMANIO_MAXIMO_BYTES) {
      setStrErrorComprobante("El archivo supera el tamaño máximo permitido de 10 MB.");
      return;
    }

    setBolSubiendoComprobante(true);
    setStrErrorComprobante("");

    try {
      const formData = new FormData();
      formData.append("archivo", archivoComprobante);
      formData.append("categoria", "OTRO");
      formData.append("entidad", resultadoRegistro.entidadComprobante);
      formData.append("entidadId", resultadoRegistro.folioId);

      const documento = await subirDocumento(formData);
      setDocumentoComprobante(documento);
    } catch (error) {
      setStrErrorComprobante(
        obtenerMensajeErrorDocumentos(error, "Ocurrió un error al adjuntar el comprobante.")
      );
    } finally {
      setBolSubiendoComprobante(false);
    }
  }

  async function abrirDialogoCuenta(fila: CuentaInmuebleFila) {
    setBolDialogoCuenta(true);
    setBolCargandoCuenta(true);
    setStrErrorCuenta("");
    setExpensaExpandida(null);
    try {
      const resultado = await cuentaInmuebleService.obtenerEstadoCuenta(fila.inmueble.id);
      setEstadoCuenta(resultado);
    } catch (error) {
      setStrErrorCuenta(obtenerMensajeError(error, "No se pudo cargar el estado de cuenta."));
    } finally {
      setBolCargandoCuenta(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Registro de pagos regulares y anticipados por inmueble. El monto se aplica primero a la
          deuda más antigua; el excedente queda como saldo a favor para la siguiente expensa.
        </p>

        {bolPuedeRegistrar && (
          <Button className="w-full md:w-auto" onClick={() => abrirDialogoPago()}>
            <Banknote className="mr-2 h-4 w-4" />
            Registrar pago
          </Button>
        )}
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}
      {strExito && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-300 mb-4 rounded-lg border border-success/20 bg-success-subtle px-3.5 py-2.5 text-[13px] text-success">
          {strExito}
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Inmuebles con deuda</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              {totales.intConDeuda}
            </h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Deuda pendiente total</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-destructive">
              {formatCurrency(totales.totalDeuda)}
            </h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Saldo a favor total</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-accent-secondary">
              {formatCurrency(totales.totalSaldoFavor)}
            </h3>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Cuentas por inmueble
          </CardTitle>

          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Inmueble</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Tipo</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Deuda pendiente</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Saldo a favor</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-center`}>Situación</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filasFiltradas.map((fila) => (
                      <TableRow key={fila.inmueble.id}>
                        <TableCell className="text-[13px] font-medium text-foreground">
                          {fila.inmueble.codigo}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {fila.inmueble.tipoInmueble.nombre}
                        </TableCell>
                        <TableCell className="text-right text-[13px] text-foreground">
                          {fila.saldo ? formatCurrency(Number(fila.saldo.deudaPendiente)) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-[13px] text-foreground">
                          {fila.saldo ? formatCurrency(Number(fila.saldo.saldoFavor)) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {fila.saldo && (
                            <Badge className={`font-caption text-[11px] ${CLASE_BADGE_SITUACION[fila.saldo.situacion]}`}>
                              {ETIQUETA_SITUACION[fila.saldo.situacion]}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => abrirDialogoCuenta(fila)}>
                              <History className="mr-2 h-4 w-4" />
                              Ver cuenta
                            </Button>
                            {bolPuedeRegistrar && (
                              <Button variant="ghost" size="sm" onClick={() => abrirDialogoPago(fila)}>
                                <Wallet className="mr-2 h-4 w-4" />
                                Registrar pago
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filasFiltradas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-[13px] text-muted-foreground">
                          No hay inmuebles que coincidan con la búsqueda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 p-4 md:hidden">
                {filasFiltradas.map((fila) => (
                  <div key={fila.inmueble.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-subtitle text-[14px] font-semibold leading-[1.4] text-foreground">
                          {fila.inmueble.codigo}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {fila.inmueble.tipoInmueble.nombre}
                        </p>
                      </div>
                      {fila.saldo && (
                        <Badge className={`font-caption text-[11px] ${CLASE_BADGE_SITUACION[fila.saldo.situacion]}`}>
                          {ETIQUETA_SITUACION[fila.saldo.situacion]}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <p className={CLASE_LABEL_CAMPO}>Deuda pendiente</p>
                        <p className="text-[13px] text-foreground">
                          {fila.saldo ? formatCurrency(Number(fila.saldo.deudaPendiente)) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className={CLASE_LABEL_CAMPO}>Saldo a favor</p>
                        <p className="text-[13px] text-foreground">
                          {fila.saldo ? formatCurrency(Number(fila.saldo.saldoFavor)) : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-1 border-t border-border pt-3">
                      <Button variant="outline" size="sm" onClick={() => abrirDialogoCuenta(fila)}>
                        <History className="mr-2 h-4 w-4" />
                        Ver cuenta
                      </Button>
                      {bolPuedeRegistrar && (
                        <Button variant="outline" size="sm" onClick={() => abrirDialogoPago(fila)}>
                          <Wallet className="mr-2 h-4 w-4" />
                          Pagar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {filasFiltradas.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    No hay inmuebles que coincidan con la búsqueda.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Diálogo: registrar pago */}
      <Dialog open={bolDialogoPago} onOpenChange={(bolOpen) => !bolOpen && cerrarDialogoPago()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>
              {resultadoRegistro ? "Pago registrado" : "Registrar pago"}
            </DialogTitle>
            {!resultadoRegistro && (
              <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
                El monto ingresado se aplica primero a la deuda más antigua del inmueble.
              </DialogDescription>
            )}
          </DialogHeader>

          {!resultadoRegistro ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-1">
                <label className="text-[12px] font-medium text-foreground">Inmueble</label>
                <Select value={strInmuebleElegido} onValueChange={handleSeleccionarInmuebleEnDialogo}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un inmueble..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filas.map((fila) => (
                      <SelectItem key={fila.inmueble.id} value={fila.inmueble.id}>
                        {fila.inmueble.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cuentaSeleccionada && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className={CLASE_LABEL_CAMPO}>Deuda pendiente</p>
                    <Badge className={`font-caption text-[11px] ${CLASE_BADGE_SITUACION[cuentaSeleccionada.situacion]}`}>
                      {ETIQUETA_SITUACION[cuentaSeleccionada.situacion]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[16px] font-semibold text-foreground">
                    {formatCurrency(Number(cuentaSeleccionada.deudaPendiente))}
                  </p>
                  {Number(cuentaSeleccionada.saldoFavor) > 0 && (
                    <p className="mt-1 text-[12px] text-accent-secondary">
                      Saldo a favor disponible: {formatCurrency(Number(cuentaSeleccionada.saldoFavor))}
                    </p>
                  )}

                  {cuentaSeleccionada.expensasPendientes.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                      {cuentaSeleccionada.expensasPendientes.map((exp, idx) => (
                        <div key={exp.id} className="flex items-center justify-between text-[12px]">
                          <span className="text-muted-foreground">
                            {idx === 0 ? "Deuda más antigua · " : ""}
                            Periodo {exp.periodo}
                          </span>
                          <span className="font-medium text-foreground">{formatCurrency(Number(exp.pendiente))}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 border-t border-border pt-2 text-[12px] text-muted-foreground">
                      No tiene deudas pendientes. El monto se registrará como pago anticipado (saldo a favor).
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-1">
                <label htmlFor="montoPago" className="text-[12px] font-medium text-foreground">
                  Monto
                </label>
                <Input
                  id="montoPago"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={strMontoPago}
                  onChange={(event) => setStrMontoPago(event.target.value)}
                />
              </div>

              <div className="grid gap-1">
                <label htmlFor="metodoPago" className="text-[12px] font-medium text-foreground">
                  Método de pago
                </label>
                <Select value={metodoPago} onValueChange={(val: MetodoPago) => setMetodoPago(val)}>
                  <SelectTrigger id="metodoPago" className="w-full">
                    <SelectValue placeholder="Selecciona un método..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ETIQUETA_METODO_PAGO) as MetodoPago[]).map((metodo) => (
                      <SelectItem key={metodo} value={metodo}>
                        {ETIQUETA_METODO_PAGO[metodo]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <label htmlFor="referenciaPago" className="text-[12px] font-medium text-foreground">
                  Referencia <span className="text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  id="referenciaPago"
                  placeholder="Comprobante 00123"
                  value={strReferenciaPago}
                  onChange={(event) => setStrReferenciaPago(event.target.value)}
                />
              </div>

              <p className="font-caption text-[11px] leading-[1.4] text-muted-foreground">
                La fecha de pago se registra automáticamente con la fecha y hora actuales del
                sistema; todavía no es posible elegir una fecha distinta.
              </p>

              {strErrorPago && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorPago}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrarDialogoPago} disabled={bolRegistrando}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleConfirmarPago} disabled={bolRegistrando}>
                  {bolRegistrando ? "Registrando..." : "Confirmar pago"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-success/20 bg-success-subtle px-3.5 py-2.5 text-[13px] text-success">
                Pago registrado exitosamente para {resultadoRegistro.inmuebleCodigo}.
              </div>

              <div className="rounded-lg bg-muted/30 p-3">
                <p className={CLASE_LABEL_CAMPO}>Monto recibido</p>
                <p className="mt-1 text-[16px] font-semibold text-foreground">
                  {formatCurrency(resultadoRegistro.montoRecibido)}
                </p>

                {resultadoRegistro.detalle.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                    {resultadoRegistro.detalle.map((linea) => (
                      <div key={linea.periodo} className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Periodo {linea.periodo}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(linea.montoAplicado)} ·{" "}
                          <Badge className={`font-caption text-[10px] ${CLASE_BADGE_ESTADO[linea.estadoResultante as EstadoExpensa]}`}>
                            {linea.estadoResultante}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {resultadoRegistro.saldoFavorResultante > 0 && (
                  <p className="mt-2 border-t border-border pt-2 text-[12px] text-accent-secondary">
                    Saldo a favor resultante: {formatCurrency(resultadoRegistro.saldoFavorResultante)}
                  </p>
                )}
              </div>

              <Button type="button" variant="outline" onClick={handleDescargarRecibo}>
                <Download className="mr-2 h-4 w-4" />
                Descargar recibo (PDF)
              </Button>

              <div className="rounded-lg border border-border p-3">
                <p className={CLASE_LABEL_CAMPO}>Comprobante de pago (opcional)</p>
                {documentoComprobante ? (
                  <p className="mt-2 text-[13px] text-success">
                    Comprobante &quot;{documentoComprobante.nombre}&quot; adjuntado correctamente.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(event) => setArchivoComprobante(event.target.files?.[0] ?? null)}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none"
                    />
                    {strErrorComprobante && (
                      <p className="text-[12px] text-destructive">{strErrorComprobante}</p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSubirComprobante}
                      disabled={!archivoComprobante || bolSubiendoComprobante}
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      {bolSubiendoComprobante ? "Subiendo..." : "Adjuntar foto del comprobante"}
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" onClick={cerrarDialogoPago}>
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: ver cuenta / historial */}
      <Dialog open={bolDialogoCuenta} onOpenChange={setBolDialogoCuenta}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>
              Estado de cuenta {estadoCuenta ? `· ${estadoCuenta.inmueble.codigo}` : ""}
            </DialogTitle>
          </DialogHeader>

          {bolCargandoCuenta && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!bolCargandoCuenta && strErrorCuenta && (
            <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              {strErrorCuenta}
            </p>
          )}

          {!bolCargandoCuenta && estadoCuenta && (
            <div className="flex max-h-[480px] flex-col gap-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-4">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Facturado</p>
                  <p className="text-[13px] font-medium text-foreground">
                    {formatCurrency(Number(estadoCuenta.resumen.totalFacturado))}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Pagado</p>
                  <p className="text-[13px] font-medium text-foreground">
                    {formatCurrency(Number(estadoCuenta.resumen.totalPagado))}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Pendiente</p>
                  <p className="text-[13px] font-medium text-destructive">
                    {formatCurrency(Number(estadoCuenta.resumen.deudaPendiente))}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Saldo a favor</p>
                  <p className="text-[13px] font-medium text-accent-secondary">
                    {formatCurrency(Number(estadoCuenta.resumen.saldoFavor))}
                  </p>
                </div>
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Expensas</p>
                <div className="flex flex-col gap-2">
                  {estadoCuenta.expensas.map((exp) => (
                    <div key={exp.id} className="rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setExpensaExpandida(expensaExpandida === exp.id ? null : exp.id)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">Periodo {exp.periodo}</span>
                          <Badge className={`font-caption text-[10px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                            {exp.estado}
                          </Badge>
                        </div>
                        <span className="text-[13px] text-muted-foreground">
                          Pendiente: {formatCurrency(Number(exp.pendiente))}
                        </span>
                      </button>

                      {expensaExpandida === exp.id && (
                        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
                          {exp.pagos.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">Sin pagos registrados.</p>
                          ) : (
                            exp.pagos.map((pago) => (
                              <div key={pago.id} className="flex items-center justify-between text-[12px]">
                                <span className="text-muted-foreground">
                                  {formatearFecha(pago.fechaPago)} ·{" "}
                                  {ETIQUETA_METODO_PAGO[pago.metodoPago as MetodoPago] ?? pago.metodoPago}
                                  {pago.referencia ? ` · ${pago.referencia}` : ""}
                                </span>
                                <span className="font-medium text-foreground">
                                  {formatCurrency(Number(pago.monto))}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {estadoCuenta.expensas.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">Este inmueble no tiene expensas generadas.</p>
                  )}
                </div>
              </div>

              {estadoCuenta.movimientosSaldo.length > 0 && (
                <div>
                  <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Movimientos de saldo a favor</p>
                  <div className="flex flex-col gap-1.5">
                    {estadoCuenta.movimientosSaldo.map((mov) => (
                      <MovimientoSaldoFila key={mov.id} movimiento={mov} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setBolDialogoCuenta(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovimientoSaldoFila({ movimiento }: { movimiento: MovimientoSaldoDTO }) {
  const [strErrorComprobante, setStrErrorComprobante] = useState("");

  async function verComprobante() {
    setStrErrorComprobante("");
    try {
      const documentos = await listarDocumentos({ entidad: "MovimientoSaldo", entidadId: movimiento.id });
      if (documentos[0]) {
        const { url } = await obtenerDocumento(documentos[0].id);
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setStrErrorComprobante("Este movimiento no tiene comprobante adjunto.");
      }
    } catch {
      setStrErrorComprobante("No se pudo consultar el comprobante.");
    }
  }

  const esAbono = movimiento.tipo !== "APLICACION_EXPENSA";
  const monto = Number(movimiento.monto);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground">
            {movimiento.tipo === "PAGO_ANTICIPADO" && "Pago anticipado"}
            {movimiento.tipo === "EXCESO_PAGO" && "Exceso de pago"}
            {movimiento.tipo === "APLICACION_EXPENSA" && "Aplicado a una expensa"}
          </p>
          <p className="text-muted-foreground">{formatearFecha(movimiento.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${esAbono ? "text-success" : "text-muted-foreground"}`}>
            {esAbono ? "+" : ""}
            {formatCurrency(monto)}
          </span>
          {esAbono && (
            <Button variant="ghost" size="icon-sm" title="Ver comprobante" onClick={verComprobante}>
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {strErrorComprobante && <p className="text-[11px] text-muted-foreground">{strErrorComprobante}</p>}
    </div>
  );
}
