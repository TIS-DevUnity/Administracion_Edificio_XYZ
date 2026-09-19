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
    <div className="min-h-screen space-y-6 p-6 text-white">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
              <Users className="h-5 w-5 text-primary-600" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-white">
                Copropietarios
              </h1>

              <p className="text-sm text-gray-400">
                Consulta y visualización de copropietarios registrados
              </p>
            </div>
          </div>
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
      <Card className="border-neutral-200 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg text-white">
                Lista de copropietarios
              </CardTitle>

              {!bolLoading && !strError && (
                <p className="mt-1 text-sm text-gray-400">
                  {arrCopropietariosFiltrados.length}{" "}
                  {arrCopropietariosFiltrados.length === 1
                    ? "resultado"
                    : "resultados"}
                </p>
              )}
            </div>

            <div className="relative w-full md:w-[360px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />

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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>

              <h3 className="font-medium text-neutral-900">
                No se pudo cargar la información
              </h3>

              <p className="mt-1 text-sm text-neutral-500">
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
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                  <Users className="h-6 w-6 text-neutral-400" />
                </div>

                <h3 className="font-medium text-neutral-900">
                  No se encontraron copropietarios
                </h3>

                <p className="mt-1 text-sm text-neutral-500">
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
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Copropietario</TableHead>
                      <TableHead>CI</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Registrado</TableHead>
                      <TableHead className="text-right">
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
                              <p className="font-medium text-white">
                                {objCopropietario.nombre}{" "}
                                {objCopropietario.apellido}
                              </p>

                              <Badge
                                variant="secondary"
                                className="mt-1 text-xs"
                              >
                                Copropietario
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="font-medium text-gray-200">
                            {objCopropietario.ci}
                          </TableCell>

                          <TableCell className="text-gray-300">
                            {objCopropietario.email || "—"}
                          </TableCell>

                          <TableCell className="text-gray-300">
                            {objCopropietario.telefono || "—"}
                          </TableCell>

                          <TableCell className="text-gray-300">
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
            <DialogTitle>
              Información del copropietario
            </DialogTitle>
          </DialogHeader>

          {objCopropietarioSeleccionado && (
            <div className="space-y-5">
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Nombre completo
                </p>

                <p className="mt-1 text-lg font-semibold text-neutral-900">
                  {objCopropietarioSeleccionado.nombre}{" "}
                  {objCopropietarioSeleccionado.apellido}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    CI
                  </p>

                  <p className="mt-1 text-sm text-gray-200">
                    {objCopropietarioSeleccionado.ci}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Teléfono
                  </p>

                  <p className="mt-1 text-sm text-gray-200">
                    {objCopropietarioSeleccionado.telefono ||
                      "No registrado"}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-neutral-500">
                    Correo electrónico
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-200">
                    {objCopropietarioSeleccionado.email ||
                      "No registrado"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Fecha de registro
                  </p>

                  <p className="mt-1 text-sm text-gray-200">
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