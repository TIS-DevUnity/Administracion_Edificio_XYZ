"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, RefreshCw, XCircle } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEjecutar, validarAccion, type RolNombre } from "@/lib/permissions";
import {
  ETIQUETA_METODO,
  MAX_MOTIVO_RECHAZO,
  mensajeErrorPago,
  misPagosService,
  pagosInformadosAdminService,
  type EstadoPagoInformado,
  type PagoInformado,
} from "@/services/misPagos.service";
import { formatCurrency, formatearFecha, formatearFechaCalendario } from "@/app/admin/morosidad/utils/morosidad";

const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_HEADER = "font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

const ESTADO: Record<EstadoPagoInformado, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: "Pendiente", clase: "bg-accent-secondary/15 text-accent-secondary" },
  CONFIRMADO: { etiqueta: "Confirmado", clase: "bg-success-subtle text-success" },
  RECHAZADO: { etiqueta: "Rechazado", clase: "bg-danger-subtle text-destructive" },
};
type Filtro = EstadoPagoInformado | "TODOS";

const nombreCopropietario = (p: PagoInformado) =>
  p.copropietario?.nombre ? `${p.copropietario.nombre} ${p.copropietario.apellido ?? ""}`.trim() : "—";

/**
 * Pagos que los copropietarios informaron desde su portal (HU14). El ADMINISTRADOR los confirma (se registra
 * el pago normal con su recibo) o los rechaza con un motivo; el DIRECTORIO solo los consulta.
 */
