"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { VistaPreviaComunicadoDialog } from "@/components/comunicados/VistaPreviaComunicadoDialog";
import {
  CanalComunicado, Comunicado, DatosComunicado, ErroresComunicado,
  MAX_CUERPO, MAX_TITULO, MAX_WHATSAPP, obtenerErrorComunicado, validarDatosComunicado,
} from "@/lib/comunicados";

interface Props {
  abierto: boolean;
  comunicado?: Comunicado | null;
  onCerrar: () => void;
  onGuardar: (datos: DatosComunicado) => Promise<void>;
}

const claseTextarea = "min-h-36 max-h-[45vh] w-full min-w-0 resize-none overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm [overflow-wrap:anywhere] outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive";

export function FormularioComunicadoDialog({ abierto, comunicado, onCerrar, onGuardar }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(comunicado?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(comunicado?.cuerpo ?? "");
  const [canales, setCanales] = useState<CanalComunicado[]>(comunicado?.canales ?? []);
  const [errores, setErrores] = useState<ErroresComunicado>({});
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState("");

  const datos: DatosComunicado = { titulo, cuerpo, canales };
  const limiteMensaje = canales.includes("WHATSAPP") ? MAX_WHATSAPP : MAX_CUERPO;

  // BUG-004: crece con el texto hasta un límite seguro para la altura del modal.
  // No se permite arrastrar el control manualmente.
  useEffect(() => {
    if (mostrarVistaPrevia) return;
    const campo = textareaRef.current;
    if (!campo) return;
    campo.style.height = "auto";
    const alturaMaxima = Math.max(144, Math.round(window.innerHeight * 0.45));
    const alturaNecesaria = campo.scrollHeight;
    campo.style.height = `${Math.min(alturaNecesaria, alturaMaxima)}px`;
    campo.style.overflowY = alturaNecesaria > alturaMaxima ? "auto" : "hidden";
  }, [cuerpo, mostrarVistaPrevia]);

  function alternarCanal(canal: CanalComunicado) {
    setCanales((actual) => actual.includes(canal) ? actual.filter((c) => c !== canal) : [...actual, canal]);
    setErrores((actual) => ({ ...actual, canales: undefined, cuerpo: undefined }));
  }

  function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const validacion = validarDatosComunicado(datos);
    setErrores(validacion);
    setErrorServidor("");
    if (Object.keys(validacion).length === 0) setMostrarVistaPrevia(true);
  }

  async function guardar() {
    if (guardando) return;
    const validacion = validarDatosComunicado(datos);
    if (Object.keys(validacion).length > 0) {
      setErrores(validacion);
      setMostrarVistaPrevia(false);
      return;
    }
    setGuardando(true);
    setErrorServidor("");
    try {
      await onGuardar(datos);
    } catch (error) {
      setErrorServidor(obtenerErrorComunicado(error, "No se pudo guardar el borrador."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open && !guardando) onCerrar(); }}>
      <DialogContent className="max-h-[90vh] w-full min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{comunicado ? "Editar borrador" : "Nuevo comunicado"}</DialogTitle>
          <DialogDescription>Redacta un aviso para los residentes. Por ahora solo se puede guardar como borrador.</DialogDescription>
        </DialogHeader>
        {mostrarVistaPrevia ? (
          <VistaPreviaComunicadoDialog
            datos={datos}
            cargando={guardando}
            error={errorServidor}
            onVolver={() => setMostrarVistaPrevia(false)}
            onGuardar={() => void guardar()}
          />
        ) : (
          <form className="space-y-4" onSubmit={revisar} noValidate>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="comunicado-titulo" className="text-sm font-medium">Título <span className="text-destructive">*</span></label>
                <span className={`text-xs ${titulo.trim().length > MAX_TITULO ? "text-destructive" : "text-muted-foreground"}`}>{titulo.trim().length}/{MAX_TITULO}</span>
              </div>
              <Input id="comunicado-titulo" placeholder="Ej. Mantenimiento del ascensor" value={titulo} aria-invalid={Boolean(errores.titulo)} onChange={(event) => { setTitulo(event.target.value); setErrores((e) => ({ ...e, titulo: undefined })); }} />
              {errores.titulo && <p role="alert" className="text-xs text-destructive">{errores.titulo}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="comunicado-cuerpo" className="text-sm font-medium">Mensaje <span className="text-destructive">*</span></label>
                <span className={`text-xs ${cuerpo.trim().length > limiteMensaje ? "text-destructive" : "text-muted-foreground"}`}>{cuerpo.trim().length}/{limiteMensaje}</span>
              </div>
              <textarea id="comunicado-cuerpo" ref={textareaRef} wrap="soft" rows={5} className={claseTextarea} placeholder="Escribe el comunicado..." value={cuerpo} aria-invalid={Boolean(errores.cuerpo)} onChange={(event) => { setCuerpo(event.target.value); setErrores((e) => ({ ...e, cuerpo: undefined })); }} />
              {canales.includes("WHATSAPP") && <p className="text-xs text-muted-foreground">WhatsApp admite un máximo de 1024 caracteres, incluso si también seleccionas correo.</p>}
              {errores.cuerpo && <p role="alert" className="text-xs text-destructive">{errores.cuerpo}</p>}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Canales de destino <span className="text-destructive">*</span></legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50">
                  <input type="checkbox" className="size-4 accent-primary" checked={canales.includes("CORREO")} onChange={() => alternarCanal("CORREO")} /> Correo electrónico
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50">
                  <input type="checkbox" className="size-4 accent-primary" checked={canales.includes("WHATSAPP")} onChange={() => alternarCanal("WHATSAPP")} /> WhatsApp
                </label>
              </div>
              {errores.canales && <p role="alert" className="text-xs text-destructive">{errores.canales}</p>}
            </fieldset>
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">El guardado no envía el mensaje. Backend todavía no dispone de la operación de envío ni del conteo de destinatarios.</p>
            {errorServidor && <p role="alert" className="text-sm text-destructive">{errorServidor}</p>}
            <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
              <Button type="submit"><Eye /> Revisar borrador</Button>
              <Button type="button" variant="secondary" disabled title="Disponible cuando Backend implemente el envío"><Save /> Enviar (pendiente)</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
