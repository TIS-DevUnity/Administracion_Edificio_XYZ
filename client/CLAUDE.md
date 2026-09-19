@AGENTS.md

## Tipografía — regla del proyecto

Familia oficial: **TT Interphases Pro**, autoalojada vía `next/font/local` en
[src/app/fonts.ts](src/app/fonts.ts) (archivos `.ttf` en `src/app/fonts/`). No usar otras
familias tipográficas ni pesos fuera de esta jerarquía sin actualizar ese archivo primero.

`--font-sans` (el default del body en todo el proyecto) apunta a Texto General.

| Token Tailwind | Archivo fuente | Peso | Tamaño | Line-height | Tracking | Uso |
|---|---|---|---|---|---|---|
| `font-title` | Black / Black Italic | 700 | 18-28px | 120% | -1.5% | H1 de vista activa, modales críticos, cifras de tarjetas KPI, Hero |
| `font-subtitle` | Mono Bold / Mono Italic | 600 (o 500) | 14-16px | 130% | -0.5% | Encabezados de tarjetas/widgets, agrupadores de formularios, tabs activos |
| `font-body` (= `font-sans`) | Light / Light Italic | 400 | 13-14px | 140-150% | 0% | Tablas, inputs, botones, párrafos, navegación — estilo por defecto |
| `font-caption` | Thin / Thin Italic | 500\* (o 300) | 11-12px | 130% | +1% | Headers de tabla, timestamps, texto de ayuda, badges, footer |

**Regla: `font-subtitle` siempre se ve en MAYÚSCULAS**, sin importar cómo esté escrito el
texto en el código (`text-transform: uppercase` forzado en la propia utilidad, ver
`globals.css`). No usar la clase `lowercase` ni `capitalize` para revertir esto.

**Regla de legibilidad — `font-caption`:** el corte "Thin" tiene trazos muy delgados que se
vuelven difíciles de leer en 11-12px. Por eso la utilidad fuerza `font-weight: 500`\* (el
navegador aplica negrita sintética sobre el Thin) en vez del 400 original, y `text-muted-foreground`
se ajustó de Zinc 500 a **Zinc 600** (ver tabla de colores) para subir el contraste de
~4.8:1 a ~7.7:1. No usar `font-thin`/`font-normal` para revertir el peso de `font-caption`.

Regla: solo debe existir un H1 (`font-title`) visible por pantalla.

## Colores — regla del proyecto

Sistema de color oficial, definido en [src/app/globals.css](src/app/globals.css) como variables
shadcn (`:root` / `.dark`) y tokens extra en `@theme inline`. No usar valores hexadecimales
sueltos en componentes: siempre a través de estas clases de Tailwind.

**El sistema entero se ve en modo oscuro por defecto.** La clase `dark` está fija en `<html>`
([layout.tsx](src/app/layout.tsx)) — no hay toggle claro/oscuro todavía. `:root` conserva la
paleta clara original como base/fallback para si en el futuro se agrega un selector de tema.

| Clase Tailwind | Uso | Modo claro (`:root`) | Modo oscuro (`.dark`, activo) |
|---|---|---|---|
| `bg-background` | Fondo general (canvas) | Zinc 100 `#F4F4F5` | Zinc 950 `#09090B` |
| `bg-sidebar` | Panel de navegación lateral | Zinc 900 `#18181B` | Zinc 950 `#09090B` |
| `bg-card` | Tarjetas, gráficos, celdas de tabla | White `#FFFFFF` | Zinc 900 `#18181B` (un escalón más claro que el canvas → elevación) |
| `border-border` / `border-sidebar-border` | Bordes, divisores | Zinc 200 `#E4E4E7` | Zinc 800 `#27272A` |
| `text-foreground` | Títulos, datos clave, cifras KPI | Zinc 950 `#09090B` | Zinc 50 `#FAFAFA` |
| `text-muted-foreground` | Subtítulos, labels, headers de columna | Zinc 600 `#52525B` | Zinc 300 `#D4D4D8` |
| `bg-primary` / `text-primary` / `bg-sidebar-primary` | Botones primarios, píldora del menú activo | Teal 600 `#0D9488` | Teal 600 `#0D9488` (sin cambio) |
| `text-accent-secondary` / `bg-accent-secondary` | Acento para métricas de conteo (ej. total de copropietarios) | Indigo 600 `#4F46E5` | Indigo 600 `#4F46E5` (sin cambio) |
| `text-success` + `bg-success-subtle` | Montos positivos, alzas, badge "Completado" | Emerald 600 `#059669` + Emerald 100 `#D1FAE5` | Emerald 600 `#059669` (sin cambio) + Emerald 600 al 18% de opacidad |
| `text-destructive` + `bg-danger-subtle` | Gastos, morosidad, alertas | Rose 600 `#E11D48` + Rose 100 `#FFE4E6` | **Rose 500** `#F43F5E`\*\* + Rose 500 al 18% de opacidad |

