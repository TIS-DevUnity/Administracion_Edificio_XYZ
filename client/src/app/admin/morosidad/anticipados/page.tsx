"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileText, RefreshCw, Search } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { DialogoEstadoCuenta } from "@/components/DialogoEstadoCuenta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarInmuebles } from "@/lib/inmuebles";
import { normalizarRol } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import { RUTA_SIMULACION } from "@/lib/simulacion/almacen";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import type { EstadoCuentaDTO, MovimientoLibro } from "@/types/cuentaInmueble";
import { QueryProvider } from "../QueryProvider";
import { formatCurrency, formatearFechaCalendario, obtenerMensajeError } from "../utils/morosidad";

const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO = CLASE_HEADER_TABLA;
const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
const CLASE_TITULO_DIALOGO = "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
const CLASE_CIFRA = "font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";
const CLASE_AVISO_ERROR = "rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive";

const TAM_LOTE = 6;
const ORIGEN_ANTICIPADO = "PAGO_ANTICIPADO";

type FiltroEstado = "TODOS" | "CON_SALDO" | "AGOTADO";

interface FilaAnticipado {
  inmuebleId: string;
  codigo: string;
  responsable: EstadoCuentaDTO["responsable"];
  origenes: string[];
  ultimoAbono: string | null;
  abonado: number;
  descontado: number;
  saldo: number;
  movimientos: MovimientoLibro[];
  expensas: EstadoCuentaDTO["expensas"];
  deudaPendiente: number;
}

// Suma en centavos para no arrastrar errores de redondeo en los totales.
function sumar(valores: Array<string | number | undefined>) {
  return valores.reduce<number>((total, valor) => total + Math.round(Number(valor ?? 0) * 100), 0) / 100;
}

/** Evita lanzar una consulta por departamento al mismo tiempo. */
async function enLotes<T, R>(items: T[], accion: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += TAM_LOTE) {
    resultados.push(...(await Promise.all(items.slice(i, i + TAM_LOTE).map(accion))));
  }
  return resultados;
}

function armarFila(inmuebleId: string, cuenta: EstadoCuentaDTO): FilaAnticipado {
  const abonos = cuenta.movimientos.filter((m) => m.tipo === "SALDO_A_FAVOR");
  const descuentos = cuenta.movimientos.filter((m) => m.tipo === "APLICACION_SALDO");
  return {
    inmuebleId,
    codigo: cuenta.inmueble.codigo,
    responsable: cuenta.responsable,
    origenes: [...new Set(abonos.map((m) => (m.detalle?.origen === ORIGEN_ANTICIPADO ? "Pago anticipado" : "Pago de más")))],
    ultimoAbono: abonos.at(-1)?.fecha ?? null,
    abonado: sumar(abonos.map((m) => m.abono)),
    descontado: sumar(descuentos.map((m) => m.aplicadoDeSaldoAFavor)),
    saldo: Number(cuenta.resumen.saldoFavor),
    movimientos: cuenta.movimientos.filter((m) => m.tipo === "SALDO_A_FAVOR" || m.tipo === "APLICACION_SALDO"),
    expensas: cuenta.expensas,
    deudaPendiente: Number(cuenta.resumen.deudaPendiente),
  };
}

/**
 * El backend no tiene un listado general de saldos a favor: se consultan los movimientos de cada
 * departamento y solo se pide el estado de cuenta de los que tienen alguno.
 */
async function cargarAnticipados(): Promise<FilaAnticipado[]> {
  const departamentos = (await listarInmuebles()).filter((inmueble) => inmueble.clase === "DEPARTAMENTO");
  const conMovimientos = await enLotes(departamentos, async (inmueble) => {
    const { movimientos } = await cuentaInmuebleService.listarMovimientosSaldo(inmueble.id);
    return movimientos.length > 0 ? inmueble.id : null;
  });
  const ids = conMovimientos.filter((id): id is string => id !== null);
  const filas = await enLotes(ids, async (id) => armarFila(id, await cuentaInmuebleService.obtenerEstadoCuenta(id)));
  return filas.sort((a, b) => b.saldo - a.saldo || a.codigo.localeCompare(b.codigo, "es"));
}

function BadgeSaldo({ saldo }: { saldo: number }) {
  return saldo > 0
    ? <Badge className="font-caption bg-success-subtle text-[11px] text-success">Con saldo</Badge>
    : <Badge className="font-caption bg-muted text-[11px] text-muted-foreground">Agotado</Badge>;
}

