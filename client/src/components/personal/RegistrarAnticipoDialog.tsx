"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Printer, Save } from "lucide-react";
import { cajaBancosService } from "@/services/caja-bancos.service";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { anticiposService, empleadosService } from "@/services/personal.service";
import type { MetodoPagoNomina } from "@/types/nomina";
import type { Anticipo } from "@/types/personal";
import { descargarBlob, dinero, fechaActualBolivia, fechaCorta, imprimirBlob, nombreEmpleado } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, ErrorNomina } from "@/components/nomina/NominaUI";
import { abrirCalendario, ETIQUETA_METODO } from "./PersonalUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const IMPORTE = /^\d+(\.\d{1,2})?$/;
const MAX_DESCRIPCION = 200;
type Campo = "empleadoId" | "monto" | "fecha" | "descripcion";

/**
 * Registro de un anticipo salarial (HU8 4.1). Solo para empleados activos. El backend lo registra como
 * egreso de la caja o cuenta elegida y lo descuenta en la próxima nómina. Al terminar ofrece el
 * comprobante en PDF (6.2).
 */
export function RegistrarAnticipoDialog({ abierto, empleadoIdInicial, onCerrar, onRegistrado }: {
  abierto: boolean;
  empleadoIdInicial?: string;
  onCerrar: () => void;
  onRegistrado: () => void;
}) {
  const queryClient = useQueryClient();
  const [empleadoId, setEmpleadoId] = useState(empleadoIdInicial ?? "");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(fechaActualBolivia);
  const [metodo, setMetodo] = useState<MetodoPagoNomina>("EFECTIVO");
  const [cuentaId, setCuentaId] = useState("predeterminada");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [registrado, setRegistrado] = useState<Anticipo | null>(null);
  const [enPdf, setEnPdf] = useState(false);

  const empleados = useQuery({
    queryKey: ["hu8", "empleados-activos"],
    queryFn: () => empleadosService.listar({ estado: "ACTIVO", porPagina: 200 }),
    enabled: abierto,
  });
  const cuentas = useQuery({ queryKey: ["hu8", "cuentas-pago"], queryFn: cajaBancosService.cuentas, enabled: abierto });
  const tipoCuenta = metodo === "EFECTIVO" ? "CAJA" : "BANCO";
  const compatibles = (cuentas.data ?? []).filter((c) => c.tipo === tipoCuenta && c.activa !== false);
  const activos = empleados.data?.empleados ?? [];

  function validar() {
    const e: Partial<Record<Campo, string>> = {};
    if (!empleadoId) e.empleadoId = "Selecciona un empleado activo.";
    if (!IMPORTE.test(monto.trim()) || Number(monto) <= 0) e.monto = "El monto debe ser mayor que cero, con máximo 2 decimales.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) e.fecha = "Fecha inválida.";
    else if (fecha > fechaActualBolivia()) e.fecha = "La fecha no puede ser futura.";
    if (!descripcion.trim()) e.descripcion = "Indica el concepto del anticipo.";
    else if (descripcion.trim().length > MAX_DESCRIPCION) e.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres.`;
    return e;
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nuevos = validar();
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setGuardando(true);
    setError("");
    try {
      const { anticipo } = await anticiposService.crear({
        empleadoId,
        monto: Number(monto),
        fecha,
        metodoPago: metodo,
        descripcion: descripcion.trim().replace(/\s+/g, " "),
        ...(cuentaId !== "predeterminada" ? { cuentaId } : {}),
      });
      setRegistrado(anticipo);
      await queryClient.invalidateQueries({ queryKey: ["hu8"] });
      await queryClient.invalidateQueries({ queryKey: ["hu7"] });
      onRegistrado();
    } catch (err) {
      setError(mensajeErrorNomina(err));
    } finally {
      setGuardando(false);
    }
  }

  async function comprobante(imprimir: boolean) {
    if (!registrado || enPdf) return;
    setEnPdf(true);
    setError("");
    try {
      if (imprimir) await imprimirBlob(anticiposService.comprobantePdf(registrado.id, true));
      else descargarBlob(await anticiposService.comprobantePdf(registrado.id), `comprobante-anticipo-${registrado.fecha}-${registrado.empleado?.documento ?? registrado.id}.pdf`);
    } catch (err) {
      setError(mensajeErrorNomina(err));
    } finally {
      setEnPdf(false);
    }
  }

  const errorCampo = (c: Campo) => errores[c] && <span role="alert" className="font-caption block text-[12px] text-destructive">{errores[c]}</span>;

  return <Dialog open={abierto} onOpenChange={(v) => { if (!v && !guardando) onCerrar(); }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">{registrado ? "Anticipo registrado" : "Registrar anticipo salarial"}</DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
          {registrado ? "Ya se puede entregar el comprobante al empleado para su firma." : "Se registra como egreso del edificio y se descuenta automáticamente en la próxima nómina del empleado."}
        </DialogDescription>
      </DialogHeader>

      {registrado ? <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-success/30 bg-success-subtle p-3 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Anticipo de {dinero(registrado.monto)} registrado</p>
          <p className="text-foreground">{registrado.empleado ? nombreEmpleado(registrado.empleado) : ""} · {fechaCorta(registrado.fecha)} · {ETIQUETA_METODO[registrado.metodoPago]}</p>
          <p className="text-muted-foreground">{registrado.descripcion}</p>
          <p className="font-caption text-[11px] text-muted-foreground">
            {registrado.asiento ? `Egreso registrado en ${registrado.asiento.cuenta ?? "la cuenta indicada"}.` : "El servidor no registró un movimiento de caja (los asientos de Caja y Bancos están desactivados)."}
          </p>
        </div>
        {error && <ErrorNomina mensaje={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => void comprobante(true)} disabled={enPdf}><Printer className="h-4 w-4" /> Imprimir comprobante</Button>
          <Button variant="outline" onClick={() => void comprobante(false)} cargando={enPdf}><Download className="h-4 w-4" /> Descargar PDF</Button>
          <Button onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </div> : <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="space-y-1">
          <span className={CLASE_LABEL}>Empleado activo *</span>
          <Select value={empleadoId} onValueChange={(v) => { setEmpleadoId(v); setErrores((p) => ({ ...p, empleadoId: undefined })); }} disabled={guardando || empleados.isPending}>
            <SelectTrigger className="w-full" aria-label="Empleado" aria-invalid={Boolean(errores.empleadoId)}>
              <SelectValue placeholder={empleados.isPending ? "Cargando empleados..." : "Selecciona un empleado"} />
            </SelectTrigger>
            <SelectContent>
              {activos.map((e) => <SelectItem key={e.id} value={e.id}>{nombreEmpleado(e)} · {e.cargo}</SelectItem>)}
            </SelectContent>
          </Select>
          {!empleados.isPending && activos.length === 0 && <span className="font-caption block text-[12px] text-muted-foreground">No hay empleados activos.</span>}
          {empleadoIdInicial && !empleados.isPending && !activos.some((e) => e.id === empleadoIdInicial) &&
            <span className="font-caption block text-[12px] text-destructive">El empleado elegido no está activo: no puede recibir anticipos.</span>}
          {errorCampo("empleadoId")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={CLASE_LABEL}>Monto (Bs) *</span>
            <Input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={monto} disabled={guardando} aria-invalid={Boolean(errores.monto)}
              onChange={(e) => { setMonto(e.target.value); setErrores((p) => ({ ...p, monto: undefined })); }} />
            {errorCampo("monto")}
          </label>
          <label className="space-y-1">
            <span className={CLASE_LABEL}>Fecha *</span>
            <Input type="date" max={fechaActualBolivia()} className="cursor-pointer" value={fecha} disabled={guardando} onClick={abrirCalendario} aria-invalid={Boolean(errores.fecha)}
              onChange={(e) => { setFecha(e.target.value); setErrores((p) => ({ ...p, fecha: undefined })); }} />
            {errorCampo("fecha")}
          </label>
          <div className="space-y-1">
            <span className={CLASE_LABEL}>Método de pago *</span>
            <Select value={metodo} onValueChange={(v) => { setMetodo(v as MetodoPagoNomina); setCuentaId("predeterminada"); }} disabled={guardando}>
              <SelectTrigger className="w-full" aria-label="Método de pago"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ETIQUETA_METODO) as MetodoPagoNomina[]).map((m) => <SelectItem key={m} value={m}>{ETIQUETA_METODO[m]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className={CLASE_LABEL}>Sale de ({tipoCuenta === "CAJA" ? "caja" : "banco"})</span>
            <Select value={cuentaId} onValueChange={setCuentaId} disabled={guardando}>
              <SelectTrigger className="w-full" aria-label="Cuenta de origen"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="predeterminada">Cuenta predeterminada</SelectItem>
                {compatibles.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="block space-y-1">
          <span className={CLASE_LABEL}>Descripción *</span>
          <Input maxLength={MAX_DESCRIPCION} placeholder="Ej. Anticipo por gastos médicos" value={descripcion} disabled={guardando} aria-invalid={Boolean(errores.descripcion)}
            onChange={(e) => { setDescripcion(e.target.value); setErrores((p) => ({ ...p, descripcion: undefined })); }} />
          {errorCampo("descripcion")}
        </label>
        <p className="font-caption text-[11px] text-muted-foreground">
          Si el anticipo supera lo que se puede descontar en una nómina, el saldo queda pendiente para los meses siguientes.
        </p>
        {error && <ErrorNomina mensaje={error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="submit" cargando={guardando}><Save className="h-4 w-4" /> Registrar anticipo</Button>
        </DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
