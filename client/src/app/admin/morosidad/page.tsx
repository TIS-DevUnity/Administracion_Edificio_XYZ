"use client";

import React, { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider";
import { TablaExpensas } from "./components/TablaExpensas";
import { ResumenMorosidad } from "./components/ResumenMorosidad";
import { formatCurrency, formatearFecha, formatearFechaCalendario, fechaHoyBolivia, fechaEnBolivia, estaEnPeriodoGracia, periodoActual, tieneMoraAplicada, resumenSaldo, calcularSaldoPendiente, obtenerMensajeError } from "./utils/morosidad";
import axios from "axios";
import {
  CalendarClock,
  CalendarPlus,
  CalendarDays,
  UserRound,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Save,
} from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { listarInmuebles } from "@/lib/inmuebles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { financeService } from "@/services/finance.service";
import {
  EstadoExpensa,
  ExpensaDTO,
  MetodoPago,
  TipoValorMora,
  ResultadoGeneracionDTO,
  TipoInmuebleDTO,
  DetalleFacturaAguaDTO,
} from "@/types/finance";

const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success", VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground", PARCIAL: "bg-muted text-muted-foreground",
};
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

const EXPENSAS_VACIAS: ExpensaDTO[] = [];

function ContenidoMorosidad() {
  const searchParams = useSearchParams();
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeGestionar = puedeEjecutar(rol, "morosidad", "editar");

  const [detalleAgua, setDetalleAgua] = useState<DetalleFacturaAguaDTO | null>(null);
  const [periodoAgua, setPeriodoAgua] = useState(periodoActual());
  const [montoFactura, setMontoFactura] = useState("");
  const [errorAgua, setErrorAgua] = useState("");
  const [guardandoAgua, setGuardandoAgua] = useState(false);
  const [viendoAgua, setViendoAgua] = useState(false);
  const [tipoEditando, setTipoEditando] = useState<TipoInmuebleDTO | null>(null);
  const [dialogTipoAbierto, setDialogTipoAbierto] = useState(false);
  const [nombreTipo, setNombreTipo] = useState("");
  const [tarifaTipo, setTarifaTipo] = useState("");
  const [pesoTipo, setPesoTipo] = useState("1");
  const [errorTipo, setErrorTipo] = useState("");
  const [guardandoTipo, setGuardandoTipo] = useState(false);


  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [filtroInmuebleId, setFiltroInmuebleId] = useState("");
  // Un solo selector de mes; inicialmente muestra el mes actual.
  const [filtroPeriodo, setFiltroPeriodo] = useState(periodoActual());
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  // Revisión manual de mora / generación manual del mes
  const [bolRevisandoMora, setBolRevisandoMora] = useState(false);
  const [bolGenerandoMes, setBolGenerandoMes] = useState(false);
  const [strErrorAccion, setStrErrorAccion] = useState("");
  const [resultadoGeneracion, setResultadoGeneracion] = useState<ResultadoGeneracionDTO | null>(null);
  const [expensaVencimiento, setExpensaVencimiento] = useState<ExpensaDTO | null>(null);
  const [nuevaFechaVencimiento, setNuevaFechaVencimiento] = useState("");
  const [motivoVencimiento, setMotivoVencimiento] = useState("");
  const [guardandoVencimiento, setGuardandoVencimiento] = useState(false);
  const [errorVencimiento, setErrorVencimiento] = useState("");

  // Configuración de mora
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [strErrorConfig, setStrErrorConfig] = useState("");
  const [formData, setFormData] = useState<{
    // "" mientras el campo está vacío (el usuario borrando para escribir de
    // nuevo), para que el input no se rellene solo con un "0".
    diaGeneracion: number | "";
    diaVencimiento: number | "";
    diasGracia: number | "";
    tipoValor: TipoValorMora;
    modoMora: "UNICA" | "MENSUAL";
    valor: number | "";
    vigenteDesde: string;
  }>({
    diaGeneracion: 1,
    diaVencimiento: 10,
    diasGracia: 5,
    tipoValor: "PORCENTAJE",
    modoMora: "MENSUAL",
    valor: 2,
    vigenteDesde: "",
  });

  // Detalle de expensa
  const [expensaDetalle, setExpensaDetalle] = useState<ExpensaDTO | null>(null);

  // Registro de pago
  const [expensaParaPago, setExpensaParaPago] = useState<ExpensaDTO | null>(null);
  const [strMontoPago, setStrMontoPago] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [strReferenciaPago, setStrReferenciaPago] = useState("");
  const [strErrorPago, setStrErrorPago] = useState("");
  const [bolGuardandoPago, setBolGuardandoPago] = useState(false);
  const [strExito, setStrExito] = useState("");

  // Consultas cacheadas y paralelas, independientes entre sí.
  // pagina/porPagina activan el formato {expensas, paginacion} del backend.
  const queryClient = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const porPagina = 25;
  const paramsExpensas = {
    pagina, porPagina,
    ...(filtroPeriodo !== "TODOS" ? { periodo: filtroPeriodo } : {}),
    ...(filtroEstado !== "TODOS" ? { estado: filtroEstado as EstadoExpensa } : {}),
    ...(filtroInmuebleId ? { inmuebleId: filtroInmuebleId } : {}),
  };
  const expensasQuery = useQuery({
    queryKey: ["morosidad", "expensas", paramsExpensas],
    queryFn: ({ signal }) => financeService.getExpensasPaginadas(paramsExpensas, signal),
  });
  const configQuery = useQuery({
    queryKey: ["morosidad", "configuracion"],
    queryFn: async () => financeService.getConfiguracionVigente().catch((error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }),
  });
  const historialQuery = useQuery({
    queryKey: ["morosidad", "configuracion-historial"],
    queryFn: () => financeService.getConfiguracionHistorial(),
  });
  const inmueblesQuery = useQuery({
    queryKey: ["morosidad", "inmuebles"], queryFn: listarInmuebles,
    staleTime: 120_000,
  });
  const tiposQuery = useQuery({
    queryKey: ["morosidad", "tipos"], queryFn: () => financeService.listarTiposInmueble(),
    staleTime: 120_000,
  });
  const facturasQuery = useQuery({
    queryKey: ["morosidad", "agua", "facturas"], queryFn: () => financeService.listarFacturasAgua(),
  });
  const expensas = expensasQuery.data?.expensas ?? EXPENSAS_VACIAS;
  const paginacion = expensasQuery.data?.paginacion;
  const configMora = configQuery.data ?? null;
  const historialConfiguracion = historialQuery.data ?? [];
  const inmuebles = inmueblesQuery.data ?? [];
  const tiposInmueble = tiposQuery.data ?? [];
  const facturasAgua = facturasQuery.data ?? [];
  const isLoading = expensasQuery.isPending;
  const errorCarga = expensasQuery.isError
    ? obtenerMensajeError(expensasQuery.error, "No se pudieron cargar las expensas.") : "";

  async function actualizarExpensas() {
    await queryClient.invalidateQueries({ queryKey: ["morosidad", "expensas"] });
  }
  async function reintentarConsultas() {
    await Promise.all([
      expensasQuery.refetch(), configQuery.refetch(), historialQuery.refetch(),
      inmueblesQuery.refetch(), tiposQuery.refetch(), facturasQuery.refetch(),
    ]);
  }


  useEffect(() => {
    if (!configMora) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData({
      diaGeneracion: Number(configMora.diaGeneracion),
      diaVencimiento: Number(configMora.diaVencimiento),
      diasGracia: Number(configMora.diasGracia),
      tipoValor: configMora.tipoValor, modoMora: configMora.modoMora,
      valor: Number(configMora.valor), vigenteDesde: "",
    });
  }, [configMora]);

  function abrirFormularioTipo(tipo: TipoInmuebleDTO) {
    setTipoEditando(tipo);
    setNombreTipo(tipo.nombre);
    setTarifaTipo(String(tipo.montoBase));
    setPesoTipo(String(tipo.pesoAgua));
    setErrorTipo("");
    setDialogTipoAbierto(true);
  }

  async function handleGuardarTipo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validarAccion(rol, "morosidad", "editar").permitido) return;
    if (!tipoEditando?.id) {
      setErrorTipo("Solo es posible editar tipos de departamento existentes.");
      return;
    }
    const montoBase = Number(tarifaTipo);
    const pesoAgua = Number(pesoTipo);
    if (!nombreTipo.trim() || !tarifaTipo || !pesoTipo || !Number.isFinite(montoBase) ||
        !Number.isFinite(pesoAgua) || montoBase < 0 || pesoAgua <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(tarifaTipo) ||
        !/^\d+(\.\d{1,3})?$/.test(pesoTipo)) {
      setErrorTipo("Revisa el nombre, la tarifa (hasta 2 decimales) y el peso de agua (hasta 3 decimales, mayor a cero).");
      return;
    }
    setGuardandoTipo(true);
    setErrorTipo("");
    try {
      await financeService.guardarTipoInmueble({ nombre: nombreTipo.trim(), montoBase, pesoAgua }, tipoEditando.id);
      setDialogTipoAbierto(false);
      setStrExito("Tarifa del tipo actualizada para próximas generaciones.");
      await queryClient.invalidateQueries({ queryKey: ["morosidad", "tipos"] });
    } catch (error) {
      setErrorTipo(obtenerMensajeError(error, "No se pudo guardar el tipo de departamento."));
    } finally {
      setGuardandoTipo(false);
    }
  }

  async function handleConsultarAgua() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodoAgua)) {
      setErrorAgua("El período debe tener formato YYYY-MM.");
      return;
    }
    setViendoAgua(true);
    setErrorAgua("");
    setDetalleAgua(null);
    try {
      setDetalleAgua(await financeService.obtenerFacturaAgua(periodoAgua));
    } catch (error) {
      setErrorAgua(obtenerMensajeError(error, "No hay una factura registrada para ese período."));
    } finally {
      setViendoAgua(false);
    }
  }

  async function handleRegistrarAgua(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validarAccion(rol, "morosidad", "editar").permitido) return;
    const monto = Number(montoFactura);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodoAgua) || !montoFactura ||
        !Number.isFinite(monto) || monto < 0 || !/^\d+(\.\d{1,2})?$/.test(montoFactura)) {
      setErrorAgua("Selecciona un período válido e introduce un importe no negativo con máximo 2 decimales.");
      return;
    }
    setGuardandoAgua(true);
    setErrorAgua("");
    setStrExito("");
    try {
      await financeService.registrarFacturaAgua(periodoAgua, monto);
      setDetalleAgua(await financeService.obtenerFacturaAgua(periodoAgua));
      setMontoFactura("");
      setStrExito(`Factura de agua de ${periodoAgua} registrada y distribuida entre las expensas existentes.`);
      await Promise.all([
        actualizarExpensas(),
        queryClient.invalidateQueries({ queryKey: ["morosidad", "agua", "facturas"] }),
      ]);
    } catch (error) {
      setErrorAgua(obtenerMensajeError(error, "No se pudo distribuir el agua. Comprueba que haya expensas generadas."));
    } finally {
      setGuardandoAgua(false);
    }
  }

  async function handleSaveConfig() {
    const objValidacion = validarAccion(rol, "morosidad", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");

    if (formData.diaGeneracion === "" || formData.diaGeneracion < 1 || formData.diaGeneracion > 28) {
      setStrErrorConfig("El día de generación debe estar entre 1 y 28.");
      return;
    }
    if (formData.diaVencimiento === "" || !Number.isInteger(formData.diaVencimiento) ||
        formData.diaVencimiento < 1 || formData.diaVencimiento > 28 ||
        formData.diaVencimiento < Number(formData.diaGeneracion)) {
      setStrErrorConfig("El vencimiento debe estar entre 1 y 28 y no puede preceder a la generación.");
      return;
    }
    if (formData.diasGracia === "" || !Number.isInteger(formData.diasGracia) || formData.diasGracia < 0) {
      setStrErrorConfig("Los días de gracia no pueden ser negativos.");
      return;
    }
    if (formData.valor === "" || !Number.isFinite(Number(formData.valor)) || formData.valor < 0) {
      setStrErrorConfig("El valor de la mora no puede ser negativo.");
      return;
    }
    if (formData.tipoValor === "PORCENTAJE" && Number(formData.valor) > 100) {
      setStrErrorConfig("El porcentaje de mora no puede superar el 100%.");
      return;
    }
    if (formData.vigenteDesde && formData.vigenteDesde < fechaHoyBolivia()) {
      setStrErrorConfig("La fecha de vigencia no puede ser anterior a hoy.");
      return;
    }

    setIsSaving(true);
    setStrErrorConfig("");

    try {
      await financeService.actualizarConfiguracion({
        diaGeneracion: Number(formData.diaGeneracion),
        diaVencimiento: Number(formData.diaVencimiento),
        diasGracia: Number(formData.diasGracia),
        tipoValor: formData.tipoValor,
        modoMora: formData.modoMora,
        valor: Number(formData.valor),
        ...(formData.vigenteDesde ? { vigenteDesde: formData.vigenteDesde } : {}),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["morosidad", "configuracion"] }),
        queryClient.invalidateQueries({ queryKey: ["morosidad", "configuracion-historial"] }),
      ]);
      setIsConfigOpen(false);
      setStrExito("Configuración de mora actualizada correctamente.");
    } catch (error) {
      setStrErrorConfig(obtenerMensajeError(error, "Ocurrió un error al guardar la configuración."));
    } finally {
      setIsSaving(false);
    }
  }

  function abrirDialogoVencimiento(exp: ExpensaDTO) {
    const permiso = validarAccion(rol, "morosidad", "editar");
    if (!permiso.permitido) {
      setStrMensajePermiso(permiso.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setExpensaDetalle(null);
    setExpensaVencimiento(exp);
    setNuevaFechaVencimiento(exp.fechaVencimiento.slice(0, 10));
    setMotivoVencimiento("");
    setErrorVencimiento("");
  }

  async function handleCambiarVencimiento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expensaVencimiento) return;
    const fechaMinima = fechaEnBolivia(expensaVencimiento.createdAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFechaVencimiento) || nuevaFechaVencimiento < fechaMinima) {
      setErrorVencimiento(`La fecha debe ser válida y no anterior a ${formatearFecha(fechaMinima + "T12:00:00-04:00")}.`);
      return;
    }
    if (nuevaFechaVencimiento === expensaVencimiento.fechaVencimiento.slice(0, 10)) {
      setErrorVencimiento("Selecciona una fecha distinta a la actual.");
      return;
    }
    if (motivoVencimiento.length > 300) {
      setErrorVencimiento("El motivo no puede superar 300 caracteres.");
      return;
    }
    setGuardandoVencimiento(true);
    setErrorVencimiento("");
    try {
      await financeService.cambiarVencimiento(expensaVencimiento.id, {
        fechaVencimiento: nuevaFechaVencimiento,
        motivo: motivoVencimiento.trim() || undefined,
      });
      setExpensaVencimiento(null);
      setStrExito("Fecha de vencimiento actualizada; el cambio quedó registrado en el historial.");
      await actualizarExpensas();
    } catch (error) {
      setErrorVencimiento(obtenerMensajeError(error, "No se pudo cambiar el vencimiento."));
    } finally {
      setGuardandoVencimiento(false);
    }
  }

  function abrirDialogoPago(exp: ExpensaDTO) {
    const objValidacion = validarAccion(rol, "morosidad", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setStrExito("");
    setExpensaParaPago(exp);
    setStrMontoPago(calcularSaldoPendiente(exp).toFixed(2));
    setMetodoPago("EFECTIVO");
    setStrReferenciaPago("");
    setStrErrorPago("");
  }

  function cerrarDialogoPago() {
    setExpensaParaPago(null);
    setStrErrorPago("");
  }

  async function handleConfirmarPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expensaParaPago) return;

    const monto = Number(strMontoPago);
    if (!strMontoPago || !Number.isFinite(monto) || monto <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(strMontoPago)) {
      setStrErrorPago("Ingresa un monto válido, mayor a cero.");
      return;
    }

    setBolGuardandoPago(true);
    setStrErrorPago("");

    try {
      await financeService.registrarPago(expensaParaPago.id, {
        monto,
        metodoPago,
        referencia: strReferenciaPago.trim() || undefined,
      });

      setExpensaParaPago(null);
      setStrExito("Pago registrado correctamente.");
      await actualizarExpensas();
    } catch (error) {
      setStrErrorPago(obtenerMensajeError(error, "Ocurrió un error al registrar el pago."));
    } finally {
      setBolGuardandoPago(false);
    }
  }

  async function handleRevisarMora() {
    const objValidacion = validarAccion(rol, "morosidad", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setStrErrorAccion("");
    setStrExito("");
    setBolRevisandoMora(true);

    try {
      // Se usa el endpoint del job (no el aplicar-mora por expensa) porque es el
      // único camino que también notifica por correo a los ocupantes afectados.
      const resultado = await financeService.ejecutarMoraJob();

      if (resultado.aplicadas > 0) {
        setStrExito(
          `Revisión completa: se aplicó o actualizó mora en ${resultado.aplicadas} expensa${resultado.aplicadas === 1 ? "" : "s"}.`
        );
      } else {
        setStrExito("Revisión completa: el backend no aplicó recargos nuevos. Puede ser por fechas, reglas históricas o pagos registrados.");
      }
      await actualizarExpensas();
    } catch (error) {
      setStrErrorAccion(obtenerMensajeError(error, "Ocurrió un error al revisar las deudas pendientes."));
    } finally {
      setBolRevisandoMora(false);
    }
  }

  async function handleGenerarMes() {
    const objValidacion = validarAccion(rol, "morosidad", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setStrErrorAccion("");
    setStrExito("");
    setResultadoGeneracion(null);
    setBolGenerandoMes(true);

    try {
      // Se usa el endpoint del job (forzar=true) en vez de crear expensas una por una
      // porque es el único camino que también notifica por correo a los ocupantes.
      const resultado = await financeService.ejecutarGeneracionJob(true);
      setResultadoGeneracion(resultado);
      setStrExito(`Generación del período ${resultado.periodo ?? periodoActual()}: ${resultado.generadas} nuevas, ${resultado.yaGeneradas?.length ?? 0} ya existentes y ${resultado.pendientes?.length ?? 0} pendientes por error.`);
      await actualizarExpensas();
    } catch (error) {
      setStrErrorAccion(obtenerMensajeError(error, "Ocurrió un error al generar las expensas del mes."));
    } finally {
      setBolGenerandoMes(false);
    }
  }

  // El backend NO soporta filtros por tipo ni búsquedas de texto.
  // Se aplican a la página cargada, y la interfaz lo informa expresamente.
  const filteredExpensas = useMemo(() => {
    const texto = searchTerm.trim().toLocaleLowerCase("es");
    return expensas.filter((exp) =>
      (filtroTipo === "TODOS" || exp.tipoNombre === filtroTipo) &&
      (!texto || [exp.inmueble.codigo, exp.periodo, exp.responsableNombre ?? "", exp.tipoNombre ?? ""]
        .some((valor) => valor.toLocaleLowerCase("es").includes(texto)))
    );
  }, [expensas, filtroTipo, searchTerm]);

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Supervisión de expensas generadas por el job automático y aplicación de recargos por mora.
        </p>

        {bolPuedeGestionar && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={handleGenerarMes}
              cargando={bolGenerandoMes}
              disabled={bolRevisandoMora}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              {bolGenerandoMes ? "Generando..." : "Generar expensas del mes"}
            </Button>

            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={handleRevisarMora}
              cargando={bolRevisandoMora}
              disabled={bolGenerandoMes}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {bolRevisandoMora ? "Revisando..." : "Revisar mora"}
            </Button>


          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full md:w-auto">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Configurar reglas de mora
              </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className={CLASE_TITULO_DIALOGO}>Configuración de mora y generación</DialogTitle>
                <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
                  Ajusta los parámetros para la generación automática de expensas y recargos.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="grid gap-1">
                  <label className={CLASE_LABEL_CAMPO}>Día de generación (1-28)</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={formData.diaGeneracion}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        diaGeneracion: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1">
                  <label htmlFor="diaVencimiento" className={CLASE_LABEL_CAMPO}>Día de vencimiento (1-28)</label>
                  <Input
                    id="diaVencimiento" type="number" min="1" max="28"
                    value={formData.diaVencimiento}
                    onChange={(e) => setFormData((prev) => ({ ...prev, diaVencimiento: e.target.value === "" ? "" : Number(e.target.value) }))}
                  />
                </div>
                <div className="grid gap-1">
                  <label className={CLASE_LABEL_CAMPO}>Días de gracia</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.diasGracia}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        diasGracia: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <label className={CLASE_LABEL_CAMPO}>Tipo de valor</label>
                    <Select
                      value={formData.tipoValor}
                      onValueChange={(val: TipoValorMora) => setFormData((prev) => ({ ...prev, tipoValor: val }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PORCENTAJE">Porcentaje (%)</SelectItem>
                        <SelectItem value="MONTO_FIJO">Monto fijo (Bs)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1">
                    <label className={CLASE_LABEL_CAMPO}>Valor</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.valor}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          valor: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className={CLASE_LABEL_CAMPO}>Frecuencia del recargo</label>
                  <Select value={formData.modoMora} onValueChange={(value: "UNICA" | "MENSUAL") => setFormData((prev) => ({ ...prev, modoMora: value }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNICA">Una sola vez</SelectItem>
                      <SelectItem value="MENSUAL">Mensualmente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <label htmlFor="vigenteDesde" className={CLASE_LABEL_CAMPO}>Vigente desde (opcional)</label>
                  <Input id="vigenteDesde" type="date" min={fechaHoyBolivia()}
                    value={formData.vigenteDesde}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vigenteDesde: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sin fecha se aplica desde ahora. Una fecha futura programa la nueva regla.
                Las expensas antiguas conservan su configuración histórica.
              </p>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold">Historial de configuraciones</h4>
                {historialConfiguracion.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay historial disponible.</p>
                ) : (
                  <div className="max-h-36 space-y-2 overflow-y-auto">
                    {historialConfiguracion.map((regla) => (
                      <div key={regla.id} className="border-b pb-2 text-xs last:border-0">
                        <strong>{formatearFecha(regla.vigenteDesde)}</strong> · {regla.modoMora === "UNICA" ? "Única" : "Mensual"} · {Number(regla.valor)}{regla.tipoValor === "PORCENTAJE" ? "%" : " Bs"}
                        <div className="text-muted-foreground">Generación día {regla.diaGeneracion}, vence día {regla.diaVencimiento}, gracia {regla.diasGracia} días</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {strErrorConfig && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorConfig}
                </p>
              )}

              <DialogFooter>
                <Button onClick={handleSaveConfig} cargando={isSaving} className="w-full">
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Guardando..." : "Guardar configuración"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}
      {errorCarga && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-danger-subtle p-3 text-sm text-destructive">
          <span>{errorCarga}</span>
          <Button type="button" variant="outline" size="sm" onClick={reintentarConsultas}>Reintentar carga</Button>
        </div>
      )}
      {configQuery.isError && <p role="alert" className="mb-4 text-sm text-destructive">
        No se pudo consultar la configuración de mora. Verifica los permisos o la conexión.
      </p>}
      {strExito && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-300 mb-4 rounded-lg border border-success/20 bg-success-subtle px-3.5 py-2.5 text-[13px] text-success">
          {strExito}
        </div>
      )}
      {strErrorAccion && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-300 mb-4 rounded-lg border border-destructive/20 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-destructive">
          {strErrorAccion}
        </div>
      )}

      {resultadoGeneracion && (
        <Card className="mb-6 border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[15px]">Resultado de generación — {resultadoGeneracion.periodo ?? periodoActual()}</CardTitle>
            <p className="text-[12px] text-muted-foreground">Es el resultado de la última ejecución desde esta pantalla. Repetir la generación no duplica los registros existentes.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3"><p className={CLASE_LABEL_CAMPO}>Generadas</p><p className="text-xl font-semibold">{resultadoGeneracion.generadas}</p></div>
            <div className="rounded-lg border p-3"><p className={CLASE_LABEL_CAMPO}>Ya existentes</p><p className="text-xl font-semibold">{resultadoGeneracion.yaGeneradas?.length ?? 0}</p></div>
            <div className="rounded-lg border p-3"><p className={CLASE_LABEL_CAMPO}>Pendientes por error</p><p className="text-xl font-semibold text-destructive">{resultadoGeneracion.pendientes?.length ?? 0}</p></div>
            <div className="rounded-lg border p-3"><p className={CLASE_LABEL_CAMPO}>Excluidas</p><p className="text-xl font-semibold">{resultadoGeneracion.excluidos?.length ?? 0}</p></div>
            {(resultadoGeneracion.yaGeneradas?.length ?? 0) > 0 && (
              <details className="rounded-lg border p-3 sm:col-span-2 xl:col-span-4">
                <summary className="cursor-pointer text-[13px] font-medium">Ver departamentos con expensa existente</summary>
                <p className="mt-2 text-[12px] text-muted-foreground">{resultadoGeneracion.yaGeneradas?.join(", ")}</p>
              </details>
            )}
            {(resultadoGeneracion.pendientes?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-destructive/20 p-3 sm:col-span-2 xl:col-span-4">
                <p className="text-[13px] font-medium">Pendientes para reintentar</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-[12px]">
                  {resultadoGeneracion.pendientes?.map((item) => <li key={item.inmuebleId}>{item.codigo}: {item.motivo}</li>)}
                </ul>
                <Button variant="outline" className="mt-3" onClick={handleGenerarMes} cargando={bolGenerandoMes}>Reintentar generación del mes</Button>
              </div>
            )}
            {(resultadoGeneracion.excluidos?.length ?? 0) > 0 && (
              <details className="rounded-lg border p-3 sm:col-span-2 xl:col-span-4">
                <summary className="cursor-pointer text-[13px] font-medium">Ver departamentos excluidos</summary>
                <ul className="mt-2 list-inside list-disc space-y-1 text-[12px]">
                  {resultadoGeneracion.excluidos?.map((item) => <li key={item.codigo}>{item.codigo}: {item.motivo}</li>)}
                </ul>
              </details>
            )}
            {resultadoGeneracion.motivo && <p className="text-[12px] text-muted-foreground sm:col-span-2 xl:col-span-4">Motivo: {resultadoGeneracion.motivo}</p>}
          </CardContent>
        </Card>
      )}

      {/* Reglas actuales de mora */}
      {!isLoading && configMora && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <CalendarClock className="h-5 w-5" />
            <h4 className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em]">
              Configuración vigente del cron job
            </h4>
          </div>

          <p className="mt-1 text-[13px] leading-[1.45] text-primary/80">
            Las expensas se generan automáticamente el día{" "}
            <strong className="font-bold text-primary">{configMora.diaGeneracion}</strong> de cada mes. El
            vencimiento está configurado para el día {configMora.diaVencimiento} y el
            recargo por mora es de{" "}
            <strong className="font-bold text-primary">
              {Number(configMora.valor)}
              {configMora.tipoValor === "PORCENTAJE" ? "%" : " Bs"}
            </strong>{" "}
            aplicable tras <strong className="font-bold text-primary">{configMora.diasGracia} días</strong> de
            gracia desde el vencimiento. Modalidad: <strong>{configMora.modoMora === "UNICA" ? "recargo único" : "recargo mensual"}</strong>.
          </p>
        </div>
      )}

      {/* Tarifas y agua. Los importes oficiales siempre los calcula el backend. */}
      <Card className="mb-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[15px]">Tarifas de departamentos y factura de agua</CardTitle>
          <p className="text-xs text-muted-foreground">Las tarifas se aplican a nuevas expensas. El agua se reparte sobre las expensas existentes del período, según el peso del tipo.</p>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Tipos y tarifas fijas</h3>
            {tiposInmueble.length === 0 ? (
              <p className="text-xs text-muted-foreground">No se cargaron tipos de departamento.</p>
            ) : (
              <div className="space-y-2">
                {tiposInmueble.map((tipo) => (
                  <div key={tipo.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Tipo {tipo.nombre}</p>
                      <p className="text-xs text-muted-foreground">Tarifa: {formatCurrency(Number(tipo.montoBase))} · Peso agua: {Number(tipo.pesoAgua)}</p>
                    </div>
                    {bolPuedeGestionar && <Button size="sm" variant="outline" onClick={() => abrirFormularioTipo(tipo)}>Editar</Button>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Agua del edificio por período</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input type="month" aria-label="Período del agua" value={periodoAgua}
                onChange={(e) => { setPeriodoAgua(e.target.value); setDetalleAgua(null); setErrorAgua(""); }} />
              <Button variant="outline" type="button" disabled={viendoAgua} onClick={handleConsultarAgua}>
                {viendoAgua ? "Consultando..." : "Consultar reparto"}
              </Button>
            </div>
            {bolPuedeGestionar && (
              <form className="flex gap-2" onSubmit={handleRegistrarAgua}>
                <Input aria-label="Importe de la factura de agua en bolivianos" placeholder="Factura total Bs" type="number" min="0" step="0.01"
                  value={montoFactura} onChange={(e) => setMontoFactura(e.target.value)} />
                <Button type="submit" disabled={guardandoAgua}>{guardandoAgua ? "Guardando..." : "Registrar agua"}</Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground">Si ya existe una factura de ese mes, registrar un nuevo monto la corrige y recalcula el reparto. El servidor puede rechazarlo si afecta importes ya pagados.</p>
            {errorAgua && <p role="alert" className="text-xs text-destructive">{errorAgua}</p>}
            {facturasAgua.length > 0 && (
              <p className="text-xs text-muted-foreground">Facturas registradas: {facturasAgua.map((f) => f.periodo).slice(0, 6).join(", ")}</p>
            )}
            {detalleAgua && (
              <details open className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Reparto {detalleAgua.factura.periodo}: {formatCurrency(Number(detalleAgua.factura.montoFactura))}</summary>
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                  {detalleAgua.reparto.map((fila) => (
                    <div key={fila.expensaId} className="flex justify-between border-b pb-2 text-xs gap-2">
                      <span>{fila.inmuebleCodigo} · Tipo {fila.tipo} · Peso {fila.peso}</span>
                      <strong>{formatCurrency(Number(fila.montoAgua))}</strong>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        </CardContent>
      </Card>

      {!configQuery.isPending && !configQuery.isError && !configMora && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          No existe una configuración de mora vigente. Antes de ejecutar el proceso mensual,
          un Administrador debe guardar las reglas de generación, vencimiento y mora.
        </div>
      )}

      <ResumenMorosidad expensas={expensas} />

      {/* Registro general */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Registro general de expensas
          </CardTitle>
          <Button variant="outline" size="sm" disabled={expensasQuery.isFetching}
            onClick={() => { void expensasQuery.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar expensas
          </Button>

          <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
            <Input
              id="filtro-mes"
              aria-label="Filtrar expensas por mes y año"
              title="Seleccionar otro mes"
              type="month"
              className="h-8 w-full cursor-pointer sm:w-[175px]"
              value={filtroPeriodo}
              onChange={(e) => {
                if (!e.target.value) return;
                setPagina(1);
                setFiltroPeriodo(e.target.value);
              }}
            />
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full sm:w-[135px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los tipos</SelectItem>
                {tiposInmueble.map((tipo) => <SelectItem key={tipo.id} value={tipo.nombre}>{tipo.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={(valor) => { setPagina(1); setFiltroEstado(valor); }}>
              <SelectTrigger className="w-full sm:w-[165px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los estados</SelectItem>
                {(["PENDIENTE", "PARCIAL", "PAGADA", "VENCIDA"] as EstadoExpensa[]).map((estado) => <SelectItem key={estado} value={estado}>{estado}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroInmuebleId || "TODOS"} onValueChange={(val) => { setPagina(1); setFiltroInmuebleId(val === "TODOS" ? "" : val); }}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Consultar por departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los departamentos</SelectItem>
                {inmuebles.map((inmueble) => (
                  <SelectItem key={inmueble.id} value={inmueble.id}>
                    {inmueble.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-full sm:w-[260px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar en esta página..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground sm:basis-full">
            Período, estado e inmueble filtran en el servidor. Tipo y búsqueda de texto solo filtran las {porPagina} expensas de esta página.
          </p>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <TablaExpensas
                filteredExpensas={filteredExpensas}
                totalCargadas={expensas.length}
                historialConfiguracion={historialConfiguracion}
                bolPuedeGestionar={bolPuedeGestionar}
                errorCarga={errorCarga}
                onDetalle={setExpensaDetalle}
                onPago={abrirDialogoPago}
              />
            </>
          )}
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            Página {paginacion?.pagina ?? pagina} de {Math.max(paginacion?.totalPaginas ?? 1, 1)}
            {paginacion ? ` · ${paginacion.total} expensas coinciden con los filtros del servidor` : ""}
            {expensasQuery.isFetching ? " · Actualizando…" : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pagina <= 1 || expensasQuery.isFetching}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</Button>
            <Button type="button" size="sm" variant="outline" disabled={pagina >= (paginacion?.totalPaginas ?? 1) || expensasQuery.isFetching}
              onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      </Card>

      <Dialog open={dialogTipoAbierto} onOpenChange={(abierto) => !guardandoTipo && setDialogTipoAbierto(abierto)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Editar tipo de departamento</DialogTitle>
            <DialogDescription>La tarifa y el peso se usan para las próximas expensas; no cambian las ya generadas.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleGuardarTipo}>
            <div className="space-y-1"><label htmlFor="nombreTipo" className={CLASE_LABEL_CAMPO}>Nombre del tipo</label>
              <Input id="nombreTipo" maxLength={50} required value={nombreTipo} onChange={(e) => setNombreTipo(e.target.value)} placeholder="A, B, C" /></div>
            <div className="space-y-1"><label htmlFor="tarifaTipo" className={CLASE_LABEL_CAMPO}>Tarifa mensual fija (Bs)</label>
              <Input id="tarifaTipo" type="number" min="0" step="0.01" required value={tarifaTipo} onChange={(e) => setTarifaTipo(e.target.value)} /></div>
            <div className="space-y-1"><label htmlFor="pesoTipo" className={CLASE_LABEL_CAMPO}>Peso para distribuir agua</label>
              <Input id="pesoTipo" type="number" min="0.001" step="0.001" required value={pesoTipo} onChange={(e) => setPesoTipo(e.target.value)} /></div>
            {errorTipo && <p role="alert" className="text-xs text-destructive">{errorTipo}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogTipoAbierto(false)} disabled={guardandoTipo}>Cancelar</Button>
              <Button type="submit" disabled={guardandoTipo}>{guardandoTipo ? "Guardando..." : "Guardar tipo"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de registro de pago */}
      <Dialog open={expensaParaPago !== null} onOpenChange={(bolOpen) => !bolOpen && cerrarDialogoPago()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Registrar pago</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {expensaParaPago &&
                `Expensa ${expensaParaPago.periodo} · ${expensaParaPago.inmueble.codigo}`}
            </DialogDescription>
          </DialogHeader>

          {expensaParaPago && (
            <form onSubmit={handleConfirmarPago} className="flex flex-col gap-3">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className={CLASE_LABEL_CAMPO}>Saldo pendiente</p>
                <p className="mt-1 text-[16px] font-semibold text-foreground">
                  {formatCurrency(calcularSaldoPendiente(expensaParaPago))}
                </p>
              </div>

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
                    <SelectValue />
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

              {strErrorPago && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorPago}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrarDialogoPago} disabled={bolGuardandoPago}>
                  Cancelar
                </Button>
                <Button type="submit" cargando={bolGuardandoPago}>
                  {bolGuardandoPago ? "Guardando..." : "Confirmar pago"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de detalle de la expensa */}
      <Dialog open={expensaDetalle !== null} onOpenChange={(bolOpen) => !bolOpen && setExpensaDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Detalle de la expensa</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {expensaDetalle && `${expensaDetalle.periodo} · ${expensaDetalle.inmueble.codigo}`}
            </DialogDescription>
          </DialogHeader>

          {expensaDetalle && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[expensaDetalle.estado]}`}>
                  {expensaDetalle.estado}
                </Badge>
                {estaEnPeriodoGracia(expensaDetalle, historialConfiguracion) && (
                  <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
                    En período de gracia
                  </Badge>
                )}
                {tieneMoraAplicada(expensaDetalle) && (
                  <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">
                    Mora aplicada
                  </Badge>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 font-medium text-[13px]"><UserRound className="h-4 w-4 text-muted-foreground" />Responsable de la expensa</div>
                <p className="mt-1 text-[13px]">{expensaDetalle.responsableNombre || "No registrado"}</p>
                <p className="text-[12px] text-muted-foreground">{expensaDetalle.responsableRol === "PROPIETARIO" ? "Propietario" : expensaDetalle.responsableRol === "INQUILINO" ? "Inquilino" : "Sin rol registrado"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Tipo de departamento</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {expensaDetalle.tipoNombre || "No registrado"}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha de generación</p>
                  <p className="mt-1 text-[13px] text-foreground">{formatearFecha(expensaDetalle.createdAt)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha de vencimiento</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {formatearFechaCalendario(expensaDetalle.fechaVencimiento)}
                  </p>
                  {bolPuedeGestionar && expensaDetalle.estado !== "PAGADA" && (expensaDetalle.moras?.length ?? 0) === 0 && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => abrirDialogoVencimiento(expensaDetalle)}>
                      <CalendarDays className="mr-1 h-4 w-4" /> Cambiar vencimiento
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className={`${CLASE_LABEL_CAMPO} mb-3`}>Desglose de la expensa</p>
                <div className="flex flex-col gap-2 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Tarifa fija</span>
                    <span className="text-foreground">{formatCurrency(Number(expensaDetalle.montoBase))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Agua del período</span>
                    <span className="text-foreground">{formatCurrency(Number(expensaDetalle.montoAgua))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="font-medium text-foreground">Total expensa (sin mora)</span>
                    <span className="font-medium text-foreground">{formatCurrency(Number(expensaDetalle.montoTotal))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Mora acumulada</span>
                    <span className="text-destructive">{formatCurrency(Number(expensaDetalle.montoMora || 0))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="font-semibold text-foreground">Total exigible</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(Number(expensaDetalle.montoTotal) + Number(expensaDetalle.montoMora || 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 p-3">
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Estado de cuenta de esta expensa</p>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div><p className="text-muted-foreground">Pagado</p><p className="font-semibold">{formatCurrency(resumenSaldo(expensaDetalle).pagado)}</p></div>
                  <div><p className="text-muted-foreground">Capital pendiente</p><p className="font-semibold">{formatCurrency(resumenSaldo(expensaDetalle).capitalPendiente)}</p></div>
                  <div><p className="text-muted-foreground">Mora pendiente</p><p className="font-semibold">{formatCurrency(resumenSaldo(expensaDetalle).moraPendiente)}</p></div>
                  <div><p className="text-muted-foreground">Saldo total pendiente</p><p className="font-semibold">{formatCurrency(resumenSaldo(expensaDetalle).total)}</p></div>
                </div>
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Recargos de mora individuales</p>
                {expensaDetalle.moras?.length ? (
                  <div className="space-y-2">
                    {expensaDetalle.moras.map((mora) => (
                      <div key={mora.id} className="rounded-lg border p-3 text-[12px]">
                        <div className="flex justify-between gap-2"><span className="font-medium">Recargo {mora.numero} — {mora.mes}</span><span className="font-semibold text-destructive">{formatCurrency(Number(mora.monto))}</span></div>
                        <p className="mt-1 text-muted-foreground">Corte: {formatearFechaCalendario(mora.fechaCorte)} · Base: {formatCurrency(Number(mora.base))} · {mora.tipoValor === "PORCENTAJE" ? `${mora.valor}%` : `Bs ${mora.valor} fijo`}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[12px] text-muted-foreground">No se registraron recargos para esta expensa.</p>}
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Historial de modificaciones al vencimiento</p>
                {expensaDetalle.cambiosVencimiento?.length ? (
                  <div className="space-y-2">
                    {expensaDetalle.cambiosVencimiento.map((cambio) => (
                      <div key={cambio.id} className="rounded-lg border p-3 text-[12px]">
                        <p className="font-medium">{formatearFechaCalendario(cambio.fechaAnterior)} → {formatearFechaCalendario(cambio.fechaNueva)}</p>
                        <p className="mt-1 text-muted-foreground">{formatearFecha(cambio.createdAt)}{cambio.motivo ? ` · ${cambio.motivo}` : ""}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[12px] text-muted-foreground">Sin cambios registrados.</p>}
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Historial de pagos</p>
                {expensaDetalle.pagos.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Todavía no se registraron pagos.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {expensaDetalle.pagos.map((pago) => (
                      <div
                        key={pago.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                      >
                        <div>
                          <p className="text-[13px] text-foreground">
                            {pago.metodoPago === "SALDO_A_FAVOR"
                              ? "Saldo a favor"
                              : ETIQUETA_METODO_PAGO[pago.metodoPago]}
                          </p>
                          <p className="font-caption text-[11px] text-muted-foreground">
                            {formatearFecha(pago.fechaPago)}
                            {pago.referencia ? ` · ${pago.referencia}` : ""}
                          </p>
                          <p className="font-caption text-[11px] text-muted-foreground">A capital: {formatCurrency(Number(pago.montoExpensa))} · A mora: {formatCurrency(Number(pago.montoMora))}</p>
                        </div>
                        <p className="text-[13px] font-semibold text-foreground">
                          {formatCurrency(Number(pago.monto))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setExpensaDetalle(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={expensaVencimiento !== null} onOpenChange={(abierto) => !abierto && !guardandoVencimiento && setExpensaVencimiento(null)}>
        <DialogContent className="sm:max-w-[430px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Modificar fecha de vencimiento</DialogTitle>
            <DialogDescription>
              {expensaVencimiento ? `${expensaVencimiento.inmueble.codigo} · ${expensaVencimiento.periodo}` : ""}. Solo se permite si la expensa no está pagada ni tiene recargos de mora.
            </DialogDescription>
          </DialogHeader>
          {expensaVencimiento && (
            <form className="space-y-4" onSubmit={handleCambiarVencimiento}>
              <div className="space-y-1">
                <label htmlFor="nuevaFechaVencimiento" className={CLASE_LABEL_CAMPO}>Nuevo vencimiento</label>
                <Input id="nuevaFechaVencimiento" type="date" value={nuevaFechaVencimiento}
                  min={fechaEnBolivia(expensaVencimiento.createdAt)} onChange={(event) => setNuevaFechaVencimiento(event.target.value)} required />
              </div>
              <div className="space-y-1">
                <label htmlFor="motivoVencimiento" className={CLASE_LABEL_CAMPO}>Motivo (opcional)</label>
                <Input id="motivoVencimiento" value={motivoVencimiento} maxLength={300} onChange={(event) => setMotivoVencimiento(event.target.value)} placeholder="Ej. acuerdo de pago, feriado" />
              </div>
              {errorVencimiento && <p className="rounded-lg border border-destructive/20 bg-danger-subtle p-3 text-[13px] text-destructive">{errorVencimiento}</p>}
              <DialogFooter>
                <Button variant="outline" type="button" disabled={guardandoVencimiento} onClick={() => setExpensaVencimiento(null)}>Cancelar</Button>
                <Button type="submit" disabled={guardandoVencimiento}>{guardandoVencimiento ? "Guardando..." : "Guardar cambio"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
// Provider aislado: no altera otras pantallas ni deja datos financieros cacheados entre sesiones.
export default function GeneracionExpensasAdminPage() {
  return (
    <QueryProvider>
      <Suspense fallback={<div className="px-4 py-6 text-sm text-muted-foreground">Cargando morosidad...</div>}>
        <ContenidoMorosidad />
      </Suspense>
    </QueryProvider>
  );
}
