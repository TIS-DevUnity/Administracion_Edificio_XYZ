"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSesionActual, cerrarSesion } from "@/lib/session";
import { normalizarRol, obtenerSeccionPorRuta, puedeAcceder, SECCIONES_NAV } from "@/lib/permissions";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BusquedaGlobal } from "@/components/BusquedaGlobal";
import { LogoMark } from "@/components/LogoMark";

function formatRol(strRol: string) {
  switch (strRol) {
    case "ROL_1":
    case "ADMINISTRADOR":
      return "Administrador";

    case "DIRECTORIO":
      return "Directorio";

    case "CONSULTA":
      return "Consulta";

    default:
      return strRol;
  }
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, strToken } = useSesionActual();

  useEffect(() => {
    if (!strToken || !usuario) {
      cerrarSesion();
      router.replace("/login");
    }
  }, [strToken, usuario, router]);

  function handleLogout() {
    cerrarSesion();
    router.replace("/login");
  }

  if (!usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-[14px] text-muted-foreground">Cargando panel...</div>
      </div>
    );
  }

  const rol = normalizarRol(usuario.rol);
  const seccionActual = obtenerSeccionPorRuta(pathname);
  const bolAutorizado = puedeAcceder(rol, seccionActual);
  const seccionesVisibles = SECCIONES_NAV.filter((seccion) => puedeAcceder(rol, seccion.id));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="animate-in fade-in slide-in-from-left-4 duration-500 hidden w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <div>
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-lg shadow-sidebar-primary/30">
              <LogoMark className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-sidebar-foreground">
              Edificio Admin
            </span>
          </div>

          <nav className="flex flex-col gap-0.5">
            {seccionesVisibles.map((seccion) => (
              <Link
                key={seccion.id}
                href={seccion.href}
                className={`font-subtitle flex h-9 items-center rounded-lg px-3 text-[14px] font-medium leading-[1.3] tracking-[-0.005em] transition-[background-color,color,box-shadow,transform] duration-200 ${
                  seccion.id === seccionActual
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/25"
                    : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                {seccion.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="rounded-lg border border-sidebar-border px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 rounded-full bg-sidebar-accent" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium leading-[1.3] text-sidebar-foreground">
                {usuario.nombre} {usuario.apellido}
              </p>
              <p className="font-caption truncate text-[11px] leading-[1.3] tracking-[0.01em] text-sidebar-foreground/60">
                {formatRol(usuario.rol)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex h-9 w-full items-center justify-center rounded-lg border border-sidebar-border text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card/95 px-6">
          <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
            {SECCIONES_NAV.find((seccion) => seccion.id === seccionActual)?.label ?? "Panel principal"}
          </h1>

          <div className="flex items-center gap-3">
            <BusquedaGlobal />

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Notificaciones"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <div className="h-9 w-9 rounded-full bg-muted" />
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto">
          {bolAutorizado ? children : <AccesoDenegado />}
        </main>
      </div>
    </div>
  );
}
