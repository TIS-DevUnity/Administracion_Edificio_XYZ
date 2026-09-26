"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Eye, Users, AlertCircle } from "lucide-react";

import { api } from "@/lib/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Información pública de un copropietario
 */
interface Copropietario {
  id: string;
  nombre: string;
  apellido: string;
  ci: string;
  email?: string | null;
  telefono?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Respuesta del endpoint GET /api/copropietarios
 */
interface CopropietariosResponse {
  copropietarios: Copropietario[];
}

const CLASE_HEADER_TABLA =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO =
  "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

export default function CopropietariosPage() {
  const [arrCopropietarios, setArrCopropietarios] = useState<
    Copropietario[]
  >([]);

  const [strSearch, setStrSearch] = useState("");
  const [bolLoading, setBolLoading] = useState(true);
  const [strError, setStrError] = useState("");

  const [objCopropietarioSeleccionado, setObjCopropietarioSeleccionado] =
    useState<Copropietario | null>(null);

  const [bolDialogOpen, setBolDialogOpen] = useState(false);

  /**
   * Obtiene la lista de copropietarios desde el backend.
   */
  async function cargarCopropietarios() {
    try {
      setBolLoading(true);
      setStrError("");

      const response = await api.get<CopropietariosResponse>(
        "/copropietarios"
      );

      setArrCopropietarios(response.data.copropietarios);
    } catch (error) {
      console.error("Error al cargar copropietarios:", error);

      setStrError(
        "No se pudo cargar la lista de copropietarios."
      );
    } finally {
      setBolLoading(false);
    }
  }

  /**
   * Carga inicial.
   */
    useEffect(() => {
     // La carga inicial consulta la API y actualiza el estado de la página.
     // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarCopropietarios();

    const strQuery = new URLSearchParams(window.location.search).get("q");
    if (strQuery) setStrSearch(strQuery);
    }, []);
  /**
   * Filtra la lista por nombre, apellido o CI.
   */
  const arrCopropietariosFiltrados = useMemo(() => {
    const strSearchNormalizado = strSearch
      .trim()
      .toLowerCase();

    if (!strSearchNormalizado) {
      return arrCopropietarios;
    }

    return arrCopropietarios.filter((objCopropietario) => {
      const strNombreCompleto =
        `${objCopropietario.nombre} ${objCopropietario.apellido}`
          .toLowerCase();

      const strCi = objCopropietario.ci.toLowerCase();

      return (
        strNombreCompleto.includes(strSearchNormalizado) ||
        strCi.includes(strSearchNormalizado)
      );
    });
  }, [arrCopropietarios, strSearch]);

  /**
   * Abre el detalle de un copropietario.
   */
  function handleVerCopropietario(
    objCopropietario: Copropietario
  ) {
    setObjCopropietarioSeleccionado(objCopropietario);
    setBolDialogOpen(true);
  }

  /**
   * Formatea una fecha proveniente del backend.
   */
  function formatFecha(strFecha?: string) {
    if (!strFecha) {
      return "—";
    }

    const objFecha = new Date(strFecha);

    if (Number.isNaN(objFecha.getTime())) {
      return "—";
    }

    return objFecha.toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="px-6 py-6">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>

          <p className="max-w-md text-[13px] leading-[1.45] text-muted-foreground">
            Consulta y visualización de copropietarios registrados.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={cargarCopropietarios}
          disabled={bolLoading}
          className="w-full md:w-auto"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${
              bolLoading ? "animate-spin" : ""
            }`}
          />

          Actualizar
        </Button>
      </div>

      {/* Tarjeta principal */}
      <Card className="shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
                Lista de copropietarios
              </CardTitle>

              {!bolLoading && !strError && (
                <p className="font-caption mt-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  {arrCopropietariosFiltrados.length}{" "}
                  {arrCopropietariosFiltrados.length === 1
                    ? "resultado"
                    : "resultados"}
                </p>
              )}
            </div>

            <div className="relative w-full md:w-[360px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={strSearch}
                onChange={(event) =>
                  setStrSearch(event.target.value)
                }
                placeholder="Buscar por nombre, apellido o CI..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Estado de carga */}
          {bolLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4"
                >
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          )}

          {/* Estado de error */}
          {!bolLoading && strError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>

              <h3 className="text-[14px] font-medium text-foreground">
                No se pudo cargar la información
              </h3>

              <p className="mt-1 text-[13px] text-muted-foreground">
                {strError}
              </p>

              <Button
                variant="outline"
                className="mt-4"
                onClick={cargarCopropietarios}
              >
                Intentar nuevamente
              </Button>
            </div>
          )}

          {/* Sin resultados */}
          {!bolLoading &&
            !strError &&
            arrCopropietariosFiltrados.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>

                <h3 className="text-[14px] font-medium text-foreground">
                  No se encontraron copropietarios
                </h3>

                <p className="mt-1 text-[13px] text-muted-foreground">
                  {strSearch
                    ? "Prueba con otro nombre, apellido o CI."
                    : "Todavía no existen copropietarios registrados."}
                </p>
              </div>
            )}

          {/* Tabla */}
          {!bolLoading &&
            !strError &&
            arrCopropietariosFiltrados.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Copropietario</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>CI</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Correo</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Teléfono</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Registrado</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>
                        Acción
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {arrCopropietariosFiltrados.map(
                      (objCopropietario) => (
                        <TableRow key={objCopropietario.id}>
                          <TableCell>
                            <div>
                              <p className="text-[13px] font-medium text-foreground">
                                {objCopropietario.nombre}{" "}
                                {objCopropietario.apellido}
                              </p>

                              <Badge
                                variant="secondary"
                                className="font-caption mt-1 text-[11px]"
                              >
                                Copropietario
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="text-[13px] font-medium text-foreground tabular-nums">
                            {objCopropietario.ci}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {objCopropietario.email || "—"}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground tabular-nums">
                            {objCopropietario.telefono || "—"}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground">
                            {formatFecha(objCopropietario.createdAt)}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleVerCopropietario(
                                  objCopropietario
                                )
                              }
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Dialog de detalle */}
      <Dialog
        open={bolDialogOpen}
        onOpenChange={setBolDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>
              Información del copropietario
            </DialogTitle>
          </DialogHeader>

          {objCopropietarioSeleccionado && (
            <div className="space-y-5">
              <div className="rounded-lg bg-muted/30 p-4">
                <p className={CLASE_LABEL_CAMPO}>
                  Nombre completo
                </p>

                <p className="mt-1 text-[16px] font-semibold text-foreground">
                  {objCopropietarioSeleccionado.nombre}{" "}
                  {objCopropietarioSeleccionado.apellido}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>
                    CI
                  </p>

                  <p className="mt-1 text-[13px] text-foreground">
                    {objCopropietarioSeleccionado.ci}
                  </p>
                </div>

                <div>
                  <p className={CLASE_LABEL_CAMPO}>
                    Teléfono
                  </p>

                  <p className="mt-1 text-[13px] text-foreground">
                    {objCopropietarioSeleccionado.telefono ||
                      "No registrado"}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <p className={CLASE_LABEL_CAMPO}>
                    Correo electrónico
                  </p>

                  <p className="mt-1 break-all text-[13px] text-foreground">
                    {objCopropietarioSeleccionado.email ||
                      "No registrado"}
                  </p>
                </div>

                <div>
                  <p className={CLASE_LABEL_CAMPO}>
                    Fecha de registro
                  </p>

                  <p className="mt-1 text-[13px] text-foreground">
                    {formatFecha(
                      objCopropietarioSeleccionado.createdAt
                    )}
                  </p>
                </div>

              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setBolDialogOpen(false)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
