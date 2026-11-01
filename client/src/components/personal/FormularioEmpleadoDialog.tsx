"use client";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { empleadosService } from "@/services/personal.service";
import type { DatosEmpleado, Empleado } from "@/types/personal";
import { fechaActualBolivia } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, ErrorNomina } from "@/components/nomina/NominaUI";
import { abrirCalendario } from "./PersonalUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import axios from "axios";

type Campo = keyof DatosEmpleado;
type Formulario = Record<Campo, string>;
type Errores = Partial<Record<Campo, string>>;

const VACIO: Formulario = { nombres: "", apellidos: "", documento: "", cargo: "", fechaIngreso: "", telefono: "", sueldoBase: "" };
const ETIQUETAS: Record<Campo, string> = {
  nombres: "Nombres", apellidos: "Apellidos", documento: "N.º de documento", cargo: "Cargo",
  fechaIngreso: "Fecha de ingreso", telefono: "Teléfono", sueldoBase: "Sueldo base (Bs)",
};
const FORMATO_DOCUMENTO = /^[A-Z0-9.-]+(?: [A-Z0-9.-]+)*$/;
const FORMATO_TELEFONO = /^[0-9+()\- ]+$/;
const IMPORTE = /^\d+(\.\d{1,2})?$/;

function desdeEmpleado(e: Empleado): Formulario {
  return {
    nombres: e.nombres, apellidos: e.apellidos, documento: e.documento, cargo: e.cargo,
    fechaIngreso: e.fechaIngreso, telefono: e.telefono, sueldoBase: Number(e.sueldoBase).toFixed(2),
  };
}

const normalizar = (texto: string) => texto.trim().replace(/\s+/g, " ");

/** Mismas reglas que empleados.util.js para avisar campo por campo antes de enviar. */
function validar(f: Formulario): Errores {
  const e: Errores = {};
  (Object.keys(VACIO) as Campo[]).forEach((campo) => { if (!f[campo].trim()) e[campo] = "Campo obligatorio."; });
  if (!e.nombres && normalizar(f.nombres).length > 80) e.nombres = "Máximo 80 caracteres.";
  if (!e.apellidos && normalizar(f.apellidos).length > 80) e.apellidos = "Máximo 80 caracteres.";
  if (!e.cargo && normalizar(f.cargo).length > 60) e.cargo = "Máximo 60 caracteres.";
  const documento = normalizar(f.documento).toUpperCase();
  if (!e.documento && (documento.length < 3 || documento.length > 20)) e.documento = "Entre 3 y 20 caracteres.";
  else if (!e.documento && !FORMATO_DOCUMENTO.test(documento)) e.documento = "Solo letras, números, guiones y puntos.";
  const telefono = normalizar(f.telefono);
  if (!e.telefono && (!FORMATO_TELEFONO.test(telefono) || telefono.replace(/\D/g, "").length < 7 || telefono.length > 20)) {
    e.telefono = "Solo números, +, guiones y paréntesis; mínimo 7 dígitos.";
  }
  if (!e.fechaIngreso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaIngreso)) e.fechaIngreso = "Fecha inválida.";
    else if (f.fechaIngreso > fechaActualBolivia()) e.fechaIngreso = "No puede ser una fecha futura.";
    else if (f.fechaIngreso < "1900-01-01") e.fechaIngreso = "Fecha inválida.";
  }
  if (!e.sueldoBase && (!IMPORTE.test(f.sueldoBase.trim()) || Number(f.sueldoBase) <= 0)) {
    e.sueldoBase = "Debe ser mayor que cero, con máximo 2 decimales.";
  }
  return e;
}

function aDatos(f: Formulario): DatosEmpleado {
  return {
    nombres: normalizar(f.nombres), apellidos: normalizar(f.apellidos), documento: normalizar(f.documento).toUpperCase(),
    cargo: normalizar(f.cargo), fechaIngreso: f.fechaIngreso, telefono: normalizar(f.telefono), sueldoBase: Number(f.sueldoBase),
  };
}

