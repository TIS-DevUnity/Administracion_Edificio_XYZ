"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Search, Users, Wallet } from "lucide-react";

import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeAcceder } from "@/lib/permissions";
import { Documento, ETIQUETA_CATEGORIA, listarDocumentos } from "@/lib/documentos";
import {
  Inmueble,
  Ocupante,
  esOcupanteActivo,
  etiquetaRol,
  listarInmuebles,
  listarOcupantes,
} from "@/lib/inmuebles";
import { Copropietario, listarCopropietarios } from "@/lib/copropietarios";
import { financeService } from "@/services/finance.service";
import { ExpensaDTO } from "@/types/finance";

type TipoResultado = "documento" | "inmueble" | "copropietario" | "residente" | "pago";

interface ResultadoBusqueda {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
}

interface DatosCacheados {
  documentos: Documento[];
  inmuebles: Inmueble[];
  copropietarios: Copropietario[];
  expensas: ExpensaDTO[];
  residentes: { ocupante: Ocupante; inmueble: Inmueble }[];
}

const TIPOS_ORDEN: TipoResultado[] = ["documento", "inmueble", "copropietario", "residente", "pago"];

const ICONOS: Record<TipoResultado, typeof FileText> = {
  documento: FileText,
  inmueble: Building2,
  copropietario: Users,
  residente: Users,
  pago: Wallet,
};

const ETIQUETAS_GRUPO: Record<TipoResultado, string> = {
  documento: "Documentos",
  inmueble: "Propiedades",
  copropietario: "Copropietarios",
  residente: "Residentes",
  pago: "Pagos",
};

