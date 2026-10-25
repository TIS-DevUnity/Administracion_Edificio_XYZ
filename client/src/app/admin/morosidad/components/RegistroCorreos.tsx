"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notificacionesService } from "@/services/notificaciones.service";
import type { EnvioCorreoDTO, EstadoEnvioCorreo, EstadoServicioCorreoDTO, PaginaEnviosCorreoDTO } from "@/types/notificaciones";
import { formatearFecha, obtenerMensajeError } from "../utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";
const POR_PAGINA = 20;

const ETIQUETA_ESTADO: Record<EstadoEnvioCorreo, string> = {
  ENVIADO: "Enviado",
  FALLIDO: "Fallido",
  OMITIDO: "Omitido",
};

const CLASE_ESTADO: Record<EstadoEnvioCorreo, string> = {
  ENVIADO: "bg-success-subtle text-success",
  FALLIDO: "bg-danger-subtle text-destructive",
  OMITIDO: "bg-muted text-muted-foreground",
};

const ETIQUETA_TIPO: Record<string, string> = {
  EXPENSA_GENERADA: "Expensa generada",
  MORA_APLICADA: "Mora aplicada",
};

/**
 * Aviso cuando el servidor no tiene configurado el correo: las expensas se generan igual y la
 * campanita sigue funcionando, pero los avisos por correo quedan como OMITIDOS.
 */
export function AvisoServicioCorreo({ onVerRegistro }: { onVerRegistro: () => void }) {
  const [estado, setEstado] = useState<EstadoServicioCorreoDTO | null>(null);

  useEffect(() => {
    let bolCancelado = false;
    notificacionesService
      .estadoCorreo()
      .then((datos) => !bolCancelado && setEstado(datos))
      .catch(() => undefined);
    return () => {
      bolCancelado = true;
    };
  }, []);

  if (!estado || (estado.configurado && estado.modo === "PRODUCCION")) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] leading-[1.45] text-foreground">
        <Mail className="mr-1.5 inline h-4 w-4 text-accent-secondary" />
        {!estado.configurado
          ? "El envío de correos no está configurado en el servidor: las expensas se generan igual y los avisos quedan registrados como omitidos."
          : estado.modo === "REDIRIGIDO"
            ? "Entorno de pruebas: los correos se redirigen a una casilla de prueba, no a los residentes."
            : "Entorno de pruebas: el envío de correos está bloqueado."}
      </p>
      <Button size="sm" variant="outline" onClick={onVerRegistro}>Ver registro de correos</Button>
    </div>
  );
}

/** Registro de avisos por correo (enviados, fallidos u omitidos y su motivo). Administrador y Directorio. */
export function DialogoRegistroCorreos({ bolAbierto, onCerrar }: { bolAbierto: boolean; onCerrar: () => void }) {
  const [strEstado, setStrEstado] = useState<EstadoEnvioCorreo | "TODOS">("TODOS");
  const [intPagina, setIntPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaEnviosCorreoDTO | null>(null);
  const [bolCargando, setBolCargando] = useState(false);
  const [strError, setStrError] = useState("");

  async function cargar(estado = strEstado, pagina = intPagina) {
    setBolCargando(true);
    setStrError("");
    try {
      setDatos(
        await notificacionesService.listarCorreos({
          pagina,
          porPagina: POR_PAGINA,
          ...(estado !== "TODOS" ? { estado } : {}),
        })
      );
    } catch (error) {
      setStrError(obtenerMensajeError(error, "No se pudo cargar el registro de correos."));
    } finally {
      setBolCargando(false);
    }
  }

  useEffect(() => {
    if (!bolAbierto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolAbierto]);

  function cambiarPagina(intNueva: number) {
    setIntPagina(intNueva);
    void cargar(strEstado, intNueva);
  }

  const envios: EnvioCorreoDTO[] = datos?.envios ?? [];
  const intTotalPaginas = Math.max(datos?.paginacion.totalPaginas ?? 1, 1);

  return (
    <Dialog open={bolAbierto} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>Registro de correos</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
            Avisos de expensa generada y de mora aplicada. Si un correo no existe o no es válido, la expensa se genera
            igual y aquí queda el motivo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select
            value={strEstado}
            onValueChange={(valor: EstadoEnvioCorreo | "TODOS") => {
              setStrEstado(valor);
              setIntPagina(1);
              void cargar(valor, 1);
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los estados</SelectItem>
              {(Object.keys(ETIQUETA_ESTADO) as EstadoEnvioCorreo[]).map((estado) => (
                <SelectItem key={estado} value={estado}>{ETIQUETA_ESTADO[estado]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" cargando={bolCargando} onClick={() => void cargar()}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>

        {strError && <p role="alert" className={CLASE_AVISO_ERROR}>{strError}</p>}

        {bolCargando && !datos ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : envios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
            No hay avisos por correo registrados{strEstado !== "TODOS" ? ` con estado "${ETIQUETA_ESTADO[strEstado]}"` : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={CLASE_HEADER_TABLA}>Fecha</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Aviso</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Destinatario</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((envio) => (
                  <TableRow key={envio.id}>
                    <TableCell className="whitespace-nowrap text-[13px] text-foreground">{formatearFecha(envio.createdAt)}</TableCell>
                    <TableCell>
                      <p className="text-[13px] text-foreground">{ETIQUETA_TIPO[envio.tipo] ?? envio.tipo}</p>
                      <p className={CLASE_AYUDA}>
                        {[envio.inmueble, envio.periodo].filter(Boolean).join(" · ") || envio.asunto}
                      </p>
                    </TableCell>
                    <TableCell className="break-all text-[13px] text-foreground">{envio.destinatario || "—"}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <Badge className={`font-caption text-[11px] ${CLASE_ESTADO[envio.estado]}`}>{ETIQUETA_ESTADO[envio.estado]}</Badge>
                      {envio.motivo && <p className={`${CLASE_AYUDA} mt-1`}>{envio.motivo}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className={CLASE_AYUDA}>
            Página {datos?.paginacion.pagina ?? intPagina} de {intTotalPaginas} · {datos?.paginacion.total ?? 0} avisos
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={intPagina <= 1 || bolCargando} onClick={() => cambiarPagina(intPagina - 1)}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={intPagina >= intTotalPaginas || bolCargando} onClick={() => cambiarPagina(intPagina + 1)}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
