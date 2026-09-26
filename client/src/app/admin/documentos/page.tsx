"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Info, Search, Trash2, Upload } from "lucide-react";

import { api } from "@/lib/api";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CATEGORIAS_FORMULARIO,
  CategoriaDocumento,
  Documento,
  ETIQUETA_CATEGORIA,
  FORMATOS_PERMITIDOS,
  TAMANIO_MAXIMO_BYTES,
  eliminarDocumento,
  formatearFecha,
  formatearTamanio,
  listarDocumentos,
  obtenerDocumento,
  obtenerMensajeError,
  subirDocumento,
} from "@/lib/documentos";

type CriterioOrden = "nombre" | "categoria" | "fecha";
type FiltroCategoria = CategoriaDocumento | "TODAS";

interface UsuarioResumen {
  id: string;
  nombre: string;
  apellido: string;
}

interface DatosPendientesSubida {
  titulo: string;
  categoria: CategoriaDocumento;
  archivo: File;
}

const CLASE_HEADER_TABLA =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO =
  "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

function claseCampo(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

function sanitizarNombreArchivo(strTitulo: string, strNombreOriginal: string): string {
  const intPuntoFinal = strNombreOriginal.lastIndexOf(".");
  const strExtension = intPuntoFinal >= 0 ? strNombreOriginal.slice(intPuntoFinal) : "";
  const strBase = strTitulo.trim().replace(/[\\/:*?"<>|]/g, "_");
  return `${strBase}${strExtension}`;
}

export default function DocumentosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeSubir = puedeEjecutar(rol, "documentos", "crear");
  const bolPuedeEliminar = puedeEjecutar(rol, "documentos", "eliminar");

  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({});
  const [bolLoading, setBolLoading] = useState(true);
  const [strErrorCarga, setStrErrorCarga] = useState("");

  const [strBusqueda, setStrBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>("TODAS");
  const [criterioOrden, setCriterioOrden] = useState<CriterioOrden>("fecha");

  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strAccionId, setStrAccionId] = useState<string | null>(null);

  // Diálogo de subida
  const [bolDialogoSubir, setBolDialogoSubir] = useState(false);
  const [camposErrorSubida, setCamposErrorSubida] = useState<Set<string>>(new Set());
  const [strErrorSubida, setStrErrorSubida] = useState("");
  const [bolSubiendo, setBolSubiendo] = useState(false);
  const [objPendienteDuplicado, setObjPendienteDuplicado] = useState<DatosPendientesSubida | null>(null);
  const [strAdvertenciaDuplicado, setStrAdvertenciaDuplicado] = useState("");

  // Diálogo de detalles
  const [documentoDetalle, setDocumentoDetalle] = useState<Documento | null>(null);

  // Diálogo de eliminar
  const [documentoEliminar, setDocumentoEliminar] = useState<Documento | null>(null);
  const [bolEliminando, setBolEliminando] = useState(false);
  const [strErrorEliminar, setStrErrorEliminar] = useState("");

  async function cargarDocumentos() {
    try {
      setBolLoading(true);
      setStrErrorCarga("");
      const arrDocumentos = await listarDocumentos();
      setDocumentos(arrDocumentos);
    } catch (error) {
      console.error("Error al cargar documentos:", error);
      setStrErrorCarga("No se pudo cargar el repositorio de documentos.");
    } finally {
      setBolLoading(false);
    }
  }

  async function cargarUsuarios() {
    if (!puedeEjecutar(rol, "usuarios", "ver")) return;
    try {
      const response = await api.get<{ usuarios: UsuarioResumen[] }>("/usuarios");
      const mapa: Record<string, string> = {};
      response.data.usuarios.forEach((u) => {
        mapa[u.id] = `${u.nombre} ${u.apellido}`;
      });
      setUsuariosMap(mapa);
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDocumentos();
    cargarUsuarios();

    const strQuery = new URLSearchParams(window.location.search).get("q");
    if (strQuery) setStrBusqueda(strQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const documentosVisibles = useMemo(() => {
    let lista = documentos;

    if (filtroCategoria !== "TODAS") {
      lista = lista.filter((doc) => doc.categoria === filtroCategoria);
    }

    const strBusquedaNormalizada = strBusqueda.trim().toLowerCase();
    if (strBusquedaNormalizada) {
      lista = lista.filter((doc) => doc.nombre.toLowerCase().includes(strBusquedaNormalizada));
    }

    return [...lista].sort((a, b) => {
      if (criterioOrden === "nombre") return a.nombre.localeCompare(b.nombre);
      if (criterioOrden === "categoria") return a.categoria.localeCompare(b.categoria);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [documentos, filtroCategoria, strBusqueda, criterioOrden]);

  function abrirDialogoSubir() {
    const objValidacion = validarAccion(rol, "documentos", "crear");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setCamposErrorSubida(new Set());
    setStrErrorSubida("");
    setObjPendienteDuplicado(null);
    setStrAdvertenciaDuplicado("");
    setBolDialogoSubir(true);
  }

  function cerrarDialogoSubir() {
    setBolDialogoSubir(false);
    setObjPendienteDuplicado(null);
    setStrAdvertenciaDuplicado("");
    setStrErrorSubida("");
  }

  async function ejecutarSubida(datos: DatosPendientesSubida) {
    setBolSubiendo(true);
    setStrErrorSubida("");

    try {
      const archivoRenombrado = new File(
        [datos.archivo],
        sanitizarNombreArchivo(datos.titulo, datos.archivo.name),
        { type: datos.archivo.type }
      );

      const formData = new FormData();
      formData.append("archivo", archivoRenombrado);
      formData.append("categoria", datos.categoria);

      await subirDocumento(formData);

      setStrExito("Documento cargado correctamente.");
      cerrarDialogoSubir();
      await cargarDocumentos();
    } catch (error) {
      setStrErrorSubida(obtenerMensajeError(error, "Ocurrió un error al subir el documento."));
    } finally {
      setBolSubiendo(false);
    }
  }

  function handleSubmitSubida(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrExito("");

    const objFormulario = new FormData(event.currentTarget);
    const strTitulo = String(objFormulario.get("titulo") ?? "").trim();
    const strCategoria = String(objFormulario.get("categoria") ?? "") as CategoriaDocumento;
    const archivo = objFormulario.get("archivo") as File | null;

    const camposFaltantes = new Set<string>();
    if (!strTitulo) camposFaltantes.add("titulo");
    if (!strCategoria) camposFaltantes.add("categoria");
    if (!archivo || archivo.size === 0) camposFaltantes.add("archivo");

    if (camposFaltantes.size > 0) {
      setCamposErrorSubida(camposFaltantes);
      setStrErrorSubida("Completa los campos obligatorios destacados.");
      return;
    }

    if (!FORMATOS_PERMITIDOS[archivo!.type]) {
      setCamposErrorSubida(new Set(["archivo"]));
      setStrErrorSubida(
        `Formato no permitido. Formatos aceptados: ${Object.values(FORMATOS_PERMITIDOS).join(", ")}.`
      );
      return;
    }

    if (archivo!.size > TAMANIO_MAXIMO_BYTES) {
      setCamposErrorSubida(new Set(["archivo"]));
      setStrErrorSubida("El archivo supera el tamaño máximo permitido de 10 MB.");
      return;
    }

    setCamposErrorSubida(new Set());
    setStrErrorSubida("");

    const bolDuplicado = documentos.some(
      (doc) =>
        doc.nombre.trim().toLowerCase() === strTitulo.toLowerCase() && doc.categoria === strCategoria
    );

    const datos: DatosPendientesSubida = { titulo: strTitulo, categoria: strCategoria, archivo: archivo! };

    if (bolDuplicado) {
      setObjPendienteDuplicado(datos);
      setStrAdvertenciaDuplicado(
        `Ya existe un documento llamado "${strTitulo}" en la categoría ${ETIQUETA_CATEGORIA[strCategoria]}. Este repositorio todavía no permite reemplazar un archivo conservando su historial — puedes subir este como un documento independiente o cancelar.`
      );
      return;
    }

    void ejecutarSubida(datos);
  }

  async function handleVer(doc: Documento) {
    try {
      setStrAccionId(doc.id);
      const { url } = await obtenerDocumento(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setStrErrorCarga(obtenerMensajeError(error, "No se pudo abrir el documento."));
    } finally {
      setStrAccionId(null);
    }
  }

  async function handleDescargar(doc: Documento) {
    try {
      setStrAccionId(doc.id);
      const { url } = await obtenerDocumento(doc.id);
      const strUrlDescarga = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(doc.nombre)}`;

      const link = document.createElement("a");
      link.href = strUrlDescarga;
      link.download = doc.nombre;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setStrErrorCarga(obtenerMensajeError(error, "No se pudo descargar el documento."));
    } finally {
      setStrAccionId(null);
    }
  }

  function abrirDialogoEliminar(doc: Documento) {
    const objValidacion = validarAccion(rol, "documentos", "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    setStrErrorEliminar("");
    setDocumentoEliminar(doc);
  }

  async function handleConfirmarEliminar() {
    if (!documentoEliminar) return;

    setBolEliminando(true);
    setStrErrorEliminar("");

    try {
      await eliminarDocumento(documentoEliminar.id);
      setDocumentoEliminar(null);
      setStrExito("Documento eliminado correctamente.");
      await cargarDocumentos();
    } catch (error) {
      setStrErrorEliminar(obtenerMensajeError(error, "Ocurrió un error al eliminar el documento."));
    } finally {
      setBolEliminando(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
          Repositorio de actas, reglamentos, contratos y cotizaciones del edificio.
        </p>

        {bolPuedeSubir && (
          <Button onClick={abrirDialogoSubir}>
            <Upload className="mr-2 h-4 w-4" />
            Subir documento
          </Button>
        )}
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}
      {strExito && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-300 mb-4 rounded-lg border border-success/20 bg-success-subtle px-3.5 py-2.5 text-[13px] text-success">
          {strExito}
        </div>
      )}

      <Card className="shadow-sm">
        <CardHeader className="gap-4 border-b border-border pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
              Documentos
            </CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={strBusqueda}
                  onChange={(event) => setStrBusqueda(event.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={filtroCategoria} onValueChange={(val: FiltroCategoria) => setFiltroCategoria(val)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas las categorías</SelectItem>
                  {CATEGORIAS_FORMULARIO.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {ETIQUETA_CATEGORIA[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={criterioOrden} onValueChange={(val: CriterioOrden) => setCriterioOrden(val)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fecha">Ordenar por fecha</SelectItem>
                  <SelectItem value="nombre">Ordenar por nombre</SelectItem>
                  <SelectItem value="categoria">Ordenar por categoría</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {bolLoading && (
            <div className="space-y-4 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!bolLoading && strErrorCarga && (
            <p className="py-8 text-center text-[13px] text-destructive">{strErrorCarga}</p>
          )}

          {!bolLoading && !strErrorCarga && documentos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-[14px] font-medium text-foreground">
                No hay documentos registrados en el repositorio.
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {bolPuedeSubir
                  ? 'Usa "Subir documento" para cargar el primero.'
                  : "Todavía no se cargó ningún documento."}
              </p>
            </div>
          )}

          {!bolLoading && !strErrorCarga && documentos.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={CLASE_HEADER_TABLA}>Nombre</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Categoría</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Tamaño</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Fecha de carga</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Subido por</TableHead>
                  <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Acciones</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {documentosVisibles.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="text-[13px] text-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {doc.nombre}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-caption text-[11px]">
                        {ETIQUETA_CATEGORIA[doc.categoria]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground tabular-nums">
                      {formatearTamanio(doc.tamanioBytes)}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {formatearFecha(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {(doc.subidoPorId && usuariosMap[doc.subidoPorId]) || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Ver detalles"
                          onClick={() => setDocumentoDetalle(doc)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Ver documento"
                          disabled={strAccionId === doc.id}
                          onClick={() => handleVer(doc)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Descargar"
                          disabled={strAccionId === doc.id}
                          onClick={() => handleDescargar(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {bolPuedeEliminar && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                            onClick={() => abrirDialogoEliminar(doc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {documentosVisibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-[13px] text-muted-foreground">
                      Ningún documento coincide con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo: subir documento */}
      <Dialog open={bolDialogoSubir} onOpenChange={(bolOpen) => !bolOpen && cerrarDialogoSubir()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Subir documento</DialogTitle>
          </DialogHeader>

          {!strAdvertenciaDuplicado ? (
            <form onSubmit={handleSubmitSubida} autoComplete="off" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="titulo" className="text-[12px] font-medium text-foreground">
                  Título
                </label>
                <input
                  id="titulo"
                  name="titulo"
                  autoComplete="off"
                  onChange={() =>
                    setCamposErrorSubida((prev) => {
                      const next = new Set(prev);
                      next.delete("titulo");
                      return next;
                    })
                  }
                  className={claseCampo(camposErrorSubida.has("titulo"))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="categoria" className="text-[12px] font-medium text-foreground">
                  Categoría
                </label>
                <select
                  id="categoria"
                  name="categoria"
                  defaultValue=""
                  onChange={() =>
                    setCamposErrorSubida((prev) => {
                      const next = new Set(prev);
                      next.delete("categoria");
                      return next;
                    })
                  }
                  className={claseCampo(camposErrorSubida.has("categoria"))}
                >
                  <option value="" disabled>
                    Selecciona una categoría...
                  </option>
                  {CATEGORIAS_FORMULARIO.map((cat) => (
                    <option key={cat} value={cat}>
                      {ETIQUETA_CATEGORIA[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="archivo" className="text-[12px] font-medium text-foreground">
                  Archivo <span className="text-muted-foreground">(PDF, DOCX, JPG o PNG · máx. 10 MB)</span>
                </label>
                <input
                  id="archivo"
                  name="archivo"
                  type="file"
                  accept=".pdf,.docx,image/jpeg,image/png"
                  onChange={() =>
                    setCamposErrorSubida((prev) => {
                      const next = new Set(prev);
                      next.delete("archivo");
                      return next;
                    })
                  }
                  className={claseCampo(camposErrorSubida.has("archivo"))}
                />
              </div>

              {strErrorSubida && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorSubida}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrarDialogoSubir} disabled={bolSubiendo}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={bolSubiendo}>
                  {bolSubiendo ? "Subiendo..." : "Subir"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                {strAdvertenciaDuplicado}
              </p>

              {strErrorSubida && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorSubida}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrarDialogoSubir} disabled={bolSubiendo}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => objPendienteDuplicado && void ejecutarSubida(objPendienteDuplicado)}
                  disabled={bolSubiendo}
                >
                  {bolSubiendo ? "Subiendo..." : "Subir de todas formas"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: detalles */}
      <Dialog open={documentoDetalle !== null} onOpenChange={(bolOpen) => !bolOpen && setDocumentoDetalle(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Detalles del documento</DialogTitle>
          </DialogHeader>

          {documentoDetalle && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className={CLASE_LABEL_CAMPO}>Nombre</p>
                <p className="mt-1 text-[15px] font-semibold text-foreground">{documentoDetalle.nombre}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Categoría</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {ETIQUETA_CATEGORIA[documentoDetalle.categoria]}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Tamaño</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {formatearTamanio(documentoDetalle.tamanioBytes)}
                  </p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha de carga</p>
                  <p className="mt-1 text-[13px] text-foreground">{formatearFecha(documentoDetalle.createdAt)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Subido por</p>
                  <p className="mt-1 text-[13px] text-foreground">
                    {(documentoDetalle.subidoPorId && usuariosMap[documentoDetalle.subidoPorId]) || "—"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDocumentoDetalle(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: eliminar */}
      <Dialog open={documentoEliminar !== null} onOpenChange={(bolOpen) => !bolOpen && setDocumentoEliminar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Eliminar documento</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {documentoEliminar &&
                `¿Confirmas eliminar "${documentoEliminar.nombre}"? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>

          {strErrorEliminar && (
            <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              {strErrorEliminar}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentoEliminar(null)} disabled={bolEliminando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmarEliminar} disabled={bolEliminando}>
              {bolEliminando ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