function DetalleAnticipado({ fila, onCerrar, onVerCuenta }: {
  fila: FilaAnticipado | null;
  onCerrar: () => void;
  onVerCuenta: (inmuebleId: string) => void;
}) {
  return (
    <Dialog open={fila !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>Saldo a favor de {fila?.codigo}</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
            {fila?.responsable?.nombre ?? "Sin responsable vigente"}. Abonos recibidos y expensas en las que se fue descontando.
          </DialogDescription>
        </DialogHeader>

        {fila && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { etiqueta: "Abonado", valor: fila.abonado, clase: "text-foreground" },
                { etiqueta: "Descontado", valor: fila.descontado, clase: "text-foreground" },
                { etiqueta: "Saldo disponible", valor: fila.saldo, clase: fila.saldo > 0 ? "text-success" : "text-muted-foreground" },
              ].map((item) => (
                <div key={item.etiqueta} className="rounded-lg border border-border p-3">
                  <p className={CLASE_LABEL_CAMPO}>{item.etiqueta}</p>
                  <p className={`mt-1 text-[15px] font-semibold tabular-nums ${item.clase}`}>{formatCurrency(item.valor)}</p>
                </div>
              ))}
            </div>

            {fila.saldo > 0 && fila.deudaPendiente > 0 && (
              <p className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 px-3 py-2 text-[13px] leading-[1.45] text-foreground">
                Este departamento debe {formatCurrency(fila.deudaPendiente)}. El saldo se descuenta solo, empezando por su deuda más antigua.
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={CLASE_HEADER_TABLA}>Fecha</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Movimiento</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Monto</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fila.movimientos.map((movimiento, indice) => {
                    const bolDescuento = movimiento.tipo === "APLICACION_SALDO";
                    const expensa = fila.expensas.find((item) => item.id === movimiento.expensaId);
                    return (
                      <TableRow key={`${movimiento.tipo}-${movimiento.fecha}-${indice}`}>
                        <TableCell className="whitespace-nowrap text-[13px] text-foreground">{formatearFechaCalendario(movimiento.fecha)}</TableCell>
                        <TableCell className="min-w-[220px] whitespace-normal">
                          <p className="text-[13px] text-foreground">
                            {bolDescuento
                              ? `Descontado de la expensa ${movimiento.periodo ?? ""}`
                              : movimiento.detalle?.origen === ORIGEN_ANTICIPADO ? "Pago anticipado" : "Pago de más"}
                          </p>
                          <p className={CLASE_AYUDA}>
                            {bolDescuento
                              ? expensa && `Total ${formatCurrency(Number(expensa.montoTotal))} · Pendiente hoy ${formatCurrency(Number(expensa.pendiente))}`
                              : [movimiento.metodoEtiqueta, movimiento.folio && `Recibo ${movimiento.folio}`, movimiento.referencia].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className={`whitespace-nowrap text-right text-[13px] font-medium tabular-nums ${bolDescuento ? "text-destructive" : "text-success"}`}>
                          {bolDescuento
                            ? `− ${formatCurrency(Number(movimiento.aplicadoDeSaldoAFavor ?? 0))}`
                            : `+ ${formatCurrency(Number(movimiento.abono))}`}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-foreground">
                          {formatCurrency(Number(movimiento.saldoCorrido.saldoFavor))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onVerCuenta(fila.inmuebleId)}>
                <FileText className="h-4 w-4" />
                Ver estado de cuenta
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContenidoAnticipados() {
  const bolEnSimulacion = usePathname().startsWith(RUTA_SIMULACION);
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  // El rol CONSULTA solo puede ver la cuenta de sus propios inmuebles (acceso-propio.js).
  const bolPuedeVer = Boolean(usuario) && rol !== "CONSULTA";

  const [strBusqueda, setStrBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("TODOS");
  const [filaDetalle, setFilaDetalle] = useState<FilaAnticipado | null>(null);
  const [strInmuebleCuentaId, setStrInmuebleCuentaId] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["morosidad", "anticipados"],
    queryFn: cargarAnticipados,
    enabled: bolPuedeVer,
  });
  const filas = useMemo(() => consulta.data ?? [], [consulta.data]);

  const filasVisibles = useMemo(() => {
    const texto = strBusqueda.trim().toLocaleLowerCase("es");
    return filas.filter((fila) =>
      (filtroEstado === "TODOS" || (filtroEstado === "CON_SALDO") === (fila.saldo > 0)) &&
      (!texto || [fila.codigo, fila.responsable?.nombre ?? ""].some((valor) => valor.toLocaleLowerCase("es").includes(texto)))
    );
  }, [filas, filtroEstado, strBusqueda]);

  if (!usuario) return <div className="px-4 py-6 sm:px-6"><Skeleton className="h-32 w-full" /></div>;

  if (!bolPuedeVer) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <AlertaPermiso mensaje="Este listado está disponible para Administración y Directorio." />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <Link href={bolEnSimulacion ? RUTA_SIMULACION : "/admin/morosidad"} className="font-caption inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary/80">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Morosidad y Expensas
          </Link>
          <h2 className={CLASE_TITULO_SECCION}>Pagos anticipados y saldo a favor</h2>
          <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
            Departamentos que pagaron por adelantado o de más. El monto se descuenta automáticamente de las expensas, empezando por la deuda más antigua.
          </p>
        </div>
        <Button variant="outline" cargando={consulta.isFetching} onClick={() => void consulta.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {consulta.isError && (
        <div role="alert" className={`${CLASE_AVISO_ERROR} flex flex-wrap items-center justify-between gap-3`}>
          <span>{obtenerMensajeError(consulta.error, "No se pudo cargar el listado de pagos anticipados.")}</span>
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>Reintentar</Button>
        </div>
      )}

      {!consulta.isError && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { etiqueta: "Departamentos", valor: String(filas.length), clase: "text-foreground" },
            { etiqueta: "Total abonado", valor: formatCurrency(sumar(filas.map((f) => f.abonado))), clase: "text-foreground" },
            { etiqueta: "Descontado de expensas", valor: formatCurrency(sumar(filas.map((f) => f.descontado))), clase: "text-foreground" },
            { etiqueta: "Saldo disponible", valor: formatCurrency(sumar(filas.map((f) => f.saldo))), clase: "text-success" },
          ].map((item) => (
            <Card key={item.etiqueta} className="shadow-sm">
              <CardContent>
                <p className={CLASE_LABEL_CAMPO}>{item.etiqueta}</p>
                {consulta.isPending ? <Skeleton className="mt-2 h-6 w-24" /> : <p className={`${CLASE_CIFRA} mt-1 ${item.clase}`}>{item.valor}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <div className="grid gap-3 border-b border-border bg-muted/20 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="flex flex-col gap-1">
            <label htmlFor="buscar-anticipado" className={CLASE_LABEL_CAMPO}>Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="buscar-anticipado" className="h-9 pl-9" placeholder="Departamento o responsable..."
                value={strBusqueda} onChange={(e) => setStrBusqueda(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={CLASE_LABEL_CAMPO}>Estado</span>
            <Select value={filtroEstado} onValueChange={(valor: FiltroEstado) => setFiltroEstado(valor)}>
              <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="CON_SALDO">Con saldo</SelectItem>
                <SelectItem value="AGOTADO">Agotado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="p-0">
          {consulta.isPending ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filasVisibles.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              {filas.length === 0 ? "Todavía no hay pagos anticipados ni pagos de más registrados." : "Ningún departamento coincide con los filtros."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${CLASE_HEADER_TABLA} pl-5`}>Departamento</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Responsable</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Origen</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Último abono</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Abonado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Descontado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Saldo</TableHead>
                    <TableHead className={CLASE_HEADER_TABLA}>Estado</TableHead>
                    <TableHead className={`${CLASE_HEADER_TABLA} pr-5 text-right`}>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasVisibles.map((fila) => (
                    <TableRow key={fila.inmuebleId}>
                      <TableCell className="pl-5 text-[13px] font-medium text-foreground">{fila.codigo}</TableCell>
                      <TableCell>
                        <p className="text-[13px] text-foreground">{fila.responsable?.nombre ?? "Sin responsable vigente"}</p>
                        {fila.responsable && <p className={CLASE_AYUDA}>{fila.responsable.rol === "PROPIETARIO" ? "Propietario" : "Inquilino"}</p>}
                      </TableCell>
                      <TableCell className="text-[13px] text-foreground">{fila.origenes.join(" y ")}</TableCell>
                      <TableCell className="whitespace-nowrap text-[13px] text-foreground">{fila.ultimoAbono ? formatearFechaCalendario(fila.ultimoAbono) : "—"}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-foreground">{formatCurrency(fila.abonado)}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums text-foreground">{formatCurrency(fila.descontado)}</TableCell>
                      <TableCell className={`text-right text-[13px] font-medium tabular-nums ${fila.saldo > 0 ? "text-success" : "text-muted-foreground"}`}>{formatCurrency(fila.saldo)}</TableCell>
                      <TableCell><BadgeSaldo saldo={fila.saldo} /></TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button size="sm" variant="outline" onClick={() => setFilaDetalle(fila)}>
                          <Eye className="h-4 w-4" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className={CLASE_AYUDA}>
        El saldo pertenece al departamento; el responsable es quien lo ocupa hoy. Los pagos anticipados se registran en la pantalla de Pagos.
      </p>

      <DetalleAnticipado
        fila={filaDetalle}
        onCerrar={() => setFilaDetalle(null)}
        onVerCuenta={(inmuebleId) => { setFilaDetalle(null); setStrInmuebleCuentaId(inmuebleId); }}
      />
      <DialogoEstadoCuenta strInmuebleId={strInmuebleCuentaId} onCerrar={() => setStrInmuebleCuentaId(null)} />
    </div>
  );
}

// Mismo provider aislado que la pantalla principal de morosidad.
export default function PagosAnticipadosPage() {
  return (
    <QueryProvider>
      <ContenidoAnticipados />
    </QueryProvider>
  );
}
