const kpis = [
  { label: "Edificios activos", value: "12", trend: "+2 este mes", trendType: "success" as const },
  {
    label: "Residentes registrados",
    value: "1,284",
    trend: "+48 este mes",
    trendType: "success" as const,
    accent: "secondary" as const,
  },
  { label: "Ingresos del mes", value: "$48,920.00", trend: "+8.4% vs. anterior", trendType: "success" as const },
  { label: "Pagos pendientes", value: "36", trend: "-6 esta semana", trendType: "danger" as const },
];

const recentPayments = [
  {
    resident: "María Fernanda Rojas",
    unit: "Torre Norte · 4B",
    amount: "$450.00",
    status: "Pagado",
    date: "10 sep 2026",
  },
  {
    resident: "Carlos Iván Suárez",
    unit: "Torre Sur · 12A",
    amount: "$380.00",
    status: "Pendiente",
    date: "09 sep 2026",
  },
  {
    resident: "Lucía Andrea Paz",
    unit: "Torre Norte · 7C",
    amount: "$450.00",
    status: "Pagado",
    date: "09 sep 2026",
  },
  {
    resident: "Jorge Alejandro Quispe",
    unit: "Torre Este · 3D",
    amount: "$410.00",
    status: "Vencido",
    date: "05 sep 2026",
  },
  {
    resident: "Daniela Ibáñez",
    unit: "Torre Sur · 9B",
    amount: "$450.00",
    status: "Pagado",
    date: "04 sep 2026",
  },
];

const statusStyles: Record<string, string> = {
  Pagado: "bg-success-subtle text-success",
  Pendiente: "bg-muted text-muted-foreground",
  Vencido: "bg-danger-subtle text-destructive",
};

export default function AdminPanelPage() {
  return (
    <div className="px-6 py-6">
      <p className="mb-6 text-[13px] leading-[1.45] text-muted-foreground">
        Resumen general de la operación del sistema.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, intIndex) => (
          <div
            key={kpi.label}
            style={{ animationDelay: `${intIndex * 80}ms` }}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both rounded-2xl border border-border bg-card p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
              {kpi.label}
            </p>
            <p
              className={`font-title mt-2 text-[26px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums ${
                kpi.accent === "secondary" ? "text-accent-secondary" : "text-foreground"
              }`}
            >
              {kpi.value}
            </p>

            <p
              className={`font-caption mt-1 text-[12px] font-medium leading-[1.3] ${
                kpi.trendType === "success" ? "text-success" : "text-destructive"
              }`}
            >
              {kpi.trend}
            </p>
          </div>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-300 mt-6 rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-subtitle text-[15px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Pagos recientes
          </h2>

          <a
            href="#"
            className="font-caption text-[12px] font-medium leading-[1.3] tracking-[0.01em] text-primary hover:text-primary/80"
          >
            Ver todos
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Residente
                </th>
                <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Unidad
                </th>
                <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Monto
                </th>
                <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Estado
                </th>
                <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Fecha
                </th>
              </tr>
            </thead>

            <tbody>
              {recentPayments.map((row) => (
                <tr
                  key={row.resident}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">{row.resident}</td>
                  <td className="px-5 py-3 text-[13px] leading-[1.45] text-muted-foreground">{row.unit}</td>
                  <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground tabular-nums">
                    {row.amount}
                  </td>

                  <td className="px-5 py-3">
                    <span
                      className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-[1.3] ${
                        statusStyles[row.status]
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="font-caption px-5 py-3 text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                    {row.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
