"use client";

import { Info, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExpensaDTO, ConfiguracionMoraDTO, EstadoExpensa } from "@/types/finance";
import { formatCurrency, formatearFecha, formatearFechaCalendario, estaEnPeriodoGracia, tieneMoraAplicada } from "../utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO = CLASE_HEADER_TABLA;
const CLASE_SECUNDARIA = "font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground";

export const ETIQUETA_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
  PENDIENTE: "Pendiente",
  PARCIAL: "Pago parcial",
};

const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success",
  VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-accent-secondary/10 text-accent-secondary",
};

export function BadgeEstadoExpensa({ estado }: { estado: EstadoExpensa }) {
  return <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

function etiquetaRol(rol: ExpensaDTO["responsableRol"]) {
  return rol === "PROPIETARIO" ? "Propietario" : rol === "INQUILINO" ? "Inquilino" : "Sin rol";
}

function Indicadores({ exp, historial, bolCorto = false }: { exp: ExpensaDTO; historial: ConfiguracionMoraDTO[]; bolCorto?: boolean }) {
  return (
    <>
      {estaEnPeriodoGracia(exp, historial) && (
        <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
          {bolCorto ? "En gracia" : "En período de gracia"}
        </Badge>
      )}
      {tieneMoraAplicada(exp) && (
        <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">Mora aplicada</Badge>
      )}
    </>
  );
}

interface Props {
  filteredExpensas: ExpensaDTO[];
  totalCargadas: number;
  historialConfiguracion: ConfiguracionMoraDTO[];
  bolPuedeGestionar: boolean;
  errorCarga: string;
  onDetalle: (exp: ExpensaDTO) => void;
  onPago: (exp: ExpensaDTO) => void;
}

export function TablaExpensas({ filteredExpensas, totalCargadas, historialConfiguracion,
  bolPuedeGestionar, errorCarga, onDetalle, onPago }: Props) {
  const strVacio = errorCarga
    ? "No se pudo cargar la información."
    : totalCargadas === 0
      ? "No hay expensas para el mes y los filtros elegidos."
      : "Ninguna expensa coincide con los filtros de esta página.";

  return (
    <>
      {/* Vista tabla (md en adelante) */}
      <div className="hidden w-full overflow-x-auto md:block">
        <Table className="min-w-230">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${CLASE_HEADER_TABLA} pl-5`}>Departamento</TableHead>
              <TableHead className={CLASE_HEADER_TABLA}>Responsable</TableHead>
              <TableHead className={CLASE_HEADER_TABLA}>Vencimiento</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Expensa</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Mora</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total exigible</TableHead>
              <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
              <TableHead className={`${CLASE_HEADER_TABLA} pr-5 text-right`}>Acciones</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredExpensas.map((exp) => {
              const intMora = Number(exp.montoMora || 0);
              const totalExigible = Number(exp.montoTotal) + intMora;

              return (
                <TableRow key={exp.id}>
                  <TableCell className="py-3 pl-5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-title flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[13px] font-bold text-primary">
                        {exp.tipoNombre || "—"}
                      </span>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{exp.inmueble.codigo}</p>
                        <p className={CLASE_SECUNDARIA}>
                          {exp.tipoNombre ? `Tipo ${exp.tipoNombre}` : "Sin tipo"} · {exp.periodo}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3">
                    <p className="text-[13px] text-foreground">{exp.responsableNombre || "No registrado"}</p>
                    <p className={CLASE_SECUNDARIA}>{etiquetaRol(exp.responsableRol)}</p>
                  </TableCell>

                  <TableCell className="py-3">
                    <p className="text-[13px] text-foreground">{formatearFechaCalendario(exp.fechaVencimiento)}</p>
                    <p className={CLASE_SECUNDARIA}>Generada {formatearFecha(exp.createdAt)}</p>
                  </TableCell>

                  <TableCell className="py-3 text-right">
                    <p className="text-[13px] tabular-nums text-foreground">{formatCurrency(Number(exp.montoTotal))}</p>
                    <p className={`${CLASE_SECUNDARIA} tabular-nums`}>
                      Fija {formatCurrency(Number(exp.montoBase))} + agua {formatCurrency(Number(exp.montoAgua))}
                    </p>
                  </TableCell>

                  <TableCell className={`py-3 text-right text-[13px] tabular-nums ${intMora > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {intMora > 0 ? formatCurrency(intMora) : "—"}
                  </TableCell>

                  <TableCell className="py-3 text-right text-[13px] font-medium tabular-nums text-foreground">
                    {formatCurrency(totalExigible)}
                  </TableCell>

                  <TableCell className="py-3">
                    <div className="flex flex-col items-start gap-1">
                      <BadgeEstadoExpensa estado={exp.estado} />
                      <Indicadores exp={exp} historial={historialConfiguracion} />
                    </div>
                  </TableCell>

                  <TableCell className="py-3 pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onDetalle(exp)}>
                        <Info className="h-4 w-4" />
                        Detalle
                      </Button>
                      {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                        <Button variant="outline" size="sm" onClick={() => onPago(exp)}>
                          <Wallet className="h-4 w-4" />
                          Pagar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredExpensas.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-[13px] text-muted-foreground">
                  {strVacio}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Vista tarjetas (mobile) */}
      <div className="flex flex-col gap-3 p-4 md:hidden">
        {filteredExpensas.map((exp) => {
          const intMora = Number(exp.montoMora || 0);
          const totalExigible = Number(exp.montoTotal) + intMora;

          return (
            <div key={exp.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-title flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[14px] font-bold text-primary">
                    {exp.tipoNombre || "—"}
                  </span>
                  <div>
                    <p className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
                      {exp.inmueble.codigo}
                    </p>
                    <p className={CLASE_SECUNDARIA}>
                      {exp.periodo} · {exp.responsableNombre || "Sin responsable"} ({etiquetaRol(exp.responsableRol)})
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <BadgeEstadoExpensa estado={exp.estado} />
                  <Indicadores exp={exp} historial={historialConfiguracion} bolCorto />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Vencimiento</p>
                  <p className="text-[13px] text-foreground">{formatearFechaCalendario(exp.fechaVencimiento)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Generada</p>
                  <p className="text-[13px] text-foreground">{formatearFecha(exp.createdAt)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Expensa</p>
                  <p className="text-[13px] tabular-nums text-foreground">{formatCurrency(Number(exp.montoTotal))}</p>
                  <p className={`${CLASE_SECUNDARIA} tabular-nums`}>
                    Fija {formatCurrency(Number(exp.montoBase))} + agua {formatCurrency(Number(exp.montoAgua))}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Mora</p>
                  <p className={`text-[13px] tabular-nums ${intMora > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {intMora > 0 ? formatCurrency(intMora) : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Total exigible</p>
                  <p className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums text-foreground">
                    {formatCurrency(totalExigible)}
                  </p>
                </div>

                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => onDetalle(exp)}>
                    <Info className="h-4 w-4" />
                    Detalle
                  </Button>
                  {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                    <Button size="sm" onClick={() => onPago(exp)}>
                      <Wallet className="h-4 w-4" />
                      Pagar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredExpensas.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">{strVacio}</p>
        )}
      </div>
    </>
  );
}
