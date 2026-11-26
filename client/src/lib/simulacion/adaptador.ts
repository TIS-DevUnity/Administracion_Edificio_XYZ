import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { leerEstado, modificarEstado } from "./almacen";
import * as motor from "./motor";

type Cuerpo = Record<string, unknown>;
type Manejador = (coincidencia: string[], cuerpo: Cuerpo, filtros: Cuerpo) => { status?: number; data: unknown };
type Ruta = [metodo: string, patron: RegExp, manejador: Manejador];

const ID = "([^/]+)";

function leerDatos() {
  const estado = leerEstado();
  if (!estado) throw new motor.ErrorSimulacion("La simulación todavía no tiene datos cargados.", 409);
  return estado;
}

const expensaConSaldo = (estado: motor.EstadoSimulacion, { expensa, aplicado }: { expensa: motor.ExpensaSim; aplicado: number }) => ({
  ...motor.expensaDTO(estado, expensa),
  saldoFavorAplicado: (aplicado / 100).toFixed(2),
});

/** Cada endpoint que usan Morosidad y Pagos, resuelto por el motor con la misma respuesta que el backend. */
const RUTAS: Ruta[] = [
  ["get", /^\/financiero\/expensas$/, (_, __, filtros) => ({ data: motor.listarExpensas(leerDatos(), filtros) })],
  ["post", /^\/financiero\/expensas$/, (_, cuerpo) => ({
    status: 201,
    data: modificarEstado((estado) => expensaConSaldo(estado, motor.generar(estado, cuerpo as { inmuebleId: string; periodo: string; fechaVencimiento?: string }))),
  })],
  ["post", new RegExp(`^/financiero/expensas/${ID}/pagos$`), ([id], cuerpo) => ({
    status: 201,
    data: modificarEstado((estado) => {
      const resultado = motor.registrarPago(estado, id, cuerpo);
      return { ...resultado, expensa: motor.expensaDTO(estado, resultado.expensa) };
    }),
  })],
  ["post", new RegExp(`^/financiero/expensas/${ID}/aplicar-saldo$`), ([id]) => ({
    data: modificarEstado((estado) => {
      const resultado = motor.aplicarSaldoFavor(estado, id);
      return { ...resultado, expensa: motor.expensaDTO(estado, resultado.expensa) };
    }),
  })],
  ["post", new RegExp(`^/financiero/expensas/${ID}/aplicar-mora$`), ([id]) => ({
    data: modificarEstado((estado) => {
      const { expensa, ...resto } = motor.aplicarMora(estado, id);
      return { ...motor.expensaDTO(estado, expensa), ...resto };
    }),
  })],
  ["patch", new RegExp(`^/financiero/expensas/${ID}/agua$`), ([id], cuerpo) => ({
    data: modificarEstado((estado) => expensaConSaldo(estado, motor.cargarAgua(estado, id, cuerpo.montoAgua))),
  })],
  ["patch", new RegExp(`^/financiero/expensas/${ID}/extra$`), ([id], cuerpo) => ({
    data: modificarEstado((estado) => expensaConSaldo(estado, motor.cargarExtra(estado, id, cuerpo))),
  })],
  ["patch", new RegExp(`^/financiero/expensas/${ID}/vencimiento$`), ([id], cuerpo) => ({
    data: modificarEstado((estado) => motor.expensaDTO(estado, motor.cambiarVencimiento(estado, id, cuerpo))),
  })],

  ["get", /^\/financiero\/configuracion-mora$/, () => {
    const config = motor.configVigente(leerDatos());
    if (!config) throw new motor.ErrorSimulacion("No hay una configuracion de mora vigente", 404);
    return { data: config };
  }],
  ["get", /^\/financiero\/configuracion-mora\/historial$/, () => ({ data: motor.historialConfig(leerDatos()) })],
  ["post", /^\/financiero\/configuracion-mora$/, (_, cuerpo) => ({ status: 201, data: modificarEstado((estado) => motor.crearConfig(estado, cuerpo)) })],

  ["post", /^\/financiero\/jobs\/ejecutar-generacion$/, (_, __, filtros) => ({
    data: modificarEstado((estado) => motor.ejecutarGeneracion(estado, filtros.forzar === "true")),
  })],
  ["post", /^\/financiero\/jobs\/ejecutar-mora$/, () => ({ data: modificarEstado(motor.ejecutarMora) })],

  ["get", new RegExp(`^/financiero/inmuebles/${ID}/saldo$`), ([id]) => ({ data: motor.obtenerSaldo(leerDatos(), id) })],
  ["get", new RegExp(`^/financiero/inmuebles/${ID}/estado-cuenta$`), ([id]) => ({ data: motor.obtenerEstadoCuenta(leerDatos(), id) })],
  ["get", new RegExp(`^/financiero/inmuebles/${ID}/saldo-favor/movimientos$`), ([id]) => ({ data: motor.listarMovimientosSaldo(leerDatos(), id) })],
  ["post", new RegExp(`^/financiero/inmuebles/${ID}/pagos-anticipados$`), ([id], cuerpo) => ({
    status: 201,
    data: modificarEstado((estado) => motor.registrarPagoAnticipado(estado, id, cuerpo)),
  })],

  ["get", /^\/financiero\/notificaciones\/correos$/, (_, __, filtros) => ({ data: motor.listarEnvios(leerDatos(), filtros) })],
  // Se informa como configurado para no mostrar el aviso de correos: la barra de simulación ya lo aclara.
  ["get", /^\/financiero\/notificaciones\/correos\/estado$/, () => ({ data: { configurado: true, faltan: [], modo: "PRODUCCION" } })],

  ["get", /^\/inmuebles$/, () => {
    const estado = leerDatos();
    return { data: { inmuebles: estado.inmuebles.map((inmueble) => motor.inmuebleDTO(estado, inmueble)) } };
  }],
  ["get", new RegExp(`^/inmuebles/${ID}/ocupantes$`), ([id]) => ({
    data: { ocupantes: leerDatos().ocupantes.filter((ocupante) => ocupante.inmuebleId === id) },
  })],
  ["get", /^\/tipos-inmueble$/, () => ({ data: { tiposInmueble: leerDatos().tipos } })],
  ["put", new RegExp(`^/tipos-inmueble/${ID}$`), ([id], cuerpo) => ({
    data: { tipoInmueble: modificarEstado((estado) => motor.guardarTipo(estado, id, cuerpo)) },
  })],
];

