import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

const arrPerfiles = [
  {
    rol: "Administrador",
    propiedad: "Condominio Los Pinos",
    descripcion: "Gestión completa del edificio",
  },
  {
    rol: "Copropietario",
    propiedad: "Condominio Vista Verde",
    descripcion: "Depto. 4B",
  },
  {
    rol: "Guardia",
    propiedad: "Condominio Los Pinos",
    descripcion: "Turno noche",
  },
];

export default function SeleccionarPerfilPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <LogoMark className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              ¿Cómo quieres ingresar?
            </h1>
            <p className="font-subtitle mt-1 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
              Tu cuenta tiene más de un perfil
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {arrPerfiles.map((objPerfil) => (
            <Link
              key={`${objPerfil.rol}-${objPerfil.propiedad}`}
              href="/admin"
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[14px] font-bold text-primary">
                  {objPerfil.rol.charAt(0)}
                </div>
                <div>
                  <p className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
                    {objPerfil.rol}
                  </p>
                  <p className="text-[13px] leading-[1.45] text-foreground">{objPerfil.propiedad}</p>
                  <p className="font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                    {objPerfil.descripcion}
                  </p>
                </div>
              </div>

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </div>

        <Link
          href="/login"
          className="font-caption mt-6 block text-center text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground hover:text-foreground"
        >
          ← Salir y volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
