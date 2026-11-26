"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, HandCoins, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EstadoAnticipo, EstadoEmpleado } from "@/types/personal";
import type { MetodoPagoNomina } from "@/types/nomina";

const ENLACES = [
  { href: "/admin/personal/empleados", label: "Empleados", Icono: Users },
  { href: "/admin/personal/anticipos", label: "Anticipos", Icono: HandCoins },
  { href: "/admin/personal/nomina", label: "Nómina mensual", Icono: ClipboardList },
];

/** Navegación entre las secciones de Personal (mismo estilo que NominaNav). */
export function PersonalNav() {
  const pathname = usePathname();
  return <nav aria-label="Secciones de personal" className="flex flex-wrap items-center gap-2">
    {ENLACES.map(({ href, label, Icono }) => {
      const activo = pathname === href;
      return <Link key={href} href={href} aria-current={activo ? "page" : undefined}
        className={`font-body inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <Icono className="h-4 w-4" />{label}
      </Link>;
    })}
  </nav>;
}

export function EstadoEmpleadoBadge({ estado }: { estado: EstadoEmpleado }) {
  return <Badge variant="outline" className={`font-caption text-[11px] ${estado === "ACTIVO" ? "border-success/30 bg-success-subtle text-success" : "border-border bg-muted text-muted-foreground"}`}>
    {estado === "ACTIVO" ? "Activo" : "Inactivo"}
  </Badge>;
}

const CLASE_ESTADO_ANTICIPO: Record<EstadoAnticipo, string> = {
  PENDIENTE: "border-destructive/30 bg-danger-subtle text-destructive",
  PARCIAL: "border-accent-secondary/30 bg-accent-secondary/10 text-accent-secondary",
  DESCONTADO: "border-success/30 bg-success-subtle text-success",
};
const ETIQUETA_ESTADO_ANTICIPO: Record<EstadoAnticipo, string> = {
  PENDIENTE: "Pendiente de descuento",
  PARCIAL: "Descontado en parte",
  DESCONTADO: "Descontado",
};

export function EstadoAnticipoBadge({ estado }: { estado: EstadoAnticipo }) {
  return <Badge variant="outline" className={`font-caption text-[11px] ${CLASE_ESTADO_ANTICIPO[estado]}`}>{ETIQUETA_ESTADO_ANTICIPO[estado]}</Badge>;
}

export const ETIQUETA_METODO: Record<MetodoPagoNomina, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
};

/** Abre el calendario nativo con un clic en cualquier parte del campo. */
export function abrirCalendario(event: React.MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Sin showPicker queda el ícono del campo.
  }
}