Regla: no introducir colores fuera de esta paleta sin actualizar primero esta tabla y `globals.css`.

\* Ajustado sobre el valor original (Zinc 500 `#71717A`) por un problema de legibilidad: el
corte Thin de la tipografía combinado con Zinc 500 en 11-12px daba un contraste de apenas
~4.8:1 (mínimo AA), difícil de leer. Zinc 600/Zinc 300 mantienen ~7-12:1 en ambos modos.

\*\* Rose 600 sobre el canvas oscuro (Zinc 950) da solo ~4.2:1 de contraste como texto — por
debajo del mínimo AA (4.5:1). Se usa Rose 500 en `.dark` para subir a ~5.4:1. Los badges
"sutiles" (`*-subtle`) usan el color saturado en baja opacidad en vez del pastel claro, que se
vería fuera de lugar sobre fondos oscuros.

## Pantallas de acceso

Además de `/login` y `/admin`, existen estas pantallas de referencia visual (sin backend real
detrás — ver comentario en cada archivo):

- `/recuperar-password` — solicitar enlace de recuperación (pantalla intermedia con estado "revisa tu correo")
- `/restablecer-password` — pantalla a la que llegaría el enlace del correo, para definir nueva contraseña
- `/verificacion-2fa` — verificación en dos pasos (6 dígitos, con auto-avance de foco)
- `/seleccionar-perfil` — selector Multi-Tenant/Multi-Rol para cuentas con más de un perfil (ej. Administrador de un condominio + Copropietario de otro)