export function BusquedaGlobal() {
  const router = useRouter();
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const [strQuery, setStrQuery] = useState("");
  const [strQueryDebounced, setStrQueryDebounced] = useState("");
  const [bolAbierto, setBolAbierto] = useState(false);
  const [bolCargando, setBolCargando] = useState(false);

  const [datosCache, setDatosCache] = useState<DatosCacheados | null>(null);
  const refContenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setStrQueryDebounced(strQuery), 300);
    return () => clearTimeout(timer);
  }, [strQuery]);

  useEffect(() => {
    function handleClickFuera(event: MouseEvent) {
      if (refContenedor.current && !refContenedor.current.contains(event.target as Node)) {
        setBolAbierto(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setBolAbierto(false);
    }
    document.addEventListener("mousedown", handleClickFuera);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickFuera);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function asegurarDatosCargados() {
    if (datosCache) return;
    setBolCargando(true);

    try {
      const [documentos, inmuebles, copropietarios, expensas] = await Promise.all([
        puedeAcceder(rol, "documentos") ? listarDocumentos() : Promise.resolve([]),
        puedeAcceder(rol, "inmuebles") ? listarInmuebles() : Promise.resolve([]),
        puedeAcceder(rol, "copropietarios") ? listarCopropietarios() : Promise.resolve([]),
        puedeAcceder(rol, "morosidad") ? financeService.getExpensas() : Promise.resolve([]),
      ]);

      let residentes: { ocupante: Ocupante; inmueble: Inmueble }[] = [];
      if (puedeAcceder(rol, "residentes") && inmuebles.length > 0) {
        const listas = await Promise.all(
          inmuebles.map((inmueble) =>
            listarOcupantes(inmueble.id)
              .then((ocupantes) => ocupantes.filter(esOcupanteActivo).map((ocupante) => ({ ocupante, inmueble })))
              .catch(() => [])
          )
        );
        residentes = listas.flat();
      }

      setDatosCache({ documentos, inmuebles, copropietarios, expensas, residentes });
    } catch (error) {
      console.error("Error al cargar datos para la búsqueda global:", error);
      setDatosCache({ documentos: [], inmuebles: [], copropietarios: [], expensas: [], residentes: [] });
    } finally {
      setBolCargando(false);
    }
  }

  function handleFocus() {
    setBolAbierto(true);
    void asegurarDatosCargados();
  }

  function handleChange(valor: string) {
    setStrQuery(valor);
    if (!bolAbierto) setBolAbierto(true);
  }

  function handleClickResultado(resultado: ResultadoBusqueda) {
    setBolAbierto(false);
    setStrQuery("");
    router.push(resultado.href);
  }

  const resultados = useMemo<ResultadoBusqueda[]>(() => {
    const strTermino = strQueryDebounced.trim().toLowerCase();
    if (!strTermino || !datosCache) return [];

    const datos = datosCache;
    const arr: ResultadoBusqueda[] = [];

    datos.documentos
      .filter((doc) => doc.nombre.toLowerCase().includes(strTermino))
      .forEach((doc) =>
        arr.push({
          tipo: "documento",
          id: doc.id,
          titulo: doc.nombre,
          subtitulo: ETIQUETA_CATEGORIA[doc.categoria],
          href: `/admin/documentos?q=${encodeURIComponent(doc.nombre)}`,
        })
      );

    datos.inmuebles
      .filter(
        (inmueble) =>
          inmueble.codigo.toLowerCase().includes(strTermino) ||
          (inmueble.piso ?? "").toLowerCase().includes(strTermino) ||
          inmueble.tipoInmueble.nombre.toLowerCase().includes(strTermino)
      )
      .forEach((inmueble) =>
        arr.push({
          tipo: "inmueble",
          id: inmueble.id,
          titulo: inmueble.codigo,
          subtitulo: `${inmueble.tipoInmueble.nombre}${inmueble.piso ? ` · Piso ${inmueble.piso}` : ""}`,
          href: `/admin/inmuebles?q=${encodeURIComponent(inmueble.codigo)}`,
        })
      );

    datos.copropietarios
      .filter(
        (c) =>
          `${c.nombre} ${c.apellido}`.toLowerCase().includes(strTermino) ||
          c.ci.toLowerCase().includes(strTermino) ||
          (c.email ?? "").toLowerCase().includes(strTermino)
      )
      .forEach((c) =>
        arr.push({
          tipo: "copropietario",
          id: c.id,
          titulo: `${c.nombre} ${c.apellido}`,
          subtitulo: `CI ${c.ci}`,
          href: `/admin/copropietarios?q=${encodeURIComponent(`${c.nombre} ${c.apellido}`)}`,
        })
      );

    datos.residentes
      .filter(
        ({ ocupante }) =>
          `${ocupante.copropietario.nombre} ${ocupante.copropietario.apellido}`.toLowerCase().includes(strTermino) ||
          ocupante.copropietario.ci.toLowerCase().includes(strTermino)
      )
      .forEach(({ ocupante, inmueble }) =>
        arr.push({
          tipo: "residente",
          id: ocupante.id,
          titulo: `${ocupante.copropietario.nombre} ${ocupante.copropietario.apellido}`,
          subtitulo: `${etiquetaRol(ocupante.esPropietario)} en ${inmueble.codigo}`,
          href: `/admin/residentes?inmuebleId=${inmueble.id}`,
        })
      );

    datos.expensas
      .filter(
        (exp) =>
          exp.inmueble.codigo.toLowerCase().includes(strTermino) || exp.periodo.toLowerCase().includes(strTermino)
      )
      .forEach((exp) =>
        arr.push({
          tipo: "pago",
          id: exp.id,
          titulo: `${exp.inmueble.codigo} · ${exp.periodo}`,
          subtitulo: `Estado: ${exp.estado}`,
          href: `/admin/morosidad?q=${encodeURIComponent(exp.inmueble.codigo)}`,
        })
      );

    return arr;
  }, [strQueryDebounced, datosCache]);

  return (
    <div ref={refContenedor} className="relative hidden sm:block">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar..."
          value={strQuery}
          onFocus={handleFocus}
          onChange={(event) => handleChange(event.target.value)}
          className="h-9 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </div>

      {bolAbierto && strQuery.trim() && (
        <div className="absolute right-0 top-11 z-50 max-h-[70vh] w-80 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {bolCargando ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-muted-foreground">
              Sin resultados para &quot;{strQueryDebounced}&quot;.
            </p>
          ) : (
            TIPOS_ORDEN.map((tipo) => {
              const items = resultados.filter((r) => r.tipo === tipo).slice(0, 5);
              if (items.length === 0) return null;
              const Icono = ICONOS[tipo];

              return (
                <div key={tipo} className="border-b border-border py-1.5 last:border-0">
                  <p className="font-caption px-3 py-1 text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                    {ETIQUETAS_GRUPO[tipo]}
                  </p>
                  {items.map((resultado) => (
                    <button
                      key={`${resultado.tipo}-${resultado.id}`}
                      type="button"
                      onClick={() => handleClickResultado(resultado)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">{resultado.titulo}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {resultado.subtitulo}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
