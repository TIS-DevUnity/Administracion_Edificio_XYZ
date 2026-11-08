"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Comunicado, EstadoComunicado, ETIQUETAS_CANAL, ETIQUETAS_ESTADO, fechaComunicado,
} from "@/lib/comunicados";

interface Props {
  comunicados: Comunicado[];
  puedeGestionar: boolean;
  onVer: (id: string) => void;
  onEditar: (comunicado: Comunicado) => void;
  onEliminar: (comunicado: Comunicado) => void;
}

type FiltroEstado = "TODOS" | EstadoComunicado;

function BadgeEstado({ estado }: { estado: EstadoComunicado }) {
  const estilo = estado === "ENVIADO" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : estado === "FALLIDO" ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-zinc-100 text-zinc-700 border-zinc-200";
  return <Badge variant="outline" className={estilo}>{ETIQUETAS_ESTADO[estado]}</Badge>;
}

export function HistorialComunicados({ comunicados, puedeGestionar, onVer, onEditar, onEliminar }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("TODOS");

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return comunicados.filter((comunicado) => {
      if (estado !== "TODOS" && comunicado.estado !== estado) return false;
      return !termino || comunicado.titulo.toLocaleLowerCase("es").includes(termino)
        || comunicado.cuerpo.toLocaleLowerCase("es").includes(termino);
    });
  }, [busqueda, estado, comunicados]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar comunicados" className="pl-9" placeholder="Buscar por título o mensaje..." value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />
        </div>
        <select
          aria-label="Filtrar comunicados por estado"
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-primary sm:w-48"
          value={estado}
          onChange={(event) => setEstado(event.target.value as FiltroEstado)}
        >
          <option value="TODOS">Todos los estados</option>
          <option value="BORRADOR">Borradores</option>
          <option value="ENVIADO">Enviados</option>
          <option value="FALLIDO">Fallidos</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Redactado por</TableHead>
              <TableHead>Canales</TableHead>
              <TableHead>Destinatarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                {comunicados.length === 0 ? "Todavía no hay comunicados registrados." : "No hay comunicados que coincidan con los filtros."}
              </TableCell></TableRow>
            ) : visibles.map((comunicado) => (
              <TableRow key={comunicado.id}>
                <TableCell className="max-w-60">
                  <p className="truncate font-medium" title={comunicado.titulo}>{comunicado.titulo}</p>
                  <p className="max-w-60 truncate text-xs text-muted-foreground">{comunicado.cuerpo}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{fechaComunicado(comunicado.enviadoEn ?? comunicado.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{comunicado.creadoPor ? `${comunicado.creadoPor.nombre} ${comunicado.creadoPor.apellido}` : "No disponible"}</TableCell>
                <TableCell className="text-xs">{comunicado.canales.map((canal) => ETIQUETAS_CANAL[canal]).join(" / ")}</TableCell>
                <TableCell className="text-center text-xs">{comunicado.totalDestinatarios ?? "—"}</TableCell>
                <TableCell><BadgeEstado estado={comunicado.estado} /></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" title="Ver detalle" aria-label={`Ver ${comunicado.titulo}`} onClick={() => onVer(comunicado.id)}><Eye /></Button>
                    {puedeGestionar && comunicado.estado === "BORRADOR" && (
                      <>
                        <Button size="icon-sm" variant="ghost" title="Editar borrador" aria-label={`Editar ${comunicado.titulo}`} onClick={() => onEditar(comunicado)}><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" title="Eliminar borrador" aria-label={`Eliminar ${comunicado.titulo}`} onClick={() => onEliminar(comunicado)}><Trash2 className="text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Mostrando {visibles.length} de {comunicados.length} comunicados. Los borradores solo son visibles para Administrador.</p>
    </div>
  );
}