**Aviso:** el backend (`schema.prisma`) todavía no modela múltiples condominios ni roles
múltiples por usuario (`Usuario.rol` es un único enum) — `/seleccionar-perfil` es solo la
referencia visual de cómo se vería esa pantalla cuando ese modelo de datos exista. De estas 4
pantallas, solo `/recuperar-password` está enlazada desde el login real (link "¿Olvidaste tu
contraseña?"). `/verificacion-2fa` y `/seleccionar-perfil` quedaron deshabilitadas del flujo real
a propósito: aún no hay backend/API de 2FA, así que un login correcto va directo a `/admin`. Se
llega a las 4 por navegación manual para revisión de diseño.

## Control de acceso por rol (RBAC) — solo frontend

Implementado en [src/lib/permissions.ts](src/lib/permissions.ts) (matriz de permisos) y
[src/lib/session.ts](src/lib/session.ts) (lectura reactiva de la sesión). El guard central vive en
[src/app/admin/layout.tsx](src/app/admin/layout.tsx): redirige a `/login` si no hay sesión, calcula
la sección actual a partir de la URL y bloquea con una pantalla de "Acceso denegado"
([src/components/AccesoDenegado.tsx](src/components/AccesoDenegado.tsx)) si el rol no tiene acceso
a esa sección — cubre también el acceso por URL directa.

El backend no tiene ningún modelo de permisos/roles (no existe `Permiso` ni `RolPermiso` en
`schema.prisma`), así que la matriz de `permissions.ts` es hoy la única fuente de verdad. Está
alineada con la única regla de autorización que sí existe en el backend
(`server/src/middlewares/rbac.middleware.js`, módulo de usuarios): `GET /api/usuarios` permite
ADMINISTRADOR y DIRECTORIO; `POST`/`PUT`/`PATCH` solo ADMINISTRADOR.

| Sección | Ruta | Administrador | Directorio | Consulta |
|---|---|---|---|---|
| Panel principal | `/admin` | Ver | Ver | Ver |
| Edificios | `/admin/edificios` | Ver, crear, editar, eliminar | Ver, crear, editar | Ver |
| Residentes | `/admin/residentes` | Ver, crear, editar, eliminar | Ver, crear, editar | Ver |
| Pagos | `/admin/pagos` | Ver, crear, editar, eliminar | Ver, crear, editar | Ver |
| Mantenimiento | `/admin/mantenimiento` | Ver, crear, editar, eliminar | Ver, crear, editar | Ver |
| Usuarios | `/admin/usuarios` | Ver, crear, editar, dar de baja | Ver | Sin acceso |
| Configurar roles | `/admin/roles` | Ver, editar | Sin acceso | Sin acceso |

Solo `/admin/usuarios` llama a una API real (`GET/POST/PUT/PATCH /api/usuarios`); el resto
(edificios, residentes, pagos, mantenimiento) son pantallas de referencia con datos en memoria
porque esos módulos del backend todavía son carpetas `.gitkeep` sin controlador. `/admin/roles`
es de solo lectura por el mismo motivo: no hay dónde persistir cambios a la matriz.

Reglas para cualquier botón de crear/editar/eliminar nuevo:

- **Ocultar, no solo deshabilitar**, si `puedeEjecutar(rol, seccion, accion)` es `false`.
- Antes de ejecutar la acción (aunque el botón esté oculto), volver a llamar a `validarAccion(...)`
  y, si la rechaza, mostrar el mensaje exacto con `<AlertaPermiso>`:
  *"Permiso insuficiente: Su perfil solo permite lectura de información."* — no ejecutar la
  operación ni modificar el estado/datos.
- No existe un mecanismo de "cambiar de rol en la misma sesión": los permisos se recalculan en
  cada render a partir de lo que haya en `localStorage`, así que un cambio de rol real requiere
  volver a iniciar sesión.

## HU1 — Registro de inmuebles y asignación de residentes

Implementado en [src/app/admin/inmuebles/page.tsx](src/app/admin/inmuebles/page.tsx) (alta de
departamento + piso + parqueo/baulera opcionales) y
[src/app/admin/residentes/page.tsx](src/app/admin/residentes/page.tsx) (asignar Propietario/
Inquilino a un inmueble activo). Toda la lógica de negocio (duplicados, campos obligatorios,
formato de correo/teléfono) vive en
[src/lib/inmueblesStore.ts](src/lib/inmueblesStore.ts).

**Sin backend real todavía:** el modelo de datos (`Copropietario`, `Inmueble`, `OcupanteInmueble`)
ya está migrado en `schema.prisma`, pero el módulo `server/src/modules/operativo-seguridad/
copropietarios/` sigue siendo un `.gitkeep` sin rutas montadas (confirmado incluso después del
merge a `main` del 2026-09-19; el README del backend lo marca "pendiente, semana 21-sept"). Por
eso `inmueblesStore.ts` guarda todo en `localStorage` en vez de llamar a `api`. Cuando exista el
endpoint real, solo hace falta cambiar las funciones de ese archivo — las pantallas no deberían
necesitar tocarse.

**Diferencia de modelado a resolver con backend:** la HU registra departamento + piso + parqueo +
baulera en un solo formulario/confirmación ("Inmueble registrado con éxito"), pero el schema real
modela cada uno como una fila `Inmueble` independiente (`tipo`: `DEPARTAMENTO` / `PARQUEO` /
`BAULERA`). Este store los agrupa en un solo registro tal como pide la HU; falta decidir con
backend si al conectar la API real se manda como 1 alta o hasta 3.

## HU2 — Historial de ocupantes por inmueble

Implementado en [src/app/admin/inmuebles/\[id\]/page.tsx](src/app/admin/inmuebles/%5Bid%5D/page.tsx)
— ficha del inmueble con pestañas "Datos generales" / "Historial de Ocupantes" (línea de tiempo,
más reciente primero, estado vacío exacto, badge "Actual" para el ocupante vigente).

La regla de negocio ("al asignar un nuevo ocupante, cerrar automáticamente al anterior con la
fecha del día") vive en `registrarAsignacion` de
[src/lib/inmueblesStore.ts](src/lib/inmueblesStore.ts) — no en la pantalla — así que se cumple sin
importar si la asignación se hizo desde `/admin/residentes` o desde el botón "+ Asignar nuevo
ocupante" de la propia ficha (ambos llaman a la misma función). `Asignacion` ahora tiene
`fechaInicio` y `fechaFin: string | null` (`null` = ocupante activo); el historial nunca borra
registros, solo les completa `fechaFin` al cerrarlos.

`/admin/residentes` solo lista ocupantes **activos** del inmueble seleccionado (para eso está la
sección "Residentes actuales"); el historial completo, incluyendo ocupantes pasados, se consulta
en la ficha. Acepta `?inmuebleId=` por query string para preseleccionar el inmueble al llegar
desde la ficha.

Acceso: la pestaña de historial es de solo lectura (sin acciones destructivas propias), así que
cualquier rol con "ver" en la sección `inmuebles` puede consultarla — la restricción real de HU2
("acceso restringido... para quien no es Administrador") se cumple igual que en el resto del
sistema: los botones de escritura (activar/desactivar el inmueble, asignar un ocupante) se ocultan
y revalidan según `MATRIZ_PERMISOS`, no hay un caso especial nuevo para esta pantalla.