function rutaDe(config: InternalAxiosRequestConfig) {
  const [ruta, consulta] = (config.url ?? "").split("?");
  return { ruta, filtros: { ...Object.fromEntries(new URLSearchParams(consulta ?? "")), ...(config.params as Cuerpo | undefined) } };
}

function rechazar(config: InternalAxiosRequestConfig, status: number, data: Cuerpo) {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config };
  return new AxiosError(String(data.error), status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, undefined, response);
}

/**
 * Atiende las llamadas de `api` hechas dentro del entorno de simulación:
 *  - Lo que usan Morosidad y Pagos lo responde el motor.
 *  - Las demás consultas de finanzas se rechazan para no mezclar datos reales con simulados.
 *  - Ninguna escritura llega al servidor. Solo pasan al backend las consultas GET ajenas a la simulación
 *    (campanita, búsqueda global), que no cambian nada.
 */
export const adaptadorSimulacion: AxiosAdapter = async (config) => {
  const metodo = (config.method ?? "get").toLowerCase();
  const { ruta, filtros } = rutaDe(config);

  for (const [metodoRuta, patron, manejador] of RUTAS) {
    const coincidencia = metodoRuta === metodo ? patron.exec(ruta) : null;
    if (!coincidencia) continue;
    try {
      const cuerpo = typeof config.data === "string" && config.data ? (JSON.parse(config.data) as Cuerpo) : {};
      const { status = 200, data } = manejador(coincidencia.slice(1).map(decodeURIComponent), cuerpo, filtros);
      return { data, status, statusText: String(status), headers: {}, config };
    } catch (err) {
      if (err instanceof motor.ErrorSimulacion) {
        throw rechazar(config, err.status, {
          error: err.message,
          ...(err.codigo ? { codigo: err.codigo } : {}),
          ...(err.detalle ? { detalle: err.detalle } : {}),
        });
      }
      throw err;
    }
  }

  const bolConsultaAjena = metodo === "get" && (!ruta.startsWith("/financiero/") || ruta.startsWith("/financiero/notificaciones"));
  if (bolConsultaAjena) return axios.getAdapter(axios.defaults.adapter)(config);

  throw rechazar(config, metodo === "get" ? 409 : 403, { error: "Esta acción no está disponible en el entorno de simulación." });
};
