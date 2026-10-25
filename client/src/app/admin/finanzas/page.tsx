"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Download,
  ReceiptText,
  Landmark,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { financeService } from "@/services/finance.service";
import { saldoEdificioService } from "@/services/saldo-edificio.service";
import type { ResumenSaldoEdificio, FiltrosSaldoEdificio } from "@/types/saldo-edificio";
import { ExpensaDTO } from "@/types/finance";

/* Gráficos Recharts alimentados por GET /financiero/saldo-edificio.
 * No dependen del flag HU7 de generación de asientos. */
interface FlujoCajaMes {
  mes: string;
  ingresos: number;
  egresos: number;
}
interface SegmentoIngreso {
  name: string;
  amount: number;
}

/* ───────── Estilos (mismos que la pantalla de morosidad) ───────── */
const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_CARD =
  "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
const CLASE_VALOR_KPI = "font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em]";
const CLASE_DETALLE = "font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground";

// Recharts pinta con atributos SVG: se usan los tokens del tema con un color de respaldo
const token = (nombre: string, respaldo: string) => `var(--color-${nombre}, var(--${nombre}, ${respaldo}))`;
const COLOR_INGRESOS = token("success", "#2B8A64");
const COLOR_EGRESOS = token("muted-foreground", "#8A8A8A");
const COLOR_TEXTO = token("muted-foreground", "#8A8A8A");
const COLOR_BORDE = token("border", "#E4E4E7");
const COLORES_GRAFICO = [
  token("primary", "#2B8A64"),
  token("accent-secondary", "#D89B52"),
  token("success", "#4A9B76"),
  token("destructive", "#C84D4D"),
  token("muted-foreground", "#8A8A8A"),
];

/* ───────── Utilidades ───────── */
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(amount);

const formatCurrencyEntero = (amount: number) =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

type RangoFecha = "mes" | "trimestre" | "anio" | "todo";

const ETIQUETA_RANGO: Record<RangoFecha, string> = {
  mes: "Mes actual",
  trimestre: "Último trimestre",
  anio: "Año actual",
  todo: "Todos los periodos",
};

function periodoDeFecha(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

// Los periodos son "YYYY-MM", así que se pueden comparar como texto
function periodoEnRango(periodo: string, rango: RangoFecha): boolean {
  const hoy = new Date();
  if (rango === "todo") return true;
  if (rango === "mes") return periodo === periodoDeFecha(hoy);
  if (rango === "anio") return periodo.startsWith(String(hoy.getFullYear()));
  const desde = periodoDeFecha(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1));
  return periodo >= desde && periodo <= periodoDeFecha(hoy);
}

function totalPagado(exp: ExpensaDTO): number {
  return (exp.pagos ?? []).reduce((acc, pago) => acc + Number(pago.monto), 0);
}

// El pago con saldo a favor no es dinero nuevo: ya se contó cuando se recibió
function efectivoRecaudado(exp: ExpensaDTO): number {
  return (exp.pagos ?? [])
    .filter((pago) => (pago.metodoPago as string) !== "SALDO_A_FAVOR")
    .reduce((acc, pago) => acc + Number(pago.monto), 0);
}

function plural(cantidad: number, singular: string, pluralTexto: string) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

function celdaCsv(valor: string | number): string {
  return `"${String(valor).replace(/"/g, '""')}"`;
}

/* ───────── Componentes ───────── */
interface MetricCardProps {
  title: string;
  value: string;
  valueClassName: string;
  detail: string;
  icon: React.ReactNode;
  variacion?: { texto: string; positiva: boolean };
}