export function PagosInformados({ rol, onConfirmado }: { rol: RolNombre; onConfirmado: () => void }) {
  const bolPuedeRevisar = puedeEjecutar(rol, "pagos", "crear");

  const [filtro, setFiltro] = useState<Filtro>("PENDIENTE");
  const [pagos, setPagos] = useState<PagoInformado[]>([]);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [strError, setStrError] = useState("");
  const [intRecarga, setIntRecarga] = useState(0);

  const [aConfirmar, setAConfirmar] = useState<PagoInformado | null>(null);
  const [aRechazar, setARechazar] = useState<PagoInformado | null>(null);
  const [strMotivo, setStrMotivo] = useState("");
  const [bolProcesando, setBolProcesando] = useState(false);
  const [strErrorAccion, setStrErrorAccion] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strPermiso, setStrPermiso] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setStrError("");
    Promise.all([
      pagosInformadosAdminService.listar(filtro === "TODOS" ? undefined : filtro, ctrl.signal),
      filtro === "PENDIENTE" ? null : pagosInformadosAdminService.listar("PENDIENTE", ctrl.signal),
    ])
      .then(([lista, soloPendientes]) => {
        // Pendientes: los más antiguos primero (se atienden en orden); el resto, lo más reciente primero.
        const orden = filtro === "PENDIENTE" ? 1 : -1;
        setPagos([...lista].sort((a, b) => orden * a.createdAt.localeCompare(b.createdAt)));
        setPendientes((soloPendientes ?? lista).length);
      })
      .catch(async (error) => !ctrl.signal.aborted && setStrError(await mensajeErrorPago(error, "No se pudieron cargar los pagos informados.")))
      .finally(() => !ctrl.signal.aborted && setCargando(false));
    return () => ctrl.abort();
  }, [filtro, intRecarga]);

  function abrir(accion: "confirmar" | "rechazar", pago: PagoInformado) {
    const validacion = validarAccion(rol, "pagos", "crear");
    if (!validacion.permitido) {
      setStrPermiso(validacion.mensaje);
      return;
    }
    setStrErrorAccion("");
    setStrExito("");
    if (accion === "confirmar") setAConfirmar(pago);
    else {
      setStrMotivo("");
      setARechazar(pago);
    }
  }

  async function confirmar() {
    if (!aConfirmar || bolProcesando) return;
    setBolProcesando(true);
    setStrErrorAccion("");
    try {
      const r = await pagosInformadosAdminService.confirmar(aConfirmar.id);
      setStrExito(
        `Pago de ${formatCurrency(Number(aConfirmar.monto))} de ${aConfirmar.inmueble.codigo ?? ""} confirmado y registrado` +
          (r.recibo?.folio ? `. Recibo ${r.recibo.folio}.` : ".")
      );
      setAConfirmar(null);
      setIntRecarga((n) => n + 1);
      onConfirmado(); // la deuda de la tabla de departamentos cambió
    } catch (error) {
      // Si el pago no cumple las reglas (p. ej. un mes atrasado que se paga completo), el aviso sigue pendiente.
      setStrErrorAccion(await mensajeErrorPago(error, "No se pudo confirmar el pago. Sigue pendiente."));
      setIntRecarga((n) => n + 1);
    } finally {
      setBolProcesando(false);
    }
  }

  async function rechazar() {
    if (!aRechazar || bolProcesando) return;
    const motivo = strMotivo.trim();
    if (!motivo) {
      setStrErrorAccion("Escribe el motivo del rechazo: el copropietario lo verá en su portal.");
      return;
    }
    setBolProcesando(true);
    setStrErrorAccion("");
    try {
      await pagosInformadosAdminService.rechazar(aRechazar.id, motivo);
      setStrExito(`Se rechazó el pago de ${formatCurrency(Number(aRechazar.monto))} de ${aRechazar.inmueble.codigo ?? ""}.`);
      setARechazar(null);
      setIntRecarga((n) => n + 1);
    } catch (error) {
      setStrErrorAccion(await mensajeErrorPago(error, "No se pudo rechazar el pago."));
      setIntRecarga((n) => n + 1);
    } finally {
      setBolProcesando(false);
    }
  }

  async function verComprobante(id: string) {
    setStrError("");
    const ventana = window.open("", "_blank"); // antes del await, para que no la bloqueen como ventana emergente
    try {
      const url = await misPagosService.urlComprobante(id);
      if (ventana) ventana.location.assign(url);
      else window.location.assign(url);
    } catch (error) {
      ventana?.close();
      setStrError(await mensajeErrorPago(error, "No se pudo abrir el comprobante."));
    }
  }

  const pagoDialogo = aConfirmar ?? aRechazar;

  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="font-subtitle flex items-center gap-2 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Pagos informados por copropietarios
            {pendientes !== null && pendientes > 0 && (
              <Badge className="font-caption bg-accent-secondary text-[11px] text-white">{pendientes} pendiente{pendientes === 1 ? "" : "s"}</Badge>
            )}
          </CardTitle>
          <p className={`${CLASE_AYUDA} mt-1`}>
            Transferencias o depósitos que los copropietarios avisaron desde su portal.{" "}
            {bolPuedeRevisar ? "Al confirmarlos se registra el pago y se genera el recibo." : "Solo el Administrador puede confirmarlos o rechazarlos."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex w-40 flex-col gap-1">
            <span className={CLASE_LABEL}>Estado</span>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger aria-label="Filtrar pagos informados por estado" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDIENTE">Pendientes</SelectItem>
                <SelectItem value="CONFIRMADO">Confirmados</SelectItem>
                <SelectItem value="RECHAZADO">Rechazados</SelectItem>
                <SelectItem value="TODOS">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-9" cargando={cargando} aria-label="Actualizar pagos informados" onClick={() => setIntRecarga((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {(strPermiso || strExito) && (
          <div className="space-y-2 px-5 pt-4">
            {strPermiso && <AlertaPermiso mensaje={strPermiso} />}
            {strExito && <p role="status" className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strExito}</p>}
          </div>
        )}
        {strError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-destructive">
            <span>{strError}</span>
            <Button size="sm" variant="outline" onClick={() => setIntRecarga((n) => n + 1)}>Reintentar</Button>
          </div>
        ) : cargando && pagos.length === 0 ? (
          <div className="p-5"><Skeleton className="h-12 w-full" /></div>
        ) : pagos.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
            {filtro === "PENDIENTE" ? "No hay pagos informados pendientes de revisión." : "No hay pagos informados con este estado."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[940px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={CLASE_HEADER}>Fecha del pago</TableHead>
                  <TableHead className={CLASE_HEADER}>Departamento</TableHead>
                  <TableHead className={CLASE_HEADER}>Copropietario</TableHead>
                  <TableHead className={`${CLASE_HEADER} text-right`}>Monto</TableHead>
                  <TableHead className={CLASE_HEADER}>Método</TableHead>
                  <TableHead className={CLASE_HEADER}>Estado</TableHead>
                  <TableHead className="w-64" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[13px] tabular-nums">
                      {formatearFechaCalendario(p.fechaPago)}
                      <span className="font-caption block text-[11px] text-muted-foreground">Informado el {formatearFecha(p.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-[13px] font-medium">{p.inmueble.codigo ?? "—"}</TableCell>
                    <TableCell className="text-[13px]">{nombreCopropietario(p)}</TableCell>
                    <TableCell className="text-right text-[13px] font-medium tabular-nums">{formatCurrency(Number(p.monto))}</TableCell>
                    <TableCell className="text-[13px]">
                      {ETIQUETA_METODO[p.metodoPago]}
                      {p.referencia && <span className="font-caption block text-[11px] text-muted-foreground">Ref. {p.referencia}</span>}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge className={`font-caption text-[11px] ${ESTADO[p.estado].clase}`}>{ESTADO[p.estado].etiqueta}</Badge>
                      {p.estado === "RECHAZADO" && p.motivoRechazo && <span className="font-caption mt-1 block text-[11px] text-destructive">{p.motivoRechazo}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.tieneComprobante ? (
                          <Button variant="ghost" size="xs" onClick={() => void verComprobante(p.id)}><Eye className="h-3 w-3" /> Comprobante</Button>
                        ) : (
                          <span className="font-caption self-center px-2 text-[11px] text-muted-foreground">Sin comprobante</span>
                        )}
                        {bolPuedeRevisar && p.estado === "PENDIENTE" && (
                          <>
                            <Button size="xs" onClick={() => abrir("confirmar", p)}><CheckCircle2 className="h-3 w-3" /> Confirmar</Button>
                            <Button variant="outline" size="xs" className="text-destructive" onClick={() => abrir("rechazar", p)}><XCircle className="h-3 w-3" /> Rechazar</Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={pagoDialogo !== null} onOpenChange={(abierto) => { if (!abierto && !bolProcesando) { setAConfirmar(null); setARechazar(null); } }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>{aConfirmar ? "Confirmar pago informado" : "Rechazar pago informado"}</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {aConfirmar
                ? "Revisa que el dinero haya llegado. Se registrará el pago en el departamento (primero la deuda más antigua y su mora) y se generará el recibo."
                : "El pago no se registrará y la deuda no cambia. El copropietario verá el motivo en su portal."}
            </DialogDescription>
          </DialogHeader>
          {pagoDialogo && (
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-muted/30 p-4 text-[13px]">
              <dt className="text-muted-foreground">Departamento</dt><dd className="font-medium text-foreground">{pagoDialogo.inmueble.codigo ?? "—"}</dd>
              <dt className="text-muted-foreground">Copropietario</dt><dd className="text-foreground">{nombreCopropietario(pagoDialogo)}</dd>
              <dt className="text-muted-foreground">Monto</dt><dd className="font-medium tabular-nums text-foreground">{formatCurrency(Number(pagoDialogo.monto))}</dd>
              <dt className="text-muted-foreground">Método</dt><dd className="text-foreground">{ETIQUETA_METODO[pagoDialogo.metodoPago]}{pagoDialogo.referencia ? ` · Ref. ${pagoDialogo.referencia}` : ""}</dd>
              <dt className="text-muted-foreground">Fecha del pago</dt><dd className="tabular-nums text-foreground">{formatearFechaCalendario(pagoDialogo.fechaPago)}</dd>
            </dl>
          )}
          {aRechazar && (
            <div className="flex flex-col gap-1">
              <label htmlFor="motivo-rechazo" className={CLASE_LABEL}>Motivo del rechazo *</label>
              <textarea
                id="motivo-rechazo"
                rows={3}
                maxLength={MAX_MOTIVO_RECHAZO}
                value={strMotivo}
                onChange={(e) => { setStrMotivo(e.target.value); setStrErrorAccion(""); }}
                placeholder="Ej. La transferencia no figura en la cuenta del edificio."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <p className={CLASE_AYUDA}>{strMotivo.length}/{MAX_MOTIVO_RECHAZO}</p>
            </div>
          )}
          {strErrorAccion && <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">{strErrorAccion}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={bolProcesando} onClick={() => { setAConfirmar(null); setARechazar(null); }}>Volver</Button>
            {aConfirmar ? (
              <Button cargando={bolProcesando} onClick={() => void confirmar()}><CheckCircle2 className="h-4 w-4" /> Confirmar y registrar</Button>
            ) : (
              <Button variant="destructive" cargando={bolProcesando} onClick={() => void rechazar()}><XCircle className="h-4 w-4" /> Rechazar pago</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
