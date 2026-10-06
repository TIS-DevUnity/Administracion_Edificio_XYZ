"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarRange,
  ClipboardList,
  FileText,
  ShieldAlert,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeAcceder } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/lib/api";
import { Inmueble, listarInmuebles } from "@/lib/inmuebles";
import { Copropietario, listarCopropietarios } from "@/lib/copropietarios";
import { Documento, ETIQUETA_CATEGORIA, listarDocumentos } from "@/lib/documentos";
import { financeService } from "@/services/finance.service";
import { ExpensaDTO } from "@/types/finance";
import { RegistroAuditoria, etiquetaAccion, etiquetaEntidad, listarAuditoria } from "@/lib/auditoria";

const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_VALOR_KPI =
  "font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";
const CLASE_TITULO_CARD =
  "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";

const MAX_FILAS_PREVIA = 4;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(amount);
}

function formatearFechaCorta(strFechaISO: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(strFechaISO)
  );
}

interface UsuarioResumen {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
  activo: boolean;
}

interface ResumenDatos {
  inmuebles: Inmueble[];
  inmueblesTotal: number;
  inmueblesActivos: number;
  copropietarios: Copropietario[];
  copropietariosTotal: number;
  documentos: Documento[];
  documentosTotal: number;
  deudaPendiente: number;
  expensasVencidas: ExpensaDTO[];
  expensasVencidasTotal: number;
  usuarios: UsuarioResumen[] | null;
  usuariosTotal: number | null;
  usuariosActivos: number | null;
  auditoria: RegistroAuditoria[] | null;
  auditoriaTotal: number | null;
}

// Secciones sin backend real todavía (siguen siendo el mock de GestorSeccion):
// se listan como acceso rápido, sin inventar una cifra que no existe.
const ACCESOS_RAPIDOS: { label: string; href: string; icon: typeof Wrench }[] = [
  { label: "Pagos", href: "/admin/pagos", icon: Wallet },
  { label: "Edificios", href: "/admin/edificios", icon: Building2 },
  { label: "Mantenimiento", href: "/admin/mantenimiento", icon: Wrench },
  { label: "Configurar roles", href: "/admin/roles", icon: UserCog },
];

function TarjetaKpi({
  titulo,
  valor,
  detalle,
  icono: Icono,
  claseValor = "text-foreground",
}: {
  titulo: string;
  valor: string;
  detalle: string;
  icono: typeof Building2;
  claseValor?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={CLASE_LABEL_CAMPO}>{titulo}</p>
            <h3 className={`${CLASE_VALOR_KPI} ${claseValor}`}>{valor}</h3>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icono className="h-5 w-5" />
          </div>
        </div>
        <p className="font-caption mt-2 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
          {detalle}
        </p>
      </CardContent>
    </Card>
  );
}

function FilaPrevia({
  titulo,
  subtitulo,
  extra,
}: {
  titulo: string;
  subtitulo?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{titulo}</p>
        {subtitulo && <p className="truncate text-[12px] text-muted-foreground">{subtitulo}</p>}
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

function TarjetaSeccion({
  titulo,
  resumen,
  href,
  icono: Icono,
  children,
}: {
  titulo: string;
  resumen: string;
  href: string;
  icono: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col shadow-sm">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icono className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className={CLASE_TITULO_CARD}>{titulo}</h3>
            <p className="truncate text-[12px] text-muted-foreground">{resumen}</p>
          </div>
        </div>

        <div className="mt-3 flex-1">{children}</div>

        <Link href={href} className="mt-4">
          <Button variant="outline" className="w-full">
            Ver más
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function AdminPanelPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const bolVerDocumentos = puedeAcceder(rol, "documentos");
  const bolVerUsuarios = puedeAcceder(rol, "usuarios");
  const bolVerAuditoria = puedeAcceder(rol, "auditoria");

  const [resumen, setResumen] = useState<ResumenDatos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [strError, setStrError] = useState("");

  useEffect(() => {
    async function cargarDatos() {
      setIsLoading(true);
      setStrError("");

      try {
        const [inmuebles, copropietarios, expensas, documentos, usuariosResp, auditoriaResp] = await Promise.all([
          listarInmuebles(),
          listarCopropietarios(),
          financeService.getExpensas(),
          bolVerDocumentos ? listarDocumentos() : Promise.resolve<Documento[]>([]),
          bolVerUsuarios
            ? api.get<{ usuarios: UsuarioResumen[] }>("/usuarios")
            : Promise.resolve(null),
          bolVerAuditoria ? listarAuditoria({ pagina: 1 }) : Promise.resolve(null),
        ]);

        const deudaPendiente = expensas.reduce((acc, exp) => {
          if (exp.estado === "PAGADA") return acc;
          const total = Number(exp.montoTotal) + Number(exp.montoMora || 0);
          const pagado = (exp.pagos ?? []).reduce((a, p) => a + Number(p.monto), 0);
          return acc + Math.max(total - pagado, 0);
        }, 0);

        const vencidas = expensas.filter((e) => e.estado === "VENCIDA");
        const usuariosTodos = usuariosResp?.data.usuarios ?? null;

        setResumen({
          inmuebles: inmuebles.slice(0, MAX_FILAS_PREVIA),
          inmueblesTotal: inmuebles.length,
          inmueblesActivos: inmuebles.filter((i) => i.activo).length,
          copropietarios: copropietarios.slice(0, MAX_FILAS_PREVIA),
          copropietariosTotal: copropietarios.length,
          documentos: documentos.slice(0, MAX_FILAS_PREVIA),
          documentosTotal: documentos.length,
          deudaPendiente,
          expensasVencidas: vencidas.slice(0, MAX_FILAS_PREVIA),
          expensasVencidasTotal: vencidas.length,
          usuarios: usuariosTodos ? usuariosTodos.slice(0, MAX_FILAS_PREVIA) : null,
          usuariosTotal: usuariosTodos ? usuariosTodos.length : null,
          usuariosActivos: usuariosTodos ? usuariosTodos.filter((u) => u.activo).length : null,
          auditoria: auditoriaResp ? auditoriaResp.registros.slice(0, MAX_FILAS_PREVIA) : null,
          auditoriaTotal: auditoriaResp ? auditoriaResp.paginacion.total : null,
        });
      } catch (error) {
        console.error("Error al cargar el panel principal:", error);
        setStrError("No se pudo cargar el resumen del sistema. Intenta de nuevo en unos minutos.");
      } finally {
        setIsLoading(false);
      }
    }

    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 py-6 sm:px-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Resumen general de la operación del sistema.
      </p>

      {strError && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-destructive">
          {strError}
        </div>
      )}

      {isLoading || !resumen ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[108px] w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaKpi
              titulo="Inmuebles activos"
              valor={`${resumen.inmueblesActivos} / ${resumen.inmueblesTotal}`}
              detalle="Unidades activas sobre el total registrado"
              icono={Building2}
            />
            <TarjetaKpi
              titulo="Deuda pendiente"
              valor={formatCurrency(resumen.deudaPendiente)}
              detalle="Suma de expensas no pagadas (capital + mora)"
              icono={CalendarRange}
              claseValor={resumen.deudaPendiente > 0 ? "text-destructive" : "text-success"}
            />
            <TarjetaKpi
              titulo="Expensas vencidas"
              valor={String(resumen.expensasVencidasTotal)}
              detalle="Con recargo por mora ya aplicado"
              icono={ShieldAlert}
              claseValor={resumen.expensasVencidasTotal > 0 ? "text-destructive" : "text-success"}
            />
            <TarjetaKpi
              titulo="Copropietarios registrados"
              valor={String(resumen.copropietariosTotal)}
              detalle="Propietarios e inquilinos en el sistema"
              icono={Users}
            />
          </div>

          {/* Previsualización de secciones */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className={CLASE_TITULO_CARD}>Secciones</h2>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <TarjetaSeccion
              titulo="Inmuebles"
              resumen={`${resumen.inmueblesActivos} activos de ${resumen.inmueblesTotal} registrados`}
              href="/admin/inmuebles"
              icono={Building2}
            >
              {resumen.inmuebles.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No hay inmuebles registrados.</p>
              ) : (
                resumen.inmuebles.map((inmueble) => (
                  <FilaPrevia
                    key={inmueble.id}
                    titulo={inmueble.codigo}
                    subtitulo={inmueble.tipoInmueble.nombre}
                    extra={
                      <Badge
                        className={`font-caption text-[10px] ${
                          inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
                        }`}
                      >
                        {inmueble.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    }
                  />
                ))
              )}
            </TarjetaSeccion>

            <TarjetaSeccion
              titulo="Copropietarios"
              resumen={`${resumen.copropietariosTotal} registrados en el sistema`}
              href="/admin/copropietarios"
              icono={Users}
            >
              {resumen.copropietarios.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No hay copropietarios registrados.</p>
              ) : (
                resumen.copropietarios.map((cop) => (
                  <FilaPrevia key={cop.id} titulo={`${cop.nombre} ${cop.apellido}`} subtitulo={`CI ${cop.ci}`} />
                ))
              )}
            </TarjetaSeccion>

            <TarjetaSeccion
              titulo="Morosidad y Expensas"
              resumen={`Deuda pendiente: ${formatCurrency(resumen.deudaPendiente)}`}
              href="/admin/morosidad"
              icono={CalendarRange}
            >
              {resumen.expensasVencidasTotal === 0 ? (
                <p className="text-[12px] text-success">Sin expensas vencidas.</p>
              ) : (
                resumen.expensasVencidas.map((exp) => (
                  <FilaPrevia
                    key={exp.id}
                    titulo={`${exp.inmueble.codigo} · ${exp.periodo}`}
                    subtitulo="Vencida"
                    extra={
                      <span className="text-[12px] font-semibold text-destructive">
                        {formatCurrency(Number(exp.montoTotal) + Number(exp.montoMora || 0))}
                      </span>
                    }
                  />
                ))
              )}
            </TarjetaSeccion>

            {bolVerDocumentos && (
              <TarjetaSeccion
                titulo="Gestión documental"
                resumen={`${resumen.documentosTotal} documento${resumen.documentosTotal === 1 ? "" : "s"} en el repositorio`}
                href="/admin/documentos"
                icono={FileText}
              >
                {resumen.documentos.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No hay documentos cargados.</p>
                ) : (
                  resumen.documentos.map((doc) => (
                    <FilaPrevia
                      key={doc.id}
                      titulo={doc.nombre}
                      subtitulo={`${ETIQUETA_CATEGORIA[doc.categoria]} · ${formatearFechaCorta(doc.createdAt)}`}
                    />
                  ))
                )}
              </TarjetaSeccion>
            )}

            {bolVerUsuarios && resumen.usuarios !== null && (
              <TarjetaSeccion
                titulo="Usuarios"
                resumen={`${resumen.usuariosActivos} activos de ${resumen.usuariosTotal} con acceso`}
                href="/admin/usuarios"
                icono={UserCog}
              >
                {resumen.usuarios.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No hay usuarios registrados.</p>
                ) : (
                  resumen.usuarios.map((u) => (
                    <FilaPrevia
                      key={u.id}
                      titulo={`${u.nombre} ${u.apellido}`}
                      subtitulo={u.rol}
                      extra={
                        <Badge
                          className={`font-caption text-[10px] ${
                            u.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
                          }`}
                        >
                          {u.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      }
                    />
                  ))
                )}
              </TarjetaSeccion>
            )}

            {bolVerAuditoria && resumen.auditoria !== null && (
              <TarjetaSeccion
                titulo="Bitácora de Auditoría"
                resumen={`${resumen.auditoriaTotal} eventos registrados`}
                href="/admin/auditoria"
                icono={ClipboardList}
              >
                {resumen.auditoria.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No hay eventos registrados.</p>
                ) : (
                  resumen.auditoria.map((evento) => (
                    <FilaPrevia
                      key={evento.id}
                      titulo={`${etiquetaAccion(evento.accion)} · ${etiquetaEntidad(evento.entidad)}`}
                      subtitulo={evento.usuario ? `${evento.usuario.nombre} ${evento.usuario.apellido}` : "Sistema"}
                      extra={
                        <span className="text-[11px] text-muted-foreground">
                          {formatearFechaCorta(evento.createdAt)}
                        </span>
                      }
                    />
                  ))
                )}
              </TarjetaSeccion>
            )}
          </div>

          {/* Accesos rápidos a secciones sin estadísticas todavía */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className={CLASE_TITULO_CARD}>Accesos rápidos</h2>
            <Badge variant="outline" className="font-caption border-dashed text-[10px] text-muted-foreground">
              Sin estadísticas por ahora
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ACCESOS_RAPIDOS.filter((acceso) => {
              if (acceso.href === "/admin/roles") return puedeAcceder(rol, "roles");
              if (acceso.href === "/admin/pagos") return puedeAcceder(rol, "pagos");
              if (acceso.href === "/admin/edificios") return puedeAcceder(rol, "edificios");
              if (acceso.href === "/admin/mantenimiento") return puedeAcceder(rol, "mantenimiento");
              return true;
            }).map((acceso) => (
              <Link
                key={acceso.href}
                href={acceso.href}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <acceso.icon className="h-4.5 w-4.5" />
                </div>
                <span className="text-[13px] font-medium text-foreground">{acceso.label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
