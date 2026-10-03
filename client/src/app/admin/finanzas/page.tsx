"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Download,
  Info,
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
import { ExpensaDTO } from "@/types/finance";

/* ═══════════════════════════════════════════════════════════════════════
 * DATOS MOCK (de ejemplo) — NO vienen del backend
 * Reemplazar cuando exista un endpoint de estadísticas financieras.
 *
 *  1. MOCK_FLUJO_CAJA          → gráfico "Comparativo mensual" (ingresos y egresos por mes)
 *  2. MOCK_DISTRIBUCION_GASTOS → gráfico "Distribución de gastos"
 *  3. Liquidez neta            → se deriva de MOCK_FLUJO_CAJA (último mes vs. anterior)
 *  4. Filtro "Cuenta contable" → sin modelo de cuentas en el backend, queda deshabilitado
 *
 * Todo lo demás (KPIs de recaudado, por cobrar y mora, y la exportación)
 * se calcula con las expensas reales de financeService.getExpensas().
 * ═══════════════════════════════════════════════════════════════════════ */
interface FlujoCajaMes {
  mes: string;
  ingresos: number;
  egresos: number;
}

interface GastoCategoria {
  name: string;
  amount: number;
}

const MOCK_FLUJO_CAJA: FlujoCajaMes[] = [
  { mes: "Ene", ingresos: 95000, egresos: 72000 },
  { mes: "Feb", ingresos: 112000, egresos: 85000 },
  { mes: "Mar", ingresos: 105000, egresos: 79000 },
  { mes: "Abr", ingresos: 128000, egresos: 91000 },
  { mes: "May", ingresos: 118000, egresos: 98000 },
  { mes: "Jun", ingresos: 142000, egresos: 103000 },
  { mes: "Jul", ingresos: 132000, egresos: 96000 },
  { mes: "Ago", ingresos: 168000, egresos: 109000 },
  { mes: "Sep", ingresos: 145000, egresos: 115000 },
];

// Solo montos: el total y los porcentajes se calculan, así siempre suman 100%
const MOCK_DISTRIBUCION_GASTOS: GastoCategoria[] = [
  { name: "Servicios básicos", amount: 25000 },
  { name: "Nómina de personal", amount: 19600 },
  { name: "Mantenimiento", amount: 16000 },
  { name: "Seguridad", amount: 14200 },
  { name: "Gastos administrativos", amount: 8900 },
];

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
function BadgeMock() {
  return (
    <Badge variant="outline" className="font-caption border-dashed text-[10px] text-muted-foreground">
      Datos de ejemplo
    </Badge>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  valueClassName: string;
  detail: string;
  icon: React.ReactNode;
  esMock?: boolean;
  variacion?: { texto: string; positiva: boolean };
}

function MetricCard({ title, value, valueClassName, detail, icon, esMock = false, variacion }: MetricCardProps) {
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
          {esMock && <BadgeMock />}
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

  // Liquidez neta (mock): último mes del flujo de caja de ejemplo frente al anterior
  const liquidezMock = useMemo(() => {
    const ultimo = MOCK_FLUJO_CAJA[MOCK_FLUJO_CAJA.length - 1];
    const anterior = MOCK_FLUJO_CAJA[MOCK_FLUJO_CAJA.length - 2];
    const neta = ultimo.ingresos - ultimo.egresos;
    const netaAnterior = anterior.ingresos - anterior.egresos;
    const variacion = netaAnterior !== 0 ? ((neta - netaAnterior) / Math.abs(netaAnterior)) * 100 : 0;
    return { neta, variacion };
  }, []);

  const totalGastosMock = MOCK_DISTRIBUCION_GASTOS.reduce((acc, item) => acc + item.amount, 0);

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
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Control de liquidez, conciliación y balance de ingresos frente a egresos.
        </p>
      </div>

      {strError && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-destructive">
          {strError}
        </div>
      )}

      {/* Aviso de datos de ejemplo */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-primary">
          <Info className="h-5 w-5" />
          <h4 className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em]">
            Parte de esta pantalla usa datos de ejemplo
          </h4>
        </div>
        <p className="mt-1 text-[13px] leading-[1.45] text-primary/80">
          Recaudado, cuentas por cobrar y mora se calculan con las expensas reales. El flujo de caja, la
          distribución de gastos y la liquidez neta son de ejemplo hasta que el backend exponga las estadísticas.
        </p>
      </div>

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
            <label className={`${CLASE_LABEL_CAMPO} mb-1 flex items-center gap-2`}>
              Cuenta contable <BadgeMock />
            </label>
            <Select value="consolidado" disabled>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consolidado">Consolidado</SelectItem>
              </SelectContent>
            </Select>
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
            title="Liquidez neta"
            value={formatCurrency(liquidezMock.neta)}
            valueClassName="text-foreground"
            variacion={{
              texto: `${liquidezMock.variacion >= 0 ? "+" : ""}${liquidezMock.variacion.toFixed(1)}%`,
              positiva: liquidezMock.variacion >= 0,
            }}
            detail="vs. mes anterior"
            icon={<ArrowUpRight className="h-5 w-5" />}
            esMock
          />
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className={CLASE_TITULO_CARD}>Comparativo mensual</CardTitle>
              <p className={`${CLASE_DETALLE} mt-1`}>Flujo de caja histórico</p>
            </div>
            <div className="flex items-center gap-2">
              <BadgeMock />
              <Badge variant="outline" className="font-caption text-[11px] text-muted-foreground">
                Últimos {MOCK_FLUJO_CAJA.length} meses
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_FLUJO_CAJA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barGap={4}>
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
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <CardTitle className={CLASE_TITULO_CARD}>Distribución de gastos</CardTitle>
            <BadgeMock />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid items-center gap-4 md:grid-cols-2">
              <div className="relative h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={MOCK_DISTRIBUCION_GASTOS}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="name"
                      stroke="none"
                    >
                      {MOCK_DISTRIBUCION_GASTOS.map((item, index) => (
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
                    {formatCurrencyEntero(totalGastosMock)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {MOCK_DISTRIBUCION_GASTOS.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORES_GRAFICO[index % COLORES_GRAFICO.length] }}
                      />
                      <span className="text-[13px] text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-foreground">
                      {((item.amount / totalGastosMock) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}