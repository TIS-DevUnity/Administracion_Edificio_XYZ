"use client";

import React, { FormEvent, useEffect, useState } from "react";
import axios from "axios";
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  Info,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Save,
  Wallet,
} from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Inmueble, listarInmuebles } from "@/lib/inmuebles";
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
  ConfiguracionMoraDTO,
  EstadoExpensa,
  ExpensaDTO,
  MetodoPago,
  TipoValorMora,
} from "@/types/finance";

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

const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success",
  VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-muted text-muted-foreground",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(amount);
}

function formatearFecha(strFechaISO: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(strFechaISO)
  );
}

function estaEnPeriodoGracia(exp: ExpensaDTO, configMora: ConfiguracionMoraDTO | null): boolean {
  if (!configMora) return false;
  if (exp.estado !== "PENDIENTE" && exp.estado !== "PARCIAL") return false;

  const fechaLimiteConGracia = new Date(exp.fechaVencimiento);
  fechaLimiteConGracia.setDate(fechaLimiteConGracia.getDate() + configMora.diasGracia);

  return new Date() <= fechaLimiteConGracia;
}

function periodoActual(): string {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function tieneMoraAplicada(exp: ExpensaDTO): boolean {
  return exp.estado === "VENCIDA" && Number(exp.montoMora || 0) > 0;
}

function calcularSaldoPendiente(exp: ExpensaDTO): number {
  const totalPagado = exp.pagos.reduce((acc, pago) => acc + Number(pago.monto), 0);
  const totalAdeudado = Number(exp.montoTotal) + Number(exp.montoMora || 0);
  return Math.max(totalAdeudado - totalPagado, 0);
}

function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

export default function GeneracionExpensasAdminPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeGestionar = puedeEjecutar(rol, "morosidad", "editar");

  const [expensas, setExpensas] = useState<ExpensaDTO[]>([]);
  const [configMora, setConfigMora] = useState<ConfiguracionMoraDTO | null>(null);
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroInmuebleId, setFiltroInmuebleId] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  // Revisión manual de mora / generación manual del mes
  const [bolRevisandoMora, setBolRevisandoMora] = useState(false);
  const [bolGenerandoMes, setBolGenerandoMes] = useState(false);
  const [strErrorAccion, setStrErrorAccion] = useState("");

  // Configuración de mora
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [strErrorConfig, setStrErrorConfig] = useState("");
  const [formData, setFormData] = useState<{
    diaGeneracion: number;
    diasGracia: number;
    tipoValor: TipoValorMora;
    valor: number;
  }>({
    diaGeneracion: 1,
    diasGracia: 5,
    tipoValor: "PORCENTAJE",
    valor: 2,
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

  async function cargarDatos() {
    try {
      setIsLoading(true);
      const [configData, expensasData, inmueblesData] = await Promise.all([
        financeService.getConfiguracionVigente(),
        financeService.getExpensas(),
        listarInmuebles(),
      ]);

      setConfigMora(configData);
      setExpensas(expensasData);
      setInmuebles(inmueblesData);

      setFormData({
        diaGeneracion: configData.diaGeneracion,
        diasGracia: configData.diasGracia,
        tipoValor: configData.tipoValor,
        valor: configData.valor,
      });
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();

    const strQuery = new URLSearchParams(window.location.search).get("q");
    if (strQuery) setSearchTerm(strQuery);
  }, []);

  async function handleSaveConfig() {
    const objValidacion = validarAccion(rol, "morosidad", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");

    if (formData.diaGeneracion < 1 || formData.diaGeneracion > 28) {
      setStrErrorConfig("El día de generación debe estar entre 1 y 28.");
      return;
    }
    if (formData.diasGracia < 0) {
      setStrErrorConfig("Los días de gracia no pueden ser negativos.");
      return;
    }
    if (formData.valor < 0) {
      setStrErrorConfig("El valor de la mora no puede ser negativo.");
      return;
    }

    setIsSaving(true);
    setStrErrorConfig("");

    try {
      await financeService.actualizarConfiguracion(formData);
      await cargarDatos();
      setIsConfigOpen(false);
      setStrExito("Configuración de mora actualizada correctamente.");
    } catch (error) {
      setStrErrorConfig(obtenerMensajeError(error, "Ocurrió un error al guardar la configuración."));
    } finally {
      setIsSaving(false);
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
    if (!strMontoPago || Number.isNaN(monto) || monto <= 0) {
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
      await cargarDatos();
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

      setStrExito(
        resultado.aplicadas > 0
          ? `Revisión completa: se aplicó o actualizó mora en ${resultado.aplicadas} expensa${resultado.aplicadas === 1 ? "" : "s"}.`
          : "Revisión completa: ninguna expensa superó el período de gracia todavía."
      );
      await cargarDatos();
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
    setBolGenerandoMes(true);

    try {
      // Se usa el endpoint del job (forzar=true) en vez de crear expensas una por una
      // porque es el único camino que también notifica por correo a los ocupantes.
      const resultado = await financeService.ejecutarGeneracionJob(true);
      const strPeriodo = periodoActual();

      setStrExito(
        `Generación del período ${strPeriodo}: ${resultado.generadas} expensa${
          resultado.generadas === 1 ? "" : "s"
        } nueva${resultado.generadas === 1 ? "" : "s"}, ${resultado.omitidas} ya existía${
          resultado.omitidas === 1 ? "" : "n"
        } o no se pudo${resultado.omitidas === 1 ? "" : "ieron"} generar.`
      );
      await cargarDatos();
    } catch (error) {
      setStrErrorAccion(obtenerMensajeError(error, "Ocurrió un error al generar las expensas del mes."));
    } finally {
      setBolGenerandoMes(false);
    }
  }

  const filteredExpensas = expensas.filter(
    (exp) =>
      (!filtroInmuebleId || exp.inmuebleId === filtroInmuebleId) &&
      (exp.inmueble.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || exp.periodo.includes(searchTerm))
  );

  const expensasVencidas = expensas.filter((e) => e.estado === "VENCIDA");

  const totalMoraAcumulada = expensasVencidas.reduce((acc, curr) => acc + Number(curr.montoMora || 0), 0);
  const totalCapitalVencido = expensasVencidas.reduce((acc, curr) => acc + Number(curr.montoTotal), 0);

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
              disabled={bolGenerandoMes}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              {bolGenerandoMes ? "Generando..." : "Generar expensas del mes"}
            </Button>

            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={handleRevisarMora}
              disabled={bolRevisandoMora}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${bolRevisandoMora ? "animate-spin" : ""}`} />
              {bolRevisandoMora ? "Revisando..." : "Revisar deudas ahora"}
            </Button>

          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full md:w-auto">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Configurar reglas de mora
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className={CLASE_TITULO_DIALOGO}>Configuración de mora</DialogTitle>
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
                      setFormData((prev) => ({ ...prev, diaGeneracion: Number(e.target.value) }))
                    }
                  />
                </div>

                <div className="grid gap-1">
                  <label className={CLASE_LABEL_CAMPO}>Días de gracia</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.diasGracia}
                    onChange={(e) => setFormData((prev) => ({ ...prev, diasGracia: Number(e.target.value) }))}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, valor: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {strErrorConfig && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorConfig}
                </p>
              )}

              <DialogFooter>
                <Button onClick={handleSaveConfig} disabled={isSaving} className="w-full">
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
            recargo por mora es del{" "}
            <strong className="font-bold text-primary">
              {configMora.valor}
              {configMora.tipoValor === "PORCENTAJE" ? "%" : " Bs"}
            </strong>{" "}
            aplicable tras <strong className="font-bold text-primary">{configMora.diasGracia} días</strong> de
            gracia desde el vencimiento.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Total expensas vencidas</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              {expensasVencidas.length} {expensasVencidas.length === 1 ? "unidad" : "unidades"}
            </h3>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Capital vencido</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-primary">
              {formatCurrency(totalCapitalVencido)}
            </h3>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className={CLASE_LABEL_CAMPO}>Mora aplicada (recargos)</p>
            <h3 className="font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-destructive">
              {formatCurrency(totalMoraAcumulada)}
            </h3>
            <p className="font-caption mt-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
              Calculado por el scheduler automático
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registro general */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Registro general de expensas
          </CardTitle>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={filtroInmuebleId || "TODOS"} onValueChange={(val) => setFiltroInmuebleId(val === "TODOS" ? "" : val)}>
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
                placeholder="Buscar por departamento o periodo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
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
              {/* Vista tabla (md en adelante) */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Periodo</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Inmueble</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Generada</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Vencimiento</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto base</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Mora</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-center`}>Estado</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>
                        {bolPuedeGestionar ? "Acción" : ""}
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredExpensas.map((exp) => {
                      const montoTotal = Number(exp.montoTotal) + Number(exp.montoMora || 0);

                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="text-[13px] text-foreground">{exp.periodo}</TableCell>

                          <TableCell className="text-[13px] text-foreground">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {exp.inmueble.codigo}
                            </div>
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatearFecha(exp.createdAt)}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatearFecha(exp.fechaVencimiento)}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-foreground">
                            {formatCurrency(Number(exp.montoTotal))}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-destructive">
                            {exp.montoMora ? formatCurrency(Number(exp.montoMora)) : "Bs 0,00"}
                          </TableCell>

                          <TableCell className="text-right text-[13px] font-semibold text-foreground">
                            {formatCurrency(montoTotal)}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                                {exp.estado}
                              </Badge>
                              {estaEnPeriodoGracia(exp, configMora) && (
                                <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
                                  En período de gracia
                                </Badge>
                              )}
                              {tieneMoraAplicada(exp) && (
                                <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">
                                  Mora aplicada
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setExpensaDetalle(exp)}>
                                <Info className="mr-2 h-4 w-4" />
                                Detalle
                              </Button>
                              {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                                <Button variant="ghost" size="sm" onClick={() => abrirDialogoPago(exp)}>
                                  <Wallet className="mr-2 h-4 w-4" />
                                  Registrar pago
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredExpensas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-[13px] text-muted-foreground">
                          No hay expensas registradas.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Vista tarjetas (mobile) */}
              <div className="flex flex-col gap-3 p-4 md:hidden">
                {filteredExpensas.map((exp) => {
                  const montoTotal = Number(exp.montoTotal) + Number(exp.montoMora || 0);

                  return (
                    <div
                      key={exp.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-subtitle text-[14px] font-semibold leading-[1.4] text-foreground">
                            {exp.periodo}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {exp.inmueble.codigo}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                            {exp.estado}
                          </Badge>
                          {estaEnPeriodoGracia(exp, configMora) && (
                            <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
                              En gracia
                            </Badge>
                          )}
                          {tieneMoraAplicada(exp) && (
                            <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">
                              Mora aplicada
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Generada</p>
                          <p className="text-[13px] text-foreground">{formatearFecha(exp.createdAt)}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Vencimiento</p>
                          <p className="text-[13px] text-foreground">{formatearFecha(exp.fechaVencimiento)}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Monto base</p>
                          <p className="text-[13px] text-foreground">{formatCurrency(Number(exp.montoTotal))}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Mora</p>
                          <p className="text-[13px] text-destructive">
                            {exp.montoMora ? formatCurrency(Number(exp.montoMora)) : "Bs 0,00"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Total</p>
                          <p className="text-[15px] font-semibold text-foreground">{formatCurrency(montoTotal)}</p>
                        </div>

                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => setExpensaDetalle(exp)}>
                            <Info className="mr-2 h-4 w-4" />
                            Detalle
                          </Button>
                          {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                            <Button variant="outline" size="sm" onClick={() => abrirDialogoPago(exp)}>
                              <Wallet className="mr-2 h-4 w-4" />
                              Registrar pago
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredExpensas.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    No hay expensas registradas.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                <Button type="submit" disabled={bolGuardandoPago}>
                  {bolGuardandoPago ? "Guardando..." : "Confirmar pago"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de detalle de la expensa */}
      <Dialog open={expensaDetalle !== null} onOpenChange={(bolOpen) => !bolOpen && setExpensaDetalle(null)}>
        <DialogContent className="sm:max-w-[480px]">
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
                {estaEnPeriodoGracia(expensaDetalle, configMora) && (
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha de generación</p>
                  <p className="mt-1 text-[13px] text-foreground">{formatearFecha(expensaDetalle.createdAt)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha de vencimiento</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {formatearFecha(expensaDetalle.fechaVencimiento)}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Monto base</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {formatCurrency(Number(expensaDetalle.montoTotal))}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Mora aplicada</p>
                  <p className="mt-1 text-[13px] text-destructive">
                    {expensaDetalle.montoMora ? formatCurrency(Number(expensaDetalle.montoMora)) : "Bs 0,00"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 p-3">
                <p className={CLASE_LABEL_CAMPO}>Saldo pendiente</p>
                <p className="mt-1 text-[16px] font-semibold text-foreground">
                  {formatCurrency(calcularSaldoPendiente(expensaDetalle))}
                </p>
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
    </div>
  );
}