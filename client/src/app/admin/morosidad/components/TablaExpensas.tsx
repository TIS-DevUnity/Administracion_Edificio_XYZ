"use client";

import { Building2, Info, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExpensaDTO, ConfiguracionMoraDTO, EstadoExpensa } from "@/types/finance";
import { formatCurrency, formatearFecha, formatearFechaCalendario, estaEnPeriodoGracia, tieneMoraAplicada } from "../utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase text-muted-foreground";
const CLASE_LABEL_CAMPO = CLASE_HEADER_TABLA;
const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success", VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground", PARCIAL: "bg-muted text-muted-foreground",
};

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
  return (
    <>
              {/* Vista tabla (md en adelante) */}
              <div className="hidden w-full overflow-x-auto md:block">
                <Table className="min-w-[1520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Periodo</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Inmueble</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Tipo</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Responsable</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Generada</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Vencimiento</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Tarifa fija</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Agua</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total expensa</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Mora</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Total exigible</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-center`}>Estado</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>
                        {bolPuedeGestionar ? "Acción" : ""}
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredExpensas.map((exp) => {
                      const totalExigible = Number(exp.montoTotal) + Number(exp.montoMora || 0);

                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="text-[13px] text-foreground">{exp.periodo}</TableCell>

                          <TableCell className="text-[13px] text-foreground">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {exp.inmueble.codigo}
                            </div>
                          </TableCell>

                          <TableCell className="text-[13px] text-foreground">
                            {exp.tipoNombre ? (
                              <Badge variant="outline">{exp.tipoNombre}</Badge>
                            ) : (
                              <span className="text-muted-foreground">No registrado</span>
                            )}
                          </TableCell>

                          <TableCell className="text-[12px] text-foreground">
                            <div className="font-medium">{exp.responsableNombre || "No registrado"}</div>
                            <div className="text-muted-foreground">{exp.responsableRol === "PROPIETARIO" ? "Propietario" : exp.responsableRol === "INQUILINO" ? "Inquilino" : "Sin rol"}</div>
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatearFecha(exp.createdAt)}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatearFechaCalendario(exp.fechaVencimiento)}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-foreground">
                            {formatCurrency(Number(exp.montoBase))}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-foreground">
                            {formatCurrency(Number(exp.montoAgua))}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-foreground">
                            {formatCurrency(Number(exp.montoTotal))}
                          </TableCell>

                          <TableCell className="text-right text-[13px] text-destructive">
                            {formatCurrency(Number(exp.montoMora || 0))}
                          </TableCell>

                          <TableCell className="text-right text-[13px] font-semibold text-foreground">
                            {formatCurrency(totalExigible)}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                                {exp.estado}
                              </Badge>
                              {estaEnPeriodoGracia(exp, historialConfiguracion) && (
                                <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
                                  En período de gracia
                                </Badge>
                              )}
                              {tieneMoraAplicada(exp) && (
                                <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">
                                  Mora aplicada
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => onDetalle(exp)}>
                                <Info className="mr-2 h-4 w-4" />
                                Detalle
                              </Button>
                              {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                                <Button variant="ghost" size="sm" onClick={() => onPago(exp)}>
                                  <Wallet className="mr-2 h-4 w-4" />
                                  Registrar pago
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredExpensas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={13} className="py-8 text-center text-[13px] text-muted-foreground">
                          {errorCarga ? "No se pudo cargar la información." : totalCargadas === 0 ? "No hay expensas para los filtros elegidos en el servidor." : "Ninguna expensa coincide con los filtros seleccionados."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Vista tarjetas (mobile) */}
              <div className="flex flex-col gap-3 p-4 md:hidden">
                {filteredExpensas.map((exp) => {
                  const totalExigible = Number(exp.montoTotal) + Number(exp.montoMora || 0);

                  return (
                    <div
                      key={exp.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-subtitle text-[14px] font-semibold leading-[1.4] text-foreground">
                            {exp.periodo}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {exp.inmueble.codigo}
                          </div>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            Tipo: {exp.tipoNombre || "No registrado"}
                          </p>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            Responsable: {exp.responsableNombre || "No registrado"}
                            {exp.responsableRol ? ` (${exp.responsableRol === "PROPIETARIO" ? "Propietario" : "Inquilino"})` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                            {exp.estado}
                          </Badge>
                          {estaEnPeriodoGracia(exp, historialConfiguracion) && (
                            <Badge className="font-caption bg-accent-secondary/10 text-[10px] text-accent-secondary">
                              En gracia
                            </Badge>
                          )}
                          {tieneMoraAplicada(exp) && (
                            <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">
                              Mora aplicada
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Generada</p>
                          <p className="text-[13px] text-foreground">{formatearFecha(exp.createdAt)}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Vencimiento</p>
                          <p className="text-[13px] text-foreground">{formatearFechaCalendario(exp.fechaVencimiento)}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Tarifa fija</p>
                          <p className="text-[13px] text-foreground">{formatCurrency(Number(exp.montoBase))}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Agua</p>
                          <p className="text-[13px] text-foreground">{formatCurrency(Number(exp.montoAgua))}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Total expensa</p>
                          <p className="text-[13px] text-foreground">{formatCurrency(Number(exp.montoTotal))}</p>
                        </div>
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Mora</p>
                          <p className="text-[13px] text-destructive">
                            {formatCurrency(Number(exp.montoMora || 0))}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <div>
                          <p className={CLASE_LABEL_CAMPO}>Total exigible</p>
                          <p className="text-[15px] font-semibold text-foreground">{formatCurrency(totalExigible)}</p>
                        </div>

                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => onDetalle(exp)}>
                            <Info className="mr-2 h-4 w-4" />
                            Detalle
                          </Button>
                          {bolPuedeGestionar && exp.estado !== "PAGADA" && (
                            <Button variant="outline" size="sm" onClick={() => onPago(exp)}>
                              <Wallet className="mr-2 h-4 w-4" />
                              Registrar pago
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredExpensas.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    {totalCargadas === 0 ? "No hay expensas para los filtros elegidos en el servidor." : "No hay coincidencias con los filtros."}
                  </p>
                )}
              </div>
    </>
  );
}