/** Alta y edición de empleados (HU8 1.1 y 1.3). En edición solo se envían los campos modificados. */
export function FormularioEmpleadoDialog({ abierto, empleado, onCerrar, onGuardado }: {
  abierto: boolean;
  empleado: Empleado | null; // null = alta
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Formulario>(() => (empleado ? desdeEmpleado(empleado) : VACIO));
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const original = empleado ? aDatos(desdeEmpleado(empleado)) : null;
  const cambiaSueldo = Boolean(empleado) && IMPORTE.test(form.sueldoBase.trim()) && Number(form.sueldoBase) !== Number(empleado?.sueldoBase);

  function cambiar(campo: Campo, valor: string) {
    setForm((p) => ({ ...p, [campo]: valor }));
    setErrores((p) => ({ ...p, [campo]: undefined }));
    setError("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nuevos = validar(form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    const datos = aDatos(form);
    let cambios: Partial<DatosEmpleado> = datos;
    if (original) {
      cambios = Object.fromEntries((Object.keys(datos) as Campo[]).filter((c) => datos[c] !== original[c]).map((c) => [c, datos[c]]));
      if (Object.keys(cambios).length === 0) {
        setError("No hay cambios para guardar.");
        return;
      }
    }
    setGuardando(true);
    setError("");
    try {
      const respuesta = empleado ? await empleadosService.actualizar(empleado.id, cambios) : await empleadosService.crear(datos);
      await queryClient.invalidateQueries({ queryKey: ["hu8"] });
      onGuardado(
        empleado && "sueldoBase" in cambios
          ? `${respuesta.mensaje}. El nuevo sueldo base se aplicará a las próximas nóminas; las ya generadas no cambian.`
          : respuesta.mensaje
      );
    } catch (err) {
      // El documento duplicado se marca en su campo (DOCUMENTO_DUPLICADO).
      if (axios.isAxiosError(err) && (err.response?.data as { codigo?: string } | undefined)?.codigo === "DOCUMENTO_DUPLICADO") {
        setErrores((p) => ({ ...p, documento: "Ya existe un empleado registrado con este documento." }));
      } else {
        setError(mensajeErrorNomina(err));
      }
    } finally {
      setGuardando(false);
    }
  }

  const campo = (c: Campo, extra: React.ComponentProps<typeof Input> = {}) => <label className="space-y-1">
    <span className={CLASE_LABEL}>{ETIQUETAS[c]} *</span>
    <Input value={form[c]} onChange={(e) => cambiar(c, e.target.value)} aria-invalid={Boolean(errores[c])} disabled={guardando} {...extra} />
    {errores[c] && <span role="alert" className="font-caption block text-[12px] text-destructive">{errores[c]}</span>}
  </label>;

  return <Dialog open={abierto} onOpenChange={(v) => { if (!v && !guardando) onCerrar(); }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">{empleado ? "Editar empleado" : "Registrar empleado"}</DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
          {empleado ? "Modifica los datos personales, el cargo o el sueldo base." : "Todos los campos son obligatorios. El empleado se registra como Activo."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("nombres", { maxLength: 80, placeholder: "Juan Carlos" })}
          {campo("apellidos", { maxLength: 80, placeholder: "Mamani Quispe" })}
          {campo("documento", { maxLength: 20, placeholder: "1234567 LP" })}
          {campo("cargo", { maxLength: 60, placeholder: "Conserje" })}
          {campo("fechaIngreso", { type: "date", max: fechaActualBolivia(), className: "cursor-pointer", onClick: abrirCalendario })}
          {campo("telefono", { maxLength: 20, inputMode: "tel", placeholder: "71234567" })}
          {campo("sueldoBase", { type: "number", min: "0.01", step: "0.01", inputMode: "decimal", placeholder: "2500.00" })}
        </div>
        {cambiaSueldo && <p className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 px-3 py-2 text-[12px] text-foreground">
          El nuevo sueldo base se aplicará a las nóminas que se generen desde ahora. Las nóminas y pagos anteriores conservan su monto.
        </p>}
        {error && <ErrorNomina mensaje={error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="submit" cargando={guardando}><Save className="h-4 w-4" /> {empleado ? "Guardar cambios" : "Registrar empleado"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
