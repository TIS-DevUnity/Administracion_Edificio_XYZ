"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Banknote,
  Download,
  History,
  Paperclip,
  Search,
  Wallet,
} from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { DialogoEstadoCuenta } from "@/components/DialogoEstadoCuenta";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Inmueble, listarInmuebles } from "@/lib/inmuebles";
import {
  FORMATOS_PERMITIDOS_COMPROBANTE,
  TAMANIO_MAXIMO_BYTES,
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
import { EstadoExpensa, ExpensaDTO, MetodoPago } from "@/types/finance";
import { SaldoInmuebleDTO, SituacionCuenta } from "@/types/cuentaInmueble";
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

function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

interface CuentaInmuebleFila {
  inmueble: Inmueble;
  // Calculado en el cliente a partir de UNA sola consulta masiva (getExpensas()),
  // no de un GET /saldo por inmueble — ver nota en cargarCuentas(). No incluye
  // saldo a favor (ese sí vive en una tabla aparte, sin endpoint masivo): se
  // consulta al vuelo, un solo inmueble a la vez, recién cuando hace falta
  // (abrir "Registrar pago" o "Ver cuenta" de ESE inmueble).
  deudaPendiente: number;
  /** Lo que falta de las expensas (tarifa fija + agua), sin recargos. */
  deudaSinMora: number;
  moraPendiente: number;
  tieneExpensasVencidas: boolean;
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
  const [strInmuebleCuentaId, setStrInmuebleCuentaId] = useState<string | null>(null);

  // Mismo cálculo que el backend (saldo.util.js → pendientesDe): cada pago guarda cuánto fue a
  // la expensa y cuánto a la mora, así que ambos pendientes se restan por separado.
  function deudaDeExpensa(exp: ExpensaDTO): { sinMora: number; mora: number } {
    if (exp.estado === "PAGADA") return { sinMora: 0, mora: 0 };
    const pagos = exp.pagos ?? [];
    const pagadoExpensa = pagos.reduce((acc, pago) => acc + Number(pago.montoExpensa ?? 0), 0);
    const pagadoMora = pagos.reduce((acc, pago) => acc + Number(pago.montoMora ?? 0), 0);
    return {
      sinMora: Math.max(Number(exp.montoTotal) - pagadoExpensa, 0),
      mora: Math.max(Number(exp.montoMora || 0) - pagadoMora, 0),
    };
  }

  async function cargarCuentas() {
    try {
      setIsLoading(true);
      // Antes esto hacía 1 GET /saldo POR CADA inmueble (N+1: con 100 inmuebles,
      // 100 consultas en paralelo, cada una con sus propias queries a la base).
      // Reportado por DevOps como el cuello de botella de esta pantalla. Ahora son
      // solo 2 consultas en total: la lista de inmuebles y TODAS las expensas (que
      // ya traen sus pagos anidados), y la deuda por inmueble se agrupa en memoria.
      const [inmuebles, expensas] = await Promise.all([listarInmuebles(), financeService.getExpensas()]);

      const deudaPorInmueble = new Map<string, { sinMora: number; mora: number }>();
      const vencidaPorInmueble = new Set<string>();
      expensas.forEach((exp) => {
        const deuda = deudaDeExpensa(exp);
        const acumulado = deudaPorInmueble.get(exp.inmuebleId) ?? { sinMora: 0, mora: 0 };
        deudaPorInmueble.set(exp.inmuebleId, {
          sinMora: acumulado.sinMora + deuda.sinMora,
          mora: acumulado.mora + deuda.mora,
        });
        if (exp.estado === "VENCIDA") vencidaPorInmueble.add(exp.inmuebleId);
      });

      setFilas(
        inmuebles.map((inmueble) => {
          const deuda = deudaPorInmueble.get(inmueble.id) ?? { sinMora: 0, mora: 0 };
          return {
            inmueble,
            deudaSinMora: deuda.sinMora,
            moraPendiente: deuda.mora,
            deudaPendiente: deuda.sinMora + deuda.mora,
            tieneExpensasVencidas: vencidaPorInmueble.has(inmueble.id),
          };
        })
      );
    } catch (error) {
      console.error("Error al cargar cuentas de inmuebles:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarCuentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filasFiltradas = filas.filter((fila) =>
    fila.inmueble.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totales = useMemo(() => {
    let intConDeuda = 0;
    let totalSinMora = 0;
    let totalMora = 0;
    filas.forEach((fila) => {
      if (fila.deudaPendiente > 0) intConDeuda += 1;
      totalSinMora += fila.deudaSinMora;
      totalMora += fila.moraPendiente;
    });
    return { intConDeuda, totalSinMora, totalMora, totalDeuda: totalSinMora + totalMora };
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
    setStrInmuebleElegido(fila?.inmueble.id ?? "");
    setBolDialogoPago(true);
    if (fila) {
      void handleSeleccionarInmuebleEnDialogo(fila.inmueble.id);
    }
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
    setCuentaSeleccionada(null);
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

  function abrirDialogoCuenta(fila: CuentaInmuebleFila) {
    setStrInmuebleCuentaId(fila.inmueble.id);
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
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Inmuebles con deuda</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-accent-secondary">
              {totales.intConDeuda}
            </h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Deuda sin mora</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-foreground">
              {formatCurrency(totales.totalSinMora)}
            </h3>
            <p className="font-caption mt-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
              Tarifa fija + agua pendientes
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Mora pendiente</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-destructive">
              {formatCurrency(totales.totalMora)}
            </h3>
            <p className="font-caption mt-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
              Recargos por atraso
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Total con mora</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-destructive">
              {formatCurrency(totales.totalDeuda)}
            </h3>
            <p className="font-caption mt-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
              Deuda sin mora + mora pendiente
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="font-caption -mt-3 mb-6 text-[11px] text-muted-foreground">
        El saldo a favor de cada inmueble se consulta al abrir &quot;Registrar pago&quot; o
        &quot;Ver cuenta&quot;, para no tener que calcularlo de todos a la vez.
      </p>

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
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Deuda sin mora</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Mora</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total con mora</TableHead>
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
                        <TableCell className="text-right text-[13px] tabular-nums text-foreground">
                          {formatCurrency(fila.deudaSinMora)}
                        </TableCell>
                        <TableCell
                          className={`text-right text-[13px] tabular-nums ${
                            fila.moraPendiente > 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {fila.moraPendiente > 0 ? formatCurrency(fila.moraPendiente) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-[13px] font-medium tabular-nums text-foreground">
                          {formatCurrency(fila.deudaPendiente)}
                        </TableCell>
                        <TableCell className="text-center">
                          <BadgeSituacionFila fila={fila} />
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
                        <TableCell colSpan={7} className="py-8 text-center text-[13px] text-muted-foreground">
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
                      <BadgeSituacionFila fila={fila} />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className={CLASE_LABEL_CAMPO}>Sin mora</p>
                        <p className="text-[13px] tabular-nums text-foreground">{formatCurrency(fila.deudaSinMora)}</p>
                      </div>
                      <div>
                        <p className={CLASE_LABEL_CAMPO}>Mora</p>
                        <p
                          className={`text-[13px] tabular-nums ${
                            fila.moraPendiente > 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {fila.moraPendiente > 0 ? formatCurrency(fila.moraPendiente) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className={CLASE_LABEL_CAMPO}>Con mora</p>
                        <p className="text-[13px] font-medium tabular-nums text-foreground">
                          {formatCurrency(fila.deudaPendiente)}
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
                  <p className="font-title mt-1 text-[20px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-foreground">
                    {formatCurrency(Number(cuentaSeleccionada.deudaPendiente))}
                  </p>
                  {(() => {
                    const intSinMora = cuentaSeleccionada.expensasPendientes.reduce(
                      (acc, exp) => acc + Number(exp.pendienteExpensa ?? exp.pendiente),
                      0
                    );
                    const intMora = cuentaSeleccionada.expensasPendientes.reduce(
                      (acc, exp) => acc + Number(exp.pendienteMora ?? 0),
                      0
                    );
                    return (
                      <div className="mt-2 flex flex-col gap-1 text-[12px] tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total sin mora (tarifa fija + agua)</span>
                          <span className="text-foreground">{formatCurrency(intSinMora)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mora</span>
                          <span className={intMora > 0 ? "text-destructive" : "text-muted-foreground"}>
                            {formatCurrency(intMora)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-1 font-medium">
                          <span className="text-foreground">Total con mora</span>
                          <span className="text-foreground">{formatCurrency(intSinMora + intMora)}</span>
                        </div>
                      </div>
                    );
                  })()}
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
                          <span className="text-right tabular-nums">
                            <span className="font-medium text-foreground">{formatCurrency(Number(exp.pendiente))}</span>
                            {Number(exp.pendienteMora ?? 0) > 0 && (
                              <span className="font-caption block text-[11px] text-muted-foreground">
                                {formatCurrency(Number(exp.pendienteExpensa ?? 0))} +{" "}
                                <span className="text-destructive">mora {formatCurrency(Number(exp.pendienteMora))}</span>
                              </span>
                            )}
                          </span>
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
                <Button type="button" onClick={handleConfirmarPago} cargando={bolRegistrando}>
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
                      cargando={bolSubiendoComprobante}
                      disabled={!archivoComprobante}
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

      <DialogoEstadoCuenta strInmuebleId={strInmuebleCuentaId} onCerrar={() => setStrInmuebleCuentaId(null)} />
    </div>
  );
}

// Situación aproximada a partir de datos ya cargados en bloque (sin saldo a favor,
// que requiere una consulta por inmueble — ver CuentaInmuebleFila). "Ver cuenta"
// muestra la situación exacta, incluyendo saldo a favor, para ese inmueble puntual.
function BadgeSituacionFila({ fila }: { fila: CuentaInmuebleFila }) {
  if (fila.deudaPendiente <= 0) {
    return <Badge className="font-caption bg-success-subtle text-[11px] text-success">Al día</Badge>;
  }
  if (fila.tieneExpensasVencidas) {
    return <Badge className="font-caption bg-danger-subtle text-[11px] text-destructive">Vencida</Badge>;
  }
  return <Badge className="font-caption bg-danger-subtle text-[11px] text-destructive">Debe</Badge>;
}
