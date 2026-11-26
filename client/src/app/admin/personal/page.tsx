import Link from "next/link";
import { ArrowUpRight, ClipboardList, Banknote, ChartColumnIncreasing, Users, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const enlaces = [
  { href: "/admin/personal/empleados", titulo: "Empleados", descripcion: "Registro, consulta y edición del personal, su cargo, sueldo base y estado", Icono: Users },
  { href: "/admin/personal/anticipos", titulo: "Anticipos salariales", descripcion: "Registro de anticipos, pendientes de descuento y comprobantes PDF", Icono: HandCoins },
  { href: "/admin/personal/nomina", titulo: "Nómina mensual", descripcion: "Generación de nóminas, revisión de sueldos y estados de pago", Icono: ClipboardList },
  { href: "/admin/personal/nomina/pagos", titulo: "Pagos e historial", descripcion: "Consulta de pagos, métodos utilizados y boletas anteriores", Icono: Banknote },
  { href: "/admin/personal/nomina/reportes", titulo: "Reportes de personal", descripcion: "Gastos salariales, filtros mensuales y exportación PDF", Icono: ChartColumnIncreasing },
];

export default function PaginaPersonal() {
  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h2 className="font-subtitle text-[16px] text-foreground">Personal y Nómina</h2>
        <p className="font-body text-[13px] text-muted-foreground">Administración de nóminas, pagos y reportes del personal del edificio.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {enlaces.map(({ href, titulo, descripcion, Icono }) => (
          <Link key={href} href={href} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icono className="h-5 w-5" /></div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </CardHeader>
              <CardContent className="space-y-1">
                <CardTitle className="font-subtitle text-[14px]">{titulo}</CardTitle>
                <p className="font-body text-[13px] text-muted-foreground">{descripcion}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="font-caption text-[11px] text-muted-foreground">
        Los bonos, horas extra y descuentos se registran en el detalle de cada nómina pendiente (Nómina mensual → Detalle).
      </p>
    </section>
  );
}
