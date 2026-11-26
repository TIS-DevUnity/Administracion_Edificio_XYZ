"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { VistaPreviaComunicadoDialog } from "@/components/comunicados/VistaPreviaComunicadoDialog";
import { CanalComunicado, Comunicado, DatosComunicado, ErroresComunicado, MAX_CUERPO, MAX_TITULO, MAX_WHATSAPP, ModoDestinatarios, ResumenEnvio, ResidenteComunicado, listarResidentesComunicado, obtenerErrorComunicado, validarDatosComunicado } from "@/lib/comunicados";

interface Props { abierto: boolean; comunicado?: Comunicado | null; onCerrar: () => void; onGuardar: (datos: DatosComunicado) => Promise<Comunicado>; onEnviado: (resumen: ResumenEnvio) => void; }
const claseTextarea = "min-h-36 max-h-[45vh] w-full min-w-0 resize-none overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm [overflow-wrap:anywhere] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive";
export function FormularioComunicadoDialog({ abierto, comunicado, onCerrar, onGuardar, onEnviado }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(comunicado?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(comunicado?.cuerpo ?? "");
  const [canales, setCanales] = useState<CanalComunicado[]>(comunicado?.canales ?? []);
  const [modo, setModo] = useState<ModoDestinatarios>(comunicado?.destinatariosModo ?? "TODOS");
  const [residentes, setResidentes] = useState<ResidenteComunicado[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>(comunicado?.destinatarioIds ?? []);
  const [cargandoResidentes, setCargandoResidentes] = useState(true);
  const [errores, setErrores] = useState<ErroresComunicado>({});
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState("");
  const datos: DatosComunicado = { titulo, cuerpo, canales, destinatarios: { modo, copropietarioIds: modo === "SELECCIONADOS" ? seleccionados : [] } };
  const limiteMensaje = canales.includes("WHATSAPP") ? MAX_WHATSAPP : MAX_CUERPO;
  useEffect(() => {
    let activo = true;
    listarResidentesComunicado()
      .then((items) => { if (activo) setResidentes(items); })
      .catch((e: unknown) => {
        if (activo) setErrorServidor(obtenerErrorComunicado(e, "No se pudo cargar la lista de residentes."));
      })
      .finally(() => { if (activo) setCargandoResidentes(false); });
    return () => { activo = false; };
  }, []);
  useEffect(() => {
    if (mostrarVistaPrevia) return; const campo = textareaRef.current; if (!campo) return;
    campo.style.height = "auto"; const max = Math.max(144, Math.round(window.innerHeight * .45));
    campo.style.height = `${Math.min(campo.scrollHeight, max)}px`; campo.style.overflowY = campo.scrollHeight > max ? "auto" : "hidden";
  }, [cuerpo, mostrarVistaPrevia]);
  function alternarCanal(canal: CanalComunicado) { setCanales((actual) => actual.includes(canal) ? actual.filter((c) => c !== canal) : [...actual, canal]); setErrores((e) => ({ ...e, canales: undefined, cuerpo: undefined })); }
  async function guardarSoloBorrador() {
    if (guardando) return;
    const validacion = validarDatosComunicado(datos);
    setErrores(validacion);
    if (Object.keys(validacion).length) return;
    setGuardando(true); setErrorServidor("");
    try { await onGuardar(datos); onCerrar(); }
    catch (e) { setErrorServidor(obtenerErrorComunicado(e, "No se pudo guardar el borrador.")); }
    finally { setGuardando(false); }
  }
  function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); const validacion = validarDatosComunicado(datos); setErrores(validacion); setErrorServidor("");
    if (Object.keys(validacion).length) return;
    setGuardando(true);
    onGuardar(datos).then((guardado) => { setIdGuardado(guardado.id); setMostrarVistaPrevia(true); })
      .catch((e: unknown) => setErrorServidor(obtenerErrorComunicado(e, "No se pudo guardar el borrador.")))
      .finally(() => setGuardando(false));
  }
  const cerrar = () => { if (!guardando) { setMostrarVistaPrevia(false); setIdGuardado(null); onCerrar(); } };
  return <Dialog open={abierto} onOpenChange={(open) => { if (!open) cerrar(); }}>
    <DialogContent className="max-h-[90vh] w-full min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{mostrarVistaPrevia ? "Confirmar envío" : comunicado ? "Editar borrador" : "Nuevo comunicado"}</DialogTitle><DialogDescription>{mostrarVistaPrevia ? "Verifica el contenido y la cantidad de destinatarios." : "Redacta el aviso, selecciona los canales y define quiénes lo recibirán."}</DialogDescription></DialogHeader>
      {mostrarVistaPrevia && idGuardado ? <VistaPreviaComunicadoDialog comunicadoId={idGuardado} datos={datos} onVolver={() => setMostrarVistaPrevia(false)} onEnviado={onEnviado}/> : <form className="space-y-4" onSubmit={revisar} noValidate>
        <div className="space-y-1.5"><div className="flex justify-between"><label htmlFor="comunicado-titulo" className="text-sm font-medium">Título *</label><span className="text-xs text-muted-foreground">{titulo.trim().length}/{MAX_TITULO}</span></div><Input id="comunicado-titulo" value={titulo} maxLength={MAX_TITULO + 20} aria-invalid={!!errores.titulo} onChange={(e) => { setTitulo(e.target.value); setErrores((v) => ({ ...v, titulo: undefined })); }}/>{errores.titulo && <p role="alert" className="text-xs text-destructive">{errores.titulo}</p>}</div>
        <div className="space-y-1.5"><div className="flex justify-between"><label htmlFor="comunicado-cuerpo" className="text-sm font-medium">Mensaje *</label><span className={`text-xs ${cuerpo.trim().length > limiteMensaje ? "text-destructive" : "text-muted-foreground"}`}>{cuerpo.trim().length}/{limiteMensaje}</span></div><textarea id="comunicado-cuerpo" ref={textareaRef} rows={5} className={claseTextarea} value={cuerpo} aria-invalid={!!errores.cuerpo} onChange={(e) => { setCuerpo(e.target.value); setErrores((v) => ({ ...v, cuerpo: undefined })); }}/>{canales.includes("WHATSAPP") && <p className="text-xs text-muted-foreground">El título y el mensaje juntos deben caber en 1024 caracteres para WhatsApp.</p>}{errores.cuerpo && <p role="alert" className="text-xs text-destructive">{errores.cuerpo}</p>}</div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Canales *</legend><div className="grid gap-2 sm:grid-cols-2">{(["CORREO", "WHATSAPP"] as CanalComunicado[]).map((c) => <label key={c} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={canales.includes(c)} onChange={() => alternarCanal(c)}/>{c === "CORREO" ? "Correo electrónico" : "WhatsApp"}</label>)}</div>{errores.canales && <p role="alert" className="text-xs text-destructive">{errores.canales}</p>}</fieldset>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Destinatarios *</legend><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={modo === "TODOS"} onChange={() => setModo("TODOS")}/> Todos los residentes vigentes</label><label className="flex items-center gap-2"><input type="radio" checked={modo === "SELECCIONADOS"} onChange={() => setModo("SELECCIONADOS")}/> Seleccionar residentes</label></div>{modo === "SELECCIONADOS" && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">{cargandoResidentes ? <p className="text-sm text-muted-foreground">Cargando residentes…</p> : residentes.length === 0 ? <p className="text-sm text-muted-foreground">No hay residentes vigentes disponibles.</p> : residentes.map((r) => <label key={r.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={seleccionados.includes(r.id)} onChange={(e) => setSeleccionados((actual) => e.target.checked ? [...actual, r.id] : actual.filter((id) => id !== r.id))}/><span>{r.nombre} {r.apellido}<span className="block text-xs text-muted-foreground">{r.email || "Sin correo"} · {r.telefono || "Sin teléfono"}</span></span></label>)}</div>}{errores.destinatarios && <p role="alert" className="text-xs text-destructive">{errores.destinatarios}</p>}</fieldset>
        {errorServidor && <p role="alert" className="text-sm text-destructive">{errorServidor}</p>}
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button><Button type="button" variant="secondary" onClick={() => void guardarSoloBorrador()} disabled={guardando || cargandoResidentes}>Guardar borrador</Button><Button type="submit" disabled={guardando || cargandoResidentes}><Eye/>{guardando ? "Guardando…" : "Guardar y revisar envío"}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
