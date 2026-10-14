"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { ChevronDown, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listarDocumentos, obtenerDocumento } from "@/lib/documentos";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import { EstadoExpensa, MetodoPago } from "@/types/finance";
import { EstadoCuentaDTO, ExpensaEstadoCuenta, MovimientoSaldoDTO } from "@/types/cuentaInmueble";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";

const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
};

const ETIQUETA_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
};

const CLASE_BADGE_ESTADO: Record<EstadoExpensa, string> = {
  PAGADA: "bg-success-subtle text-success",
  VENCIDA: "bg-danger-subtle text-destructive",
  PENDIENTE: "bg-muted text-muted-foreground",
  PARCIAL: "bg-muted text-muted-foreground",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function bs(valor: string | number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor));
}

/** Fechas sin hora (vencimiento, corte) se guardan a medianoche UTC: se leen en UTC para no correrse un día. */
function fecha(strISO: string, bolSinHora = false) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(bolSinHora ? { timeZone: "UTC" } : {}),
  }).format(new Date(bolSinHora && strISO.length === 10 ? `${strISO}T00:00:00Z` : strISO));
}

/** "2026-09" → "sep 2026" */
function periodo(strPeriodo: string) {
  const [strAnio, strMes] = strPeriodo.split("-");
  const intMes = Number(strMes);
  return intMes >= 1 && intMes <= 12 ? `${MESES[intMes - 1]} ${strAnio}` : strPeriodo;
}

function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

