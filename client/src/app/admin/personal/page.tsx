import Link from "next/link";
import { ArrowUpRight, ClipboardList, Banknote, ChartColumnIncreasing, Users, HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const enlaces = [
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
      <div className="space-y-2">
        <h3 className="font-subtitle text-[14px] text-foreground">Próximas integraciones · Frontend 1</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="opacity-75"><CardContent className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div><p className="font-subtitle text-[13px]">Empleados</p><p className="font-caption text-[11px] text-muted-foreground">Registro, consulta y edición · pendiente de integrar</p></div>
          </CardContent></Card>
          <Card className="opacity-75"><CardContent className="flex items-center gap-3">
            <HandCoins className="h-5 w-5 text-muted-foreground" />
            <div><p className="font-subtitle text-[13px]">Anticipos y conceptos</p><p className="font-caption text-[11px] text-muted-foreground">Gestión de anticipos, bonos y descuentos · pendiente de integrar</p></div>
          </CardContent></Card>
        </div>
      </div>
    </section>
  );
}
