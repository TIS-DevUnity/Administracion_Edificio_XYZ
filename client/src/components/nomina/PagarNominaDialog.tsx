"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import { cajaBancosService } from "@/services/caja-bancos.service";
import { nominaService, mensajeErrorNomina } from "@/services/nomina.service";
import { empleadosService } from "@/services/personal.service";
import type { Nomina, MetodoPagoNomina } from "@/types/nomina";
import { dinero, fechaActualBolivia, nombreEmpleado } from "./nomina-utils";
import { abrirCalendario } from "@/components/personal/PersonalUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorNomina, CLASE_LABEL, CLASE_TITULO_DIALOGO } from "./NominaUI";

/** Pago definitivo; el sueldo neto siempre viene de backend. */
export function PagarNominaDialog({ nomina, abierto, onCerrar, onPagada }: {
  nomina: Nomina | null;
  abierto: boolean;
  onCerrar: () => void;
  onPagada: (mensaje: string) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPagoNomina>("TRANSFERENCIA");
  const [fecha, setFecha] = useState(fechaActualBolivia);
  const [cuentaId, setCuentaId] = useState("predeterminada");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const { usuario } = useSesionActual();
  const administrador = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const cuentas = useQuery({ queryKey: ["hu8", "cuentas-pago"], queryFn: cajaBancosService.cuentas, enabled: abierto });
  const tipo = metodo === "EFECTIVO" ? "CAJA" : "BANCO";
  const compatibles = (cuentas.data ?? []).filter((cuenta) => cuenta.tipo === tipo && cuenta.activa !== false);
  const neto = Number(nomina?.sueldoNeto ?? 0);
  const detalleEmpleado = useQuery({
    queryKey: ["hu8", "empleado", nomina?.empleado.id],
    queryFn: () => empleadosService.detalle(nomina!.empleado.id),
    enabled: abierto && Boolean(nomina?.empleado.id),
  });
  // La fecha no puede anteceder ni al mes de la nómina ni al ingreso del empleado.
  const primerDiaPeriodo = nomina ? `${nomina.periodo}-01` : "";
  const ingreso = detalleEmpleado.data?.empleado.fechaIngreso.slice(0, 10) ?? "";
  const fechaMinima = ingreso > primerDiaPeriodo ? ingreso : primerDiaPeriodo;
  const fechaVerificada = detalleEmpleado.isSuccess && !detalleEmpleado.isFetching;

  async function confirmar() {
    if (!nomina || enviando || !administrador || nomina.estado !== "PENDIENTE") return;
    if (!fechaVerificada) {
      setError("No se pudo verificar la fecha de ingreso del empleado. Reintenta la consulta antes de pagar.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaActualBolivia() || fecha < fechaMinima) {
      setError(`Selecciona una fecha entre ${fechaMinima} y ${fechaActualBolivia()} (no anterior al periodo ni al ingreso).`);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      // Evita usar un sueldo neto obsoleto si otra operación modificó la nómina.
      const nominaActual = await nominaService.detalle(nomina.id);
      if (nominaActual.estado !== "PENDIENTE" || nominaActual.sueldoNeto !== nomina.sueldoNeto) {
        await queryClient.invalidateQueries({ queryKey: ["hu8"] });
        setError("La nómina cambió desde que abriste el formulario. Cierra y vuelve a abrir el detalle para revisar el monto actualizado.");
        return;
      }
      const resultado = await nominaService.pagar(nomina.id, {
        fechaPago: fecha,
        monto: neto,
        metodoPago: metodo,
        ...(cuentaId !== "predeterminada" ? { cuentaId } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["hu8"] });
      // Los asientos HU7 son generados por el backend únicamente cuando la variable está activa.
      await queryClient.invalidateQueries({ queryKey: ["hu7"] });
      onPagada(resultado.asiento
        ? `Pago confirmado. Egreso registrado en ${resultado.asiento.cuenta}.`
        : "Pago confirmado. No se devolvió un asiento de Caja y Bancos; revisa su configuración si esperabas uno.");
    } catch (err) {
      setError(mensajeErrorNomina(err));
    } finally {
      setEnviando(false);
    }
  }

  return <Dialog open={abierto} onOpenChange={(v) => { if (!v && !enviando) { setError(""); onCerrar(); } }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className={CLASE_TITULO_DIALOGO}>Confirmar pago de nómina</DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">Esta operación es definitiva. Una nómina pagada no podrá modificarse ni pagarse nuevamente.</DialogDescription>
      </DialogHeader>
      {nomina && <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[14px] font-medium text-foreground">{nombreEmpleado(nomina.empleado)}</p>
          <p className="font-caption text-[11px] text-muted-foreground">{nomina.empleado.cargo} · {nomina.periodo}</p>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className={CLASE_LABEL}>Sueldo neto a pagar</span>
            <span className="font-title text-[23px] text-foreground">{dinero(nomina.sueldoNeto)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className={CLASE_LABEL}>Fecha de pago</span>
            <Input type="date" className="cursor-pointer" onClick={abrirCalendario} value={fecha} min={detalleEmpleado.isSuccess ? fechaMinima : primerDiaPeriodo} max={fechaActualBolivia()} onChange={(e) => { setFecha(e.target.value); setError(""); }} disabled={enviando || !fechaVerificada} />
          </label>
          <div className="space-y-1"><span className={CLASE_LABEL}>Método de pago</span>
            <Select value={metodo} onValueChange={(v) => { setMetodo(v as MetodoPagoNomina); setCuentaId("predeterminada"); }} disabled={enviando}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferencia bancaria</SelectItem>
                <SelectItem value="TARJETA">Tarjeta</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1"><span className={CLASE_LABEL}>Cuenta de origen (opcional)</span>
          <Select value={cuentaId} onValueChange={setCuentaId} disabled={enviando}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Cuenta predeterminada" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="predeterminada">Usar cuenta predeterminada ({tipo === "CAJA" ? "caja" : "banco"})</SelectItem>
              {compatibles.map((cuenta) => <SelectItem key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="font-caption text-[11px] text-muted-foreground">La contabilización en Caja y Bancos depende de la configuración del servidor. Seleccionar cuenta no activa los asientos.</p>
        </div>
        {detalleEmpleado.isPending && <p className="text-[12px] text-muted-foreground">Verificando fecha de ingreso del empleado...</p>}
        {detalleEmpleado.isError && <ErrorNomina mensaje="No se pudo consultar la fecha de ingreso. No se confirmará el pago sin validarla." reintentar={() => void detalleEmpleado.refetch()} />}
        {detalleEmpleado.isSuccess && <p className="text-[12px] text-muted-foreground">Fecha mínima de pago: {fechaMinima}. Debe corresponder al periodo o ser posterior.</p>}
        {cuentas.isError && <p className="font-caption text-[11px] text-muted-foreground">No se pudieron consultar las cuentas. Puedes usar la predeterminada si existe en el backend.</p>}
        {neto === 0 && <p className="rounded-lg bg-muted p-3 text-[12px] text-muted-foreground">El sueldo neto es cero. El backend permite confirmar el pago sin crear egreso de Caja y Bancos.</p>}
        {error && <ErrorNomina mensaje={error} />}
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        <Button onClick={confirmar} cargando={enviando} disabled={!nomina || !administrador || nomina.estado !== "PENDIENTE" || !fechaVerificada || fecha < fechaMinima || fecha > fechaActualBolivia()}>Confirmar pago definitivo</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
