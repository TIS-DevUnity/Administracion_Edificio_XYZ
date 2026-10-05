"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { useSesionActual, cerrarSesion } from "@/lib/session";
import {
  normalizarRol,
  obtenerSeccionPorRuta,
  puedeAcceder,
  SeccionId,
  SECCIONES_NAV,
} from "@/lib/permissions";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BusquedaGlobal } from "@/components/BusquedaGlobal";
import { LogoMark } from "@/components/LogoMark";

const ICONO_SECCION: Record<SeccionId, LucideIcon> = {
  panel: LayoutDashboard,
  finanzas: LineChart,
  edificios: Building,
  inmuebles: Building2,
  residentes: UserCheck,
  copropietarios: Users,
  pagos: Wallet,
  morosidad: CalendarClock,
  documentos: FileText,
  auditoria: ClipboardList,
  mantenimiento: Wrench,
  usuarios: UserCog,
  roles: ShieldCheck,
};

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

  const [bolMenuMovilAbierto, setBolMenuMovilAbierto] = useState(false);

  // La sesión vive en localStorage y se lee vía useSyncExternalStore, que en la
  // primera renderización (SSR/hidratación) devuelve un snapshot vacío antes de
  // corregirse con el valor real del navegador. Sin esta bandera, ese vacío
  // transitorio hacía que este efecto interpretara "no hay sesión" en cada
  // recarga de página y cerrara una sesión que sí era válida. Se espera a que el
  // componente termine de montarse (un ciclo de render aparte, ya con el
  // snapshot corregido) antes de decidir si corresponde redirigir.
  const [bolListoParaVerificar, setBolListoParaVerificar] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBolListoParaVerificar(true);
  }, []);

  useEffect(() => {
    if (!bolListoParaVerificar) return;

    if (!strToken || !usuario) {
      cerrarSesion();
      router.replace("/login");
    }
  }, [bolListoParaVerificar, strToken, usuario, router]);

  function handleLogout() {
    setBolMenuMovilAbierto(false);
    cerrarSesion();
    router.replace("/login");
  }

  function handleNavegacionMovil() {
    setBolMenuMovilAbierto(false);
  }

  if (!bolListoParaVerificar || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-[14px] text-muted-foreground">
          Cargando panel...
        </div>
      </div>
    );
  }

  const rol = normalizarRol(usuario.rol);
  const seccionActual = obtenerSeccionPorRuta(pathname);
  const bolAutorizado = puedeAcceder(rol, seccionActual);

  const seccionesVisibles = SECCIONES_NAV.filter((seccion) =>
    puedeAcceder(rol, seccion.id)
  );

  const strTituloActual =
    SECCIONES_NAV.find((seccion) => seccion.id === seccionActual)?.label ??
    "Panel principal";

  return (
    <div className="flex min-h-screen bg-background">
      {/* ============================================================
          SIDEBAR DESKTOP
          ============================================================ */}
      <aside className="animate-in fade-in slide-in-from-left-4 duration-500 sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between overflow-x-hidden border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Logo */}
          <div className="mb-8 flex shrink-0 items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-lg shadow-sidebar-primary/30">
              <LogoMark className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>

            <span className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-sidebar-foreground">
              Edificio Admin
            </span>
          </div>

          {/* Navegación */}
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
            {seccionesVisibles.map((seccion) => {
              const Icono = ICONO_SECCION[seccion.id];
              return (
                <Link
                  key={seccion.id}
                  href={seccion.href}
                  className={`font-subtitle flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium leading-[1.3] tracking-[-0.005em] transition-[background-color,color,box-shadow,transform] duration-200 ${
                    seccion.id === seccionActual
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/25"
                      : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icono className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{seccion.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Usuario desktop */}
        <div className="mt-4 shrink-0 rounded-lg border border-sidebar-border px-2.5 py-2">
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

      {/* ============================================================
          OVERLAY DEL MENÚ MÓVIL
          ============================================================ */}
      {bolMenuMovilAbierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setBolMenuMovilAbierto(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* ============================================================
          SIDEBAR MÓVIL
          ============================================================ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col justify-between border-r border-sidebar-border bg-sidebar px-4 py-6 shadow-2xl transition-transform duration-300 lg:hidden ${
          bolMenuMovilAbierto
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div>
          {/* Header del menú móvil */}
          <div className="mb-8 flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-lg shadow-sidebar-primary/30">
                <LogoMark className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>

              <span className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-sidebar-foreground">
                Edificio Admin
              </span>
            </div>

            <button
              type="button"
              onClick={() => setBolMenuMovilAbierto(false)}
              aria-label="Cerrar menú"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navegación móvil */}
          <nav className="flex max-h-[calc(100vh-180px)] flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
            {seccionesVisibles.map((seccion) => {
              const Icono = ICONO_SECCION[seccion.id];
              return (
                <Link
                  key={seccion.id}
                  href={seccion.href}
                  onClick={handleNavegacionMovil}
                  className={`font-subtitle flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium leading-[1.3] tracking-[-0.005em] transition-colors duration-200 ${
                    seccion.id === seccionActual
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/25"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icono className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{seccion.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Usuario móvil */}
        <div className="rounded-lg border border-sidebar-border px-2.5 py-3">
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
            className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-sidebar-border text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ============================================================
          CONTENIDO PRINCIPAL
          ============================================================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ==========================================================
            HEADER
            ========================================================== */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Botón menú móvil */}
            <button
              type="button"
              onClick={() => setBolMenuMovilAbierto(true)}
              aria-label="Abrir menú"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Título */}
            <h1 className="font-title truncate text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground sm:text-[20px]">
              {strTituloActual}
            </h1>
          </div>

          {/* Acciones del header */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Búsqueda:
                se mantiene en desktop y se oculta en pantallas pequeñas
                para evitar que el header quede apretado. */}
            <div className="hidden sm:block">
              <BusquedaGlobal />
            </div>

            {/* Notificaciones */}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Notificaciones"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.73 21a2 2 0 0 1-3.46 0"
                />
              </svg>
            </button>

            {/* Avatar */}
            <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
          </div>
        </header>

        {/* ==========================================================
            CONTENIDO DE LA PÁGINA
            ========================================================== */}
        <main className="flex flex-1 flex-col overflow-y-auto">
          {bolAutorizado ? children : <AccesoDenegado />}
        </main>
      </div>
    </div>
  );
}