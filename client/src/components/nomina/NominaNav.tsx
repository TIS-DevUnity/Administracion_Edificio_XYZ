"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, CircleCheck, ChartNoAxesCombined } from "lucide-react";

const links = [
  { href: "/admin/personal/nomina", label: "Nómina mensual", icono: ClipboardList },
  { href: "/admin/personal/nomina/pagos", label: "Pagos e historial", icono: CircleCheck },
  { href: "/admin/personal/nomina/reportes", label: "Reportes", icono: ChartNoAxesCombined },
];

export function NominaNav() {
  const pathname = usePathname();
  return <nav aria-label="Secciones de nómina" className="flex flex-wrap items-center gap-2">
    {links.map(({ href, label, icono: Icono }) => {
      const activo = pathname === href;
      return <Link key={href} href={href} aria-current={activo ? "page" : undefined}
        className={`font-body inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <Icono className="h-4 w-4" />{label}
      </Link>;
    })}
  </nav>;
}
