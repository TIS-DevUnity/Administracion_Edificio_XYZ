"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  CalendarClock,
  Search,
  SlidersHorizontal,
  Save,
} from "lucide-react";

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
  ExpensaDTO,
  TipoValorMora,
} from "@/types/finance";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(amount);
};

export default function GeneracionExpensasAdminPage() {
  const [expensas, setExpensas] = useState<ExpensaDTO[]>([]);
  const [configMora, setConfigMora] =
    useState<ConfiguracionMoraDTO | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Estados para el formulario de configuración
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  // Carga inicial de datos
  useEffect(() => {
    const loadData = async () => {
      try {
        const [configData, expensasData] = await Promise.all([
          financeService.getConfiguracionVigente(),
          financeService.getExpensas(),
        ]);

        setConfigMora(configData);
        setExpensas(expensasData);

        // Pre-cargar el formulario con los datos actuales
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
    };

    loadData();
  }, []);

  const handleSaveConfig = async () => {
    setIsSaving(true);

    try {
      await financeService.actualizarConfiguracion(formData);

      // Recargar datos después de guardar
      const [configData, expensasData] = await Promise.all([
        financeService.getConfiguracionVigente(),
        financeService.getExpensas(),
      ]);

      setConfigMora(configData);
      setExpensas(expensasData);

      setFormData({
        diaGeneracion: configData.diaGeneracion,
        diasGracia: configData.diasGracia,
        tipoValor: configData.tipoValor,
        valor: configData.valor,
      });

      setIsConfigOpen(false);

      alert("Configuración actualizada correctamente");
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Hubo un error al guardar la configuración");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredExpensas = expensas.filter(
    (exp) =>
      exp.inmueble.codigo
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      exp.periodo.includes(searchTerm),
  );

  const expensasVencidas = expensas.filter(
    (e) => e.estado === "VENCIDA",
  );

  const totalMoraAcumulada = expensasVencidas.reduce(
    (acc, curr) => acc + Number(curr.montoMora || 0),
    0,
  );

  const totalCapitalVencido = expensasVencidas.reduce(
    (acc, curr) => acc + Number(curr.montoTotal),
    0,
  );

  return (
    <div className="min-h-screen bg-[#09090B] p-6 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Monitor de Expensas y Mora
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Supervisión de expensas generadas por el job automático y
              aplicación de recargos.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* MODAL DE CONFIGURACIÓN */}
            <Dialog
              open={isConfigOpen}
              onOpenChange={setIsConfigOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-slate-700 bg-slate-800 font-medium text-slate-300 hover:bg-slate-700"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Configurar Reglas de Mora
                </Button>
              </DialogTrigger>

              <DialogContent className="border-slate-800 bg-[#18181B] text-white sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>
                    Configuración del Cron Job
                  </DialogTitle>

                  <DialogDescription className="text-slate-400">
                    Ajusta los parámetros para la generación automática
                    de expensas y recargos.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  {/* DÍA DE GENERACIÓN */}
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">
                      Día de Generación (1-28)
                    </label>

                    <Input
                      type="number"
                      min="1"
                      max="28"
                      value={formData.diaGeneracion}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          diaGeneracion: Number(e.target.value),
                        }))
                      }
                      className="border-slate-700 bg-[#27272A]"
                    />
                  </div>

                  {/* DÍAS DE GRACIA */}
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">
                      Días de Gracia
                    </label>

                    <Input
                      type="number"
                      min="0"
                      value={formData.diasGracia}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          diasGracia: Number(e.target.value),
                        }))
                      }
                      className="border-slate-700 bg-[#27272A]"
                    />
                  </div>

                  {/* TIPO Y VALOR */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-300">
                        Tipo de Valor
                      </label>

                      <Select
                        value={formData.tipoValor}
                        onValueChange={(val: TipoValorMora) =>
                          setFormData((prev) => ({
                            ...prev,
                            tipoValor: val,
                          }))
                        }
                      >
                        <SelectTrigger className="border-slate-700 bg-[#27272A] text-white">
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent className="border-slate-800 bg-[#18181B] text-white">
                          <SelectItem value="PORCENTAJE">
                            Porcentaje (%)
                          </SelectItem>

                          <SelectItem value="MONTO_FIJO">
                            Monto Fijo (Bs)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* VALOR */}
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-300">
                        Valor
                      </label>

                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={formData.valor}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            valor: Number(e.target.value),
                          }))
                        }
                        className="border-slate-700 bg-[#27272A]"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Save className="mr-2 h-4 w-4" />

                  {isSaving
                    ? "Guardando..."
                    : "Guardar Configuración"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* REGLAS ACTUALES DE MORA */}
        {!isLoading && configMora && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-primary">
              <CalendarClock className="h-5 w-5" />

              <h4 className="font-semibold">
                Configuración Vigente del Cron Job
              </h4>
            </div>

            <p className="mt-1 text-sm text-primary/80">
              Las expensas se generan automáticamente el día{" "}
              <strong className="font-bold text-primary">
                {configMora.diaGeneracion}
              </strong>{" "}
              de cada mes. El recargo por mora es del{" "}
              <strong className="font-bold text-primary">
                {configMora.valor}
                {configMora.tipoValor === "PORCENTAJE"
                  ? "%"
                  : " Bs"}
              </strong>{" "}
              aplicable tras{" "}
              <strong className="font-bold text-primary">
                {configMora.diasGracia} días
              </strong>{" "}
              de gracia desde el vencimiento.
            </p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="border-slate-800 bg-[#18181B] shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-slate-400">
                Total Expensas Vencidas
              </p>

              <h3 className="mt-2 text-2xl font-bold text-white">
                {expensasVencidas.length} Unidades
              </h3>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#18181B] shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-slate-400">
                Capital Vencido
              </p>

              <h3 className="mt-2 text-2xl font-bold text-primary">
                {formatCurrency(totalCapitalVencido)}
              </h3>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#18181B] shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-slate-400">
                Mora Aplicada (Intereses)
              </p>

              <h3 className="mt-2 text-2xl font-bold text-red-500">
                {formatCurrency(totalMoraAcumulada)}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Calculado por el scheduler automático
              </p>
            </CardContent>
          </Card>
        </div>

        {/* TABLA PRINCIPAL */}
        <Card className="border-slate-800 bg-[#18181B] shadow-md">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <CardTitle className="text-lg text-white">
                Registro General de Expensas
              </CardTitle>
            </div>

            <div className="relative w-[300px]">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />

              <Input
                placeholder="Buscar por departamento o periodo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-slate-700 bg-[#27272A] pl-9 text-white placeholder:text-slate-500"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-4 p-5">
                <Skeleton className="h-10 w-full bg-slate-800" />
                <Skeleton className="h-10 w-full bg-slate-800" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">
                      Periodo
                    </TableHead>

                    <TableHead className="text-slate-400">
                      Inmueble
                    </TableHead>

                    <TableHead className="text-slate-400">
                      Vencimiento
                    </TableHead>

                    <TableHead className="text-right text-slate-400">
                      Monto Base
                    </TableHead>

                    <TableHead className="text-right text-slate-400">
                      Mora
                    </TableHead>

                    <TableHead className="text-right text-slate-400">
                      Total
                    </TableHead>

                    <TableHead className="text-center text-slate-400">
                      Estado
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredExpensas.map((exp) => {
                    const montoTotal =
                      Number(exp.montoTotal) +
                      Number(exp.montoMora || 0);

                    return (
                      <TableRow
                        key={exp.id}
                        className="border-slate-800 hover:bg-slate-800/50"
                      >
                        <TableCell className="text-white">
                          {exp.periodo}
                        </TableCell>

                        <TableCell className="text-slate-300">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-500" />
                            {exp.inmueble.codigo}
                          </div>
                        </TableCell>

                        <TableCell className="text-slate-400">
                          {format(
                            new Date(exp.fechaVencimiento),
                            "dd/MM/yyyy",
                          )}
                        </TableCell>

                        <TableCell className="text-right text-slate-300">
                          {formatCurrency(Number(exp.montoTotal))}
                        </TableCell>

                        <TableCell className="text-right text-red-400">
                          {exp.montoMora
                            ? formatCurrency(Number(exp.montoMora))
                            : "Bs 0,00"}
                        </TableCell>

                        <TableCell className="text-right font-bold text-primary">
                          {formatCurrency(montoTotal)}
                        </TableCell>

                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              exp.estado === "VENCIDA"
                                ? "border-red-500/20 bg-red-500/10 text-red-400"
                                : exp.estado === "PAGADA"
                                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                                  : exp.estado === "PARCIAL"
                                    ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                                    : "border-slate-700 bg-slate-800 text-slate-200"
                            }
                          >
                            {exp.estado}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}