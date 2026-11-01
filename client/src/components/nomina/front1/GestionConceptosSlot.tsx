"use client";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { conceptosNominaService } from "@/services/personal.service";
import type { ConceptoNomina, Nomina, TipoConcepto } from "@/types/nomina";
import { dinero } from "../nomina-utils";
import { CLASE_LABEL, CLASE_SUBTITULO, ErrorNomina } from "../NominaUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const IMPORTE = /^\d+(\.\d{1,2})?$/;
const MAX_DESCRIPCION = 120;
const MAX_HORAS = 744;

const OPCIONES: { tipo: TipoConcepto; etiqueta: string; ayuda: string; ejemplo: string }[] = [
  { tipo: "BONO", etiqueta: "Bono", ayuda: "Se suma al sueldo.", ejemplo: "Bono por puntualidad" },
  { tipo: "HORA_EXTRA", etiqueta: "Horas extra", ayuda: "Se suma al total ganado; indica las horas y su importe.", ejemplo: "Turno nocturno del fin de semana" },
  { tipo: "DESCUENTO", etiqueta: "Descuento", ayuda: "Se resta del sueldo bruto (faltas, permisos no remunerados u otros).", ejemplo: "Falta del 12/10" },
];
const SUGERENCIAS_DESCUENTO = ["Falta", "Permiso no remunerado", "Atraso"];

type Formulario = { descripcion: string; monto: string; horas: string };
const VACIO: Formulario = { descripcion: "", monto: "", horas: "" };

/** Valida como el backend (nomina.util.js) para avisar antes de enviar. */
function validar(tipo: TipoConcepto, f: Formulario): string | null {
  const descripcion = f.descripcion.trim();
  if (!descripcion) return "Indica la descripción o el concepto.";
  if (descripcion.length > MAX_DESCRIPCION) return `La descripción no puede superar ${MAX_DESCRIPCION} caracteres.`;
  if (!IMPORTE.test(f.monto.trim()) || Number(f.monto) <= 0) return "El monto debe ser mayor que cero, con máximo 2 decimales.";
  if (tipo === "HORA_EXTRA") {
    if (!IMPORTE.test(f.horas.trim()) || Number(f.horas) <= 0) return "Indica la cantidad de horas (mayor que cero, máximo 2 decimales).";
    if (Number(f.horas) > MAX_HORAS) return `Las horas no pueden superar ${MAX_HORAS} en un mes.`;
  }
  return null;
}

function datosDe(tipo: TipoConcepto, f: Formulario) {
  return {
    descripcion: f.descripcion.trim(),
    monto: Number(f.monto),
    ...(tipo === "HORA_EXTRA" ? { horas: Number(f.horas) } : {}),
  };
}

/**
 * Bonos, horas extra y descuentos de una nómina pendiente (HU8 funcionalidad 3). El período es el de la
 * nómina. El backend recalcula el sueldo neto en cada cambio y rechaza los que lo dejarían negativo.
 */
export function GestionConceptosSlot({ nomina, onActualizada }: { nomina: Nomina; onActualizada: () => void }) {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeGestionar = puedeEjecutar(rol, "personal", "editar");

  const [tipo, setTipo] = useState<TipoConcepto>("BONO");
  const [form, setForm] = useState<Formulario>(VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<Formulario>(VACIO);
  const [confirmarQuitarId, setConfirmarQuitarId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  if (nomina.estado === "PAGADA") return null;
  if (!bolPuedeGestionar) {
    return <p className="font-caption text-[12px] text-muted-foreground">Solo el Administrador puede registrar bonos, horas extra y descuentos.</p>;
  }

  const opcion = OPCIONES.find((o) => o.tipo === tipo)!;
  const conceptos = nomina.conceptos ?? [];

  async function ejecutar(clave: string, accion: () => Promise<Nomina>, mensaje: (n: Nomina) => string) {
    const permiso = validarAccion(rol, "personal", "editar");
    if (!permiso.permitido) {
      setError(permiso.mensaje);
      return false;
    }
    setOcupado(clave);
    setError("");
    setAviso("");
    try {
      const actualizada = await accion();
      setAviso(mensaje(actualizada));
      onActualizada();
      return true;
    } catch (err) {
      setError(mensajeErrorNomina(err));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const strError = validar(tipo, form);
    if (strError) {
      setError(strError);
      setAviso("");
      return;
    }
    const ok = await ejecutar("agregar", () => conceptosNominaService.agregar(nomina.id, { tipo, ...datosDe(tipo, form) }),
      (n) => `${opcion.etiqueta} registrado. Sueldo neto recalculado: ${dinero(n.sueldoNeto)}.`);
    if (ok) setForm(VACIO);
  }

  function empezarEdicion(c: ConceptoNomina) {
    setEditandoId(c.id);
    setConfirmarQuitarId(null);
    setFormEdicion({ descripcion: c.descripcion, monto: Number(c.monto).toFixed(2), horas: c.horas ? String(Number(c.horas)) : "" });
    setError("");
    setAviso("");
  }

  async function guardarEdicion(c: ConceptoNomina) {
    const strError = validar(c.tipo, formEdicion);
    if (strError) {
      setError(strError);
      return;
    }
    const ok = await ejecutar(`editar-${c.id}`, () => conceptosNominaService.editar(nomina.id, c.id, datosDe(c.tipo, formEdicion)),
      (n) => `Concepto actualizado. Sueldo neto recalculado: ${dinero(n.sueldoNeto)}.`);
    if (ok) setEditandoId(null);
  }

  async function quitar(c: ConceptoNomina) {
    const ok = await ejecutar(`quitar-${c.id}`, () => conceptosNominaService.quitar(nomina.id, c.id),
      (n) => `Concepto quitado. Sueldo neto recalculado: ${dinero(n.sueldoNeto)}.`);
    if (ok) setConfirmarQuitarId(null);
  }

  return <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
    <p className={CLASE_SUBTITULO}>Bonos, horas extra y descuentos · {nomina.periodo}</p>

    <form onSubmit={agregar} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
        <div className="space-y-1">
          <span className={CLASE_LABEL}>Tipo</span>
          <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoConcepto); setError(""); }} disabled={!!ocupado}>
            <SelectTrigger aria-label="Tipo de concepto" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{OPCIONES.map((o) => <SelectItem key={o.tipo} value={o.tipo}>{o.etiqueta}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="space-y-1">
          <span className={CLASE_LABEL}>Descripción *</span>
          <Input maxLength={MAX_DESCRIPCION} placeholder={`Ej. ${opcion.ejemplo}`} value={form.descripcion} disabled={!!ocupado}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
        </label>
      </div>
      {tipo === "DESCUENTO" && <div className="flex flex-wrap gap-1.5">
        {SUGERENCIAS_DESCUENTO.map((s) => <button key={s} type="button" disabled={!!ocupado}
          onClick={() => setForm((p) => ({ ...p, descripcion: p.descripcion.trim() ? p.descripcion : s }))}
          className="font-caption rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">{s}</button>)}
      </div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {tipo === "HORA_EXTRA" && <label className="space-y-1">
          <span className={CLASE_LABEL}>Horas *</span>
          <Input type="number" min="0.01" max={MAX_HORAS} step="0.5" inputMode="decimal" placeholder="Ej. 8" value={form.horas} disabled={!!ocupado}
            onChange={(e) => setForm((p) => ({ ...p, horas: e.target.value }))} />
        </label>}
        <label className={`space-y-1 ${tipo === "HORA_EXTRA" ? "" : "sm:col-span-2"}`}>
          <span className={CLASE_LABEL}>Monto (Bs) *</span>
          <Input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.monto} disabled={!!ocupado}
            onChange={(e) => setForm((p) => ({ ...p, monto: e.target.value }))} />
        </label>
        <Button type="submit" cargando={ocupado === "agregar"} disabled={!!ocupado && ocupado !== "agregar"}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      <p className="font-caption text-[11px] text-muted-foreground">{opcion.ayuda} El sueldo neto se recalcula al guardar.</p>
    </form>

    {conceptos.length > 0 && <div className="space-y-1 border-t border-border pt-3">
      <p className={CLASE_LABEL}>Editar o quitar conceptos</p>
      {conceptos.map((c) => editandoId === c.id ? (
        <div key={c.id} className="space-y-2 rounded-lg border border-border bg-card p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px]">
            <Input aria-label="Descripción" maxLength={MAX_DESCRIPCION} value={formEdicion.descripcion}
              onChange={(e) => setFormEdicion((p) => ({ ...p, descripcion: e.target.value }))} />
            {c.tipo === "HORA_EXTRA" && <Input aria-label="Horas" type="number" min="0.01" step="0.5" value={formEdicion.horas}
              onChange={(e) => setFormEdicion((p) => ({ ...p, horas: e.target.value }))} />}
            <Input aria-label="Monto" type="number" min="0.01" step="0.01" value={formEdicion.monto} className={c.tipo === "HORA_EXTRA" ? "" : "sm:col-span-2"}
              onChange={(e) => setFormEdicion((p) => ({ ...p, monto: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => setEditandoId(null)}><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" cargando={ocupado === `editar-${c.id}`} onClick={() => void guardarEdicion(c)}><Save className="h-3.5 w-3.5" /> Guardar</Button>
          </div>
        </div>
      ) : (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-[12px]">
          <span className="text-foreground">{c.tipoEtiqueta} · {c.descripcion}{c.horas ? ` (${Number(c.horas)} h)` : ""} · <span className={c.tipo === "DESCUENTO" ? "text-destructive" : "text-success"}>{dinero(c.monto)}</span></span>
          {confirmarQuitarId === c.id ? (
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">¿Quitar?</span>
              <Button size="xs" variant="destructive" cargando={ocupado === `quitar-${c.id}`} onClick={() => void quitar(c)}>Sí, quitar</Button>
              <Button size="xs" variant="ghost" disabled={!!ocupado} onClick={() => setConfirmarQuitarId(null)}>No</Button>
            </span>
          ) : (
            <span className="flex gap-1">
              <Button size="xs" variant="ghost" disabled={!!ocupado} onClick={() => empezarEdicion(c)}><Pencil className="h-3 w-3" /> Editar</Button>
              <Button size="xs" variant="ghost" disabled={!!ocupado} className="text-destructive" onClick={() => { setConfirmarQuitarId(c.id); setEditandoId(null); }}>
                <Trash2 className="h-3 w-3" /> Quitar
              </Button>
            </span>
          )}
        </div>
      ))}
    </div>}

    {aviso && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-[12px] text-success">{aviso}</p>}
    {error && <ErrorNomina mensaje={error} />}
  </div>;
}
