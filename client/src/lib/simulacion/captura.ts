import axios from "axios";
import { borrarEstado, iniciarEstado } from "./almacen";
import { fechaEnZona, type ConfigSim, type InmuebleSim, type OcupanteSim, type TipoSim } from "./motor";

const TAM_LOTE = 6;

/**
 * Lee del sistema real lo que la simulación necesita. Solo hace consultas GET y usa axios directo
 * (no la instancia `api`) porque dentro de la simulación `api` responde con los datos simulados.
 */
async function leer<T>(ruta: string): Promise<T> {
  const { data } = await axios.get<T>(ruta, {
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
    headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
  });
  return data;
}

async function leerOcupantes(inmuebles: InmuebleSim[]) {
  const ocupantes: OcupanteSim[] = [];
  for (let i = 0; i < inmuebles.length; i += TAM_LOTE) {
    const lote = await Promise.all(inmuebles.slice(i, i + TAM_LOTE).map((inmueble) =>
      leer<{ ocupantes: OcupanteSim[] }>(`/inmuebles/${encodeURIComponent(inmueble.id)}/ocupantes`)));
    ocupantes.push(...lote.flatMap((respuesta) => respuesta.ocupantes));
  }
  return ocupantes;
}

/** Crea la simulación desde cero, con la fecha de hoy y sin expensas ni pagos. */
export async function capturarDatos() {
  const [{ inmuebles }, { tiposInmueble }, { tarifas }, configuraciones] = await Promise.all([
    leer<{ inmuebles: InmuebleSim[] }>("/inmuebles"),
    leer<{ tiposInmueble: TipoSim[] }>("/tipos-inmueble"),
    leer<{ tarifas: { clase: string; monto: string }[] }>("/tarifas-inmueble"),
    leer<ConfigSim[]>("/financiero/configuracion-mora/historial"),
  ]);
  const ocupantes = await leerOcupantes(inmuebles);
  const ahora = new Date().toISOString();

  borrarEstado();
  iniciarEstado(fechaEnZona(ahora), ahora, { inmuebles, ocupantes, tipos: tiposInmueble, tarifas, configuraciones });
}
