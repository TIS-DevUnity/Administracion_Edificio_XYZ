import { LogoMark } from "@/components/LogoMark";

export function PanelMarca() {
  return (
    <div className="relative hidden w-1/2 shrink-0 overflow-hidden bg-linear-to-br from-primary/15 via-background to-accent-secondary/15 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/25 blur-2xl" />
        <div className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-accent-secondary/20 blur-2xl [animation-delay:4s]" />
        <div className="animate-blob absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-primary/15 blur-2xl [animation-delay:8s]" />
      </div>

      <div className="relative z-10 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
          <LogoMark className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="font-subtitle text-[15px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
          Edificio Admin
        </span>
      </div>

      <div className="relative z-10 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="font-title text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground">
          Gestiona tu edificio desde un solo lugar
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-muted-foreground">
          Residentes, pagos y mantenimiento centralizados en un panel diseñado para administradores exigentes.
        </p>
      </div>

      <p className="font-caption relative z-10 text-[11px] uppercase leading-[1.3] tracking-[0.08em] text-muted-foreground">
        © 2026 Sistema Administración Edificio
      </p>
    </div>
  );
}
