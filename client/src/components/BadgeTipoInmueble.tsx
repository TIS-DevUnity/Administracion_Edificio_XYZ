import { Inmueble, esDepartamento, etiquetaTipoInmueble } from "@/lib/inmuebles";

export function BadgeTipoInmueble({
  inmueble,
  className = "",
}: {
  inmueble: Pick<Inmueble, "clase" | "tipoInmueble">;
  className?: string;
}) {
  return (
    <span
      className={`font-caption inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        esDepartamento(inmueble) ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      } ${className}`}
    >
      {etiquetaTipoInmueble(inmueble)}
    </span>
  );
}