function Linea({
  etiqueta,
  valor,
  detalle,
  bolFuerte = false,
  claseValor = "text-foreground",
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  bolFuerte?: boolean;
  claseValor?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 text-[12px] ${bolFuerte ? "font-medium" : ""}`}>
      <span className={bolFuerte ? "text-foreground" : "text-muted-foreground"}>
        {etiqueta}
        {detalle && <span className="font-caption ml-1 text-[11px] text-muted-foreground">{detalle}</span>}
      </span>
      <span className={`tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

function DetalleCargos({ exp }: { exp: ExpensaEstadoCuenta }) {
  const intTotalCargos = Number(exp.montoTotal) + Number(exp.montoMora);
  const ultimoCambio = exp.cambiosVencimiento.at(-1);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
      <div className="flex flex-col gap-1">
        <p className={CLASE_LABEL}>Cargos del mes</p>
        <Linea etiqueta="Expensa fija" detalle={exp.tipo ? `(Tipo ${exp.tipo})` : undefined} valor={bs(exp.montoBase)} />
        <Linea etiqueta="Agua" valor={bs(exp.montoAgua)} />
        <Linea
          etiqueta="Mora"
          detalle={exp.moras.length > 0 ? `(${exp.moras.length} ${exp.moras.length === 1 ? "mes" : "meses"})` : undefined}
          valor={bs(exp.montoMora)}
          claseValor={Number(exp.montoMora) > 0 ? "text-destructive" : "text-foreground"}
        />
        <div className="border-t border-border pt-1">
          <Linea etiqueta="Total de cargos" valor={bs(intTotalCargos)} bolFuerte />
        </div>
      </div>

      {exp.moras.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={CLASE_LABEL}>Detalle de mora por mes</p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  {["Mes", "Corte", "Cálculo", "Monto", "Pendiente"].map((strTitulo) => (
                    <th key={strTitulo} className={`${CLASE_LABEL} px-2 py-1.5 text-left`}>
                      {strTitulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exp.moras.map((mora) => (
                  <tr key={mora.numero} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-foreground">
                      {mora.numero}° · {periodo(mora.mes)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fecha(mora.fechaCorte, true)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {mora.tipoValor === "PORCENTAJE"
                        ? `${Number(mora.valor)}% de ${bs(mora.base)}`
                        : `Monto fijo ${bs(mora.valor)}`}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-foreground">{bs(mora.monto)}</td>
                    <td
                      className={`px-2 py-1.5 tabular-nums ${
                        Number(mora.pendiente) > 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {Number(mora.pendiente) > 0 ? bs(mora.pendiente) : "Pagada"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className={CLASE_LABEL}>Pagado</p>
          <Linea etiqueta="A la expensa" valor={bs(exp.pagadoExpensa)} />
          <Linea etiqueta="A la mora" valor={bs(exp.pagadoMora)} />
          <Linea etiqueta="Total pagado" valor={bs(exp.pagado)} bolFuerte claseValor="text-success" />
        </div>
        <div className="flex flex-col gap-1">
          <p className={CLASE_LABEL}>Pendiente</p>
          <Linea etiqueta="De la expensa" valor={bs(exp.pendienteExpensa)} />
          <Linea etiqueta="De la mora" valor={bs(exp.pendienteMora)} />
          <Linea
            etiqueta="Total pendiente"
            valor={bs(exp.pendiente)}
            bolFuerte
            claseValor={Number(exp.pendiente) > 0 ? "text-destructive" : "text-success"}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
        <span>
          Vence: <span className="text-foreground">{fecha(exp.fechaVencimiento, true)}</span>
          {ultimoCambio && ` (cambiado desde ${fecha(ultimoCambio.fechaAnterior, true)})`}
        </span>
        <span>Generada: {fecha(exp.fechaGeneracion)}</span>
        {exp.responsable && (
          <span>
            Responsable: <span className="text-foreground">{exp.responsable.nombre}</span>
            {exp.responsable.rol && ` (${exp.responsable.rol === "PROPIETARIO" ? "propietario" : "inquilino"})`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className={CLASE_LABEL}>Pagos registrados</p>
        {exp.pagos.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Sin pagos registrados.</p>
        ) : (
          exp.pagos.map((pago) => (
            <div key={pago.id} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground">
                {fecha(pago.fechaPago)} · {ETIQUETA_METODO_PAGO[pago.metodoPago as MetodoPago] ?? pago.metodoPago}
                {pago.referencia ? ` · ${pago.referencia}` : ""}
              </span>
              <span className="font-medium tabular-nums text-foreground">{bs(pago.monto)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MovimientoSaldoFila({ movimiento }: { movimiento: MovimientoSaldoDTO }) {
  const [strErrorComprobante, setStrErrorComprobante] = useState("");

  async function verComprobante() {
    setStrErrorComprobante("");
    try {
      const documentos = await listarDocumentos({ entidad: "MovimientoSaldo", entidadId: movimiento.id });
      if (documentos[0]) {
        const { url } = await obtenerDocumento(documentos[0].id);
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setStrErrorComprobante("Este movimiento no tiene comprobante adjunto.");
      }
    } catch {
      setStrErrorComprobante("No se pudo consultar el comprobante.");
    }
  }

  const bolAbono = movimiento.tipo !== "APLICACION_EXPENSA";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground">
            {movimiento.tipo === "PAGO_ANTICIPADO" && "Pago anticipado"}
            {movimiento.tipo === "EXCESO_PAGO" && "Exceso de pago"}
            {movimiento.tipo === "APLICACION_EXPENSA" && "Aplicado a una expensa"}
          </p>
          <p className="text-muted-foreground">{fecha(movimiento.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${bolAbono ? "text-success" : "text-muted-foreground"}`}>
            {bolAbono ? "+" : ""}
            {bs(movimiento.monto)}
          </span>
          {bolAbono && (
            <Button variant="ghost" size="icon-sm" title="Ver comprobante" onClick={verComprobante}>
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {strErrorComprobante && <p className="text-[11px] text-muted-foreground">{strErrorComprobante}</p>}
    </div>
  );
}

/** Estado de cuenta de un inmueble con el desglose de cada cargo (expensa fija, agua y mora por mes). */
export function DialogoEstadoCuenta({
  strInmuebleId,
  onCerrar,
}: {
  strInmuebleId: string | null;
  onCerrar: () => void;
}) {
  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuentaDTO | null>(null);
  const [strError, setStrError] = useState("");
  const [strExpandida, setStrExpandida] = useState<string | null>(null);

  useEffect(() => {
    if (!strInmuebleId) return;
    let bolCancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstadoCuenta(null);
    setStrError("");
    cuentaInmuebleService
      .obtenerEstadoCuenta(strInmuebleId)
      .then((resultado) => {
        if (bolCancelado) return;
        setEstadoCuenta(resultado);
        // Se abre de entrada la expensa más reciente con deuda (o la última), que es la que suele interesar.
        const conDeuda = [...resultado.expensas].reverse().find((exp) => Number(exp.pendiente) > 0);
        setStrExpandida((conDeuda ?? resultado.expensas.at(-1))?.id ?? null);
      })
      .catch((error) => !bolCancelado && setStrError(obtenerMensajeError(error, "No se pudo cargar el estado de cuenta.")));
    return () => {
      bolCancelado = true;
    };
  }, [strInmuebleId]);

  const bolCargando = Boolean(strInmuebleId) && !estadoCuenta && !strError;
  const expensasRecientes = estadoCuenta ? [...estadoCuenta.expensas].reverse() : [];

  return (
    <Dialog open={strInmuebleId !== null} onOpenChange={(bolOpen) => !bolOpen && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
            Estado de cuenta {estadoCuenta ? `· ${estadoCuenta.inmueble.codigo}` : ""}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
            Cargos de cada mes (expensa fija, agua y mora), pagos aplicados y lo que queda pendiente. Toca un mes para ver
            su detalle.
          </DialogDescription>
        </DialogHeader>

        {bolCargando && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {strError && (
          <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
            {strError}
          </p>
        )}

        {estadoCuenta && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-3">
              <div>
                <p className={CLASE_LABEL}>Facturado</p>
                <p className="text-[13px] font-medium tabular-nums text-foreground">
                  {bs(estadoCuenta.resumen.totalFacturado)}
                </p>
                <p className="font-caption text-[11px] text-muted-foreground">
                  incl. agua {bs(estadoCuenta.resumen.totalAgua ?? 0)}
                </p>
              </div>
              <div>
                <p className={CLASE_LABEL}>Mora</p>
                <p className="text-[13px] font-medium tabular-nums text-destructive">
                  {bs(estadoCuenta.resumen.totalMora)}
                </p>
              </div>
              <div>
                <p className={CLASE_LABEL}>Pagado</p>
                <p className="text-[13px] font-medium tabular-nums text-success">{bs(estadoCuenta.resumen.totalPagado)}</p>
              </div>
              <div>
                <p className={CLASE_LABEL}>Pendiente</p>
                <p className="text-[13px] font-medium tabular-nums text-destructive">
                  {bs(estadoCuenta.resumen.deudaPendiente)}
                </p>
              </div>
              <div>
                <p className={CLASE_LABEL}>Saldo a favor</p>
                <p className="text-[13px] font-medium tabular-nums text-accent-secondary">
                  {bs(estadoCuenta.resumen.saldoFavor)}
                </p>
              </div>
              <div>
                <p className={CLASE_LABEL}>Saldo neto</p>
                <p
                  className={`text-[13px] font-medium tabular-nums ${
                    Number(estadoCuenta.resumen.saldoNeto) > 0 ? "text-destructive" : "text-success"
                  }`}
                >
                  {Number(estadoCuenta.resumen.saldoNeto) > 0
                    ? `Debe ${bs(estadoCuenta.resumen.saldoNeto)}`
                    : Number(estadoCuenta.resumen.saldoNeto) < 0
                      ? `A favor ${bs(Math.abs(Number(estadoCuenta.resumen.saldoNeto)))}`
                      : "Al día"}
                </p>
              </div>
            </div>

            <div>
              <p className={`${CLASE_LABEL} mb-2`}>Expensas ({estadoCuenta.expensas.length})</p>
              <div className="flex flex-col gap-2">
                {expensasRecientes.map((exp) => {
                  const bolAbierta = strExpandida === exp.id;
                  return (
                    <div key={exp.id} className="rounded-lg border border-border">
                      <button
                        type="button"
                        aria-expanded={bolAbierta}
                        onClick={() => setStrExpandida(bolAbierta ? null : exp.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium capitalize text-foreground">{periodo(exp.periodo)}</span>
                          <Badge className={`font-caption text-[10px] ${CLASE_BADGE_ESTADO[exp.estado]}`}>
                            {ETIQUETA_ESTADO[exp.estado]}
                          </Badge>
                          {exp.atrasada && (
                            <Badge className="font-caption bg-danger-subtle text-[10px] text-destructive">Atrasada</Badge>
                          )}
                        </span>
                        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <span className="tabular-nums">
                            {bs(Number(exp.montoTotal) + Number(exp.montoMora))}
                            {Number(exp.pendiente) > 0 && (
                              <span className="text-destructive"> · debe {bs(exp.pendiente)}</span>
                            )}
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${bolAbierta ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                      {bolAbierta && <DetalleCargos exp={exp} />}
                    </div>
                  );
                })}
                {estadoCuenta.expensas.length === 0 && (
                  <p className="text-[12px] text-muted-foreground">Este inmueble no tiene expensas generadas.</p>
                )}
              </div>
            </div>

            {estadoCuenta.movimientosSaldo.length > 0 && (
              <div>
                <p className={`${CLASE_LABEL} mb-2`}>Movimientos de saldo a favor</p>
                <div className="flex flex-col gap-1.5">
                  {estadoCuenta.movimientosSaldo.map((mov) => (
                    <MovimientoSaldoFila key={mov.id} movimiento={mov} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