function MetricCard({ title, value, valueClassName, detail, icon, variacion }: MetricCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={CLASE_LABEL_CAMPO}>{title}</p>
            <h3 className={`${CLASE_VALOR_KPI} ${valueClassName}`}>{value}</h3>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {variacion && (
            <span
              className={`flex items-center gap-1 text-[12px] font-semibold ${
                variacion.positiva ? "text-success" : "text-destructive"
              }`}
            >
              {variacion.positiva ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {variacion.texto}
            </span>
          )}
          <span className={CLASE_DETALLE}>{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────── Página ───────── */
export default function DashboardFinancieroPage() {
  const [expensas, setExpensas] = useState<ExpensaDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [strError, setStrError] = useState("");
  const [rango, setRango] = useState<RangoFecha>("todo");
  const [saldoEdificio, setSaldoEdificio] = useState<ResumenSaldoEdificio | null>(null);
  const [cargandoSaldo, setCargandoSaldo] = useState(true);
  const [rangoSaldo, setRangoSaldo] = useState<RangoFecha | null>(null);
  const [errorSaldo, setErrorSaldo] = useState(false);
  const [serieMensual, setSerieMensual] = useState<FlujoCajaMes[]>([]);
  const [cargandoSerie, setCargandoSerie] = useState(true);
  const [errorSerie, setErrorSerie] = useState(false);

  useEffect(() => {
    let activo = true;
    const hoy = new Date();
    const fechaLocal = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    const parametros: FiltrosSaldoEdificio = { porPagina: 1 };
    if (rango !== "todo") {
      const inicio = new Date(hoy.getFullYear(), rango === "anio" ? 0 : rango === "trimestre" ? hoy.getMonth() - 2 : hoy.getMonth(), 1);
      parametros.desde = fechaLocal(inicio);
      parametros.hasta = fechaLocal(hoy);
    }
    saldoEdificioService.obtener(parametros)
      .then((resultado) => { if (activo) { setSaldoEdificio(resultado); setErrorSaldo(false); setRangoSaldo(rango); } })
      .catch(() => { if (activo) { setSaldoEdificio(null); setErrorSaldo(true); setRangoSaldo(rango); } })
      .finally(() => { if (activo) setCargandoSaldo(false); });
    return () => { activo = false; };
  }, [rango]);

  useEffect(() => {
    let activo = true;

    const hoy = new Date();
    const meses = Array.from({ length: 6 }, (_, index) =>
      new Date(hoy.getFullYear(), hoy.getMonth() - (5 - index), 1)
    );
    const fechaLocal = (fecha: Date) =>
      `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    Promise.all(
      meses.map(async (mes) => {
        const ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
        const resultado = await saldoEdificioService.obtener({
          desde: fechaLocal(mes),
          hasta: fechaLocal(ultimoDia),
          porPagina: 1,
        });
        return {
          mes: mes.toLocaleDateString("es-BO", { month: "short", year: "2-digit" }),
          ingresos: Number(resultado.totalIngresos),
          egresos: Number(resultado.totalGastos),
        };
      })
    )
      .then((datos) => { if (activo) setSerieMensual(datos); })
      .catch(() => { if (activo) { setSerieMensual([]); setErrorSerie(true); } })
      .finally(() => { if (activo) setCargandoSerie(false); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    async function cargarDatos() {
      try {
        setExpensas(await financeService.getExpensas());
      } catch (error) {
        console.error("Error cargando expensas:", error);
        setStrError("No se pudieron cargar las expensas. Intenta de nuevo en unos minutos.");
      } finally {
        setIsLoading(false);
      }
    }
    cargarDatos();
  }, []);

  const expensasEnRango = useMemo(
    () => expensas.filter((exp) => periodoEnRango(exp.periodo, rango)),
    [expensas, rango]
  );

  // KPIs reales (desde el backend)
  const metricas = useMemo(() => {
    let totalRecaudado = 0;
    let carteraPendiente = 0;
    let moraActiva = 0;
    let intPagos = 0;
    let intConSaldo = 0;
    let intVencidas = 0;

    expensasEnRango.forEach((exp) => {
      totalRecaudado += efectivoRecaudado(exp);
      intPagos += (exp.pagos ?? []).length;

      if (exp.estado !== "PAGADA") {
        const saldo = Math.max(Number(exp.montoTotal) + Number(exp.montoMora || 0) - totalPagado(exp), 0);
        carteraPendiente += saldo;
        moraActiva += Number(exp.montoMora || 0);
        if (saldo > 0) intConSaldo += 1;
        if (exp.estado === "VENCIDA") intVencidas += 1;
      }
    });

    return { totalRecaudado, carteraPendiente, moraActiva, intPagos, intConSaldo, intVencidas };
  }, [expensasEnRango]);

  const saldoVisible = rangoSaldo === rango ? saldoEdificio : null;
  const consultandoSaldo = cargandoSaldo || rangoSaldo !== rango;

  const distribucionIngresos: SegmentoIngreso[] = saldoVisible
    ? [
        { name: "Pagos de expensas", amount: Number(saldoVisible.ingresos.pagosDeExpensas) },
        { name: "Ingresos extraordinarios", amount: Number(saldoVisible.ingresos.extraordinarios) },
      ]
    : [];
  const totalDistribucion = distribucionIngresos.reduce((acc, item) => acc + item.amount, 0);

  function exportarReporte() {
    const encabezado = ["Periodo", "Inmueble", "Vencimiento", "Monto base", "Mora", "Total", "Pagado", "Saldo", "Estado"];
    const filas = expensasEnRango.map((exp) => {
      const total = Number(exp.montoTotal) + Number(exp.montoMora || 0);
      const pagado = totalPagado(exp);
      return [
        exp.periodo,
        exp.inmueble.codigo,
        exp.fechaVencimiento.slice(0, 10),
        Number(exp.montoTotal).toFixed(2),
        Number(exp.montoMora || 0).toFixed(2),
        total.toFixed(2),
        pagado.toFixed(2),
        Math.max(total - pagado, 0).toFixed(2),
        exp.estado,
      ];
    });

    const csv = [encabezado, ...filas].map((fila) => fila.map(celdaCsv).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `reporte-expensas-${rango}-${periodoDeFecha(new Date())}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Control de liquidez, conciliación y balance de ingresos frente a egresos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/finanzas/conciliacion">
              Conciliación bancaria
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/finanzas/flujo-caja">
              Flujo de caja real
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/finanzas/saldo-edificio">
              <Landmark className="mr-2 h-4 w-4" />
              Consultar saldo del edificio
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/finanzas/movimientos">
              <ReceiptText className="mr-2 h-4 w-4" />
              Movimientos financieros
            </Link>
          </Button>
        </div>
      </div>

      {strError && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-destructive">
          {strError}
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 xl:flex-row xl:items-end">
          <div className="flex-1">
            <label className={`${CLASE_LABEL_CAMPO} mb-1 block`}>Rango de periodos</label>
            <Select value={rango} onValueChange={(val: RangoFecha) => setRango(val)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ETIQUETA_RANGO) as RangoFecha[]).map((clave) => (
                  <SelectItem key={clave} value={clave}>
                    {ETIQUETA_RANGO[clave]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <p className={`${CLASE_LABEL_CAMPO} mb-1`}>Saldos por cuenta</p>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/finanzas/flujo-caja">Ver Caja y Banco por separado</Link>
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full xl:w-auto"
            onClick={exportarReporte}
            disabled={isLoading || expensasEnRango.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar reporte
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      {isLoading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total recaudado (expensas)"
            value={formatCurrency(metricas.totalRecaudado)}
            valueClassName="text-success"
            detail={`${plural(metricas.intPagos, "pago registrado", "pagos registrados")} · ${ETIQUETA_RANGO[rango].toLowerCase()}`}
            icon={<CircleDollarSign className="h-5 w-5" />}
          />
          <MetricCard
            title="Cuentas por cobrar"
            value={formatCurrency(metricas.carteraPendiente)}
            valueClassName="text-primary"
            detail={`${plural(metricas.intConSaldo, "expensa con saldo", "expensas con saldo")}`}
            icon={<WalletCards className="h-5 w-5" />}
          />
          <MetricCard
            title="Mora activa"
            value={formatCurrency(metricas.moraActiva)}
            valueClassName="text-destructive"
            detail={`${plural(metricas.intVencidas, "expensa vencida", "expensas vencidas")}`}
            icon={<Building2 className="h-5 w-5" />}
          />
          <MetricCard
            title="Saldo acumulado del edificio"
            value={consultandoSaldo ? "Consultando…" : saldoVisible ? formatCurrency(Number(saldoVisible.saldoActual)) : "No disponible"}
            valueClassName={saldoVisible && Number(saldoVisible.saldoActual) < 0 ? "text-destructive" : "text-success"}
            detail={saldoVisible ? (rango === "todo" ? "Ingresos recibidos menos gastos registrados" : "Acumulado hasta hoy; no solo del período") : errorSaldo ? "No se pudo consultar el saldo" : "Cargando datos reales"}
            icon={<WalletCards className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Resumen general real: por fechas de cobro y registro, no por período de expensa */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h3 className="font-subtitle text-sm font-semibold">Ingresos y gastos generales del edificio</h3>
            <p className="mt-1 text-xs text-muted-foreground">{rango === "todo" ? "Todos los registros" : `${ETIQUETA_RANGO[rango]} (según fecha del movimiento)`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Incluye pagos de expensas e ingresos extraordinarios; no incluye deudas pendientes de cobro.</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div><p className="text-xs text-muted-foreground">Ingresos</p><p className="font-title text-lg font-bold text-success">{consultandoSaldo ? "…" : saldoVisible ? formatCurrency(Number(saldoVisible.totalIngresos)) : "No disponible"}</p></div>
            <div><p className="text-xs text-muted-foreground">Gastos</p><p className="font-title text-lg font-bold text-destructive">{consultandoSaldo ? "…" : saldoVisible ? formatCurrency(Number(saldoVisible.totalGastos)) : "No disponible"}</p></div>
            <div><p className="text-xs text-muted-foreground">Resultado del período</p><p className="font-title text-lg font-bold">{consultandoSaldo ? "…" : saldoVisible ? formatCurrency(Number(saldoVisible.saldoDelPeriodo)) : "No disponible"}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className={CLASE_TITULO_CARD}>Comparativo mensual</CardTitle>
              <p className={`${CLASE_DETALLE} mt-1`}>Ingresos y gastos del edificio según fecha de registro</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-caption text-[11px] text-muted-foreground">
                Últimos 6 meses ·
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {errorSerie ? (
              <p role="alert" className="py-14 text-center text-sm text-destructive">No se pudo cargar el comparativo mensual.</p>
            ) : cargandoSerie ? (
              <Skeleton className="h-[330px] w-full" />
            ) : serieMensual.length === 0 || serieMensual.every(m => m.ingresos === 0 && m.egresos === 0) ? (
              <p className="py-14 text-center text-sm text-muted-foreground">Sin movimientos en los últimos 6 meses.</p>
            ) : (
            <div className="h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieMensual} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLOR_BORDE} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: COLOR_TEXTO }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: COLOR_TEXTO }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val / 1000}K`}
                  />
                  <RechartsTooltip
                    formatter={(val) => formatCurrency(Number(val ?? 0))}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${COLOR_BORDE}`,
                      backgroundColor: token("card", "#FFFFFF"),
                      color: token("foreground", "#111111"),
                    }}
                  />
                  <Legend />
                  <Bar dataKey="ingresos" name="Ingresos" fill={COLOR_INGRESOS} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="egresos" name="Egresos" fill={COLOR_EGRESOS} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <CardTitle className={CLASE_TITULO_CARD}>Origen de ingresos</CardTitle>
            <Badge variant="outline">.</Badge>
          </CardHeader>
          <CardContent className="pt-4">
            {consultandoSaldo ? (
              <Skeleton className="h-[260px] w-full" />
            ) : !saldoVisible ? (
              <p role="alert" className="py-12 text-center text-sm text-destructive">No se pudo consultar la distribución de ingresos.</p>
            ) : totalDistribucion === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Sin ingresos registrados en el rango seleccionado.</p>
            ) : (
            <div className="grid items-center gap-4 md:grid-cols-2">
              <div className="relative h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribucionIngresos}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="name"
                      stroke="none"
                    >
                      {distribucionIngresos.map((item, index) => (
                        <Cell key={item.name} fill={COLORES_GRAFICO[index % COLORES_GRAFICO.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val) => formatCurrency(Number(val ?? 0))}
                      contentStyle={{
                        borderRadius: 10,
                        border: `1px solid ${COLOR_BORDE}`,
                        backgroundColor: token("card", "#FFFFFF"),
                        color: token("foreground", "#111111"),
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className={CLASE_DETALLE}>Total</span>
                  <span className="font-title text-[18px] font-bold leading-[1.2] text-foreground">
                    {formatCurrencyEntero(totalDistribucion)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {distribucionIngresos.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORES_GRAFICO[index % COLORES_GRAFICO.length] }}
                      />
                      <span className="text-[13px] text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-foreground">
                      {((item.amount / totalDistribucion) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}