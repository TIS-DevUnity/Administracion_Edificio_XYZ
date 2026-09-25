# Modulo Operativo / Seguridad — Dev Backend 2

Responsable: Dev Backend 2 (segun cronograma de Sprint).

Contiene:
- `auth/` — login, JWT, ruta de perfil y ruta de prueba RBAC
- `auditoria/` — servicio de registro (`registrarAuditoria`) y endpoint de consulta `GET /api/auditoria` (logs)
- `usuarios/` — CRUD de usuarios y roles
- `copropietarios/` — CRUD de copropietarios e inmuebles
- `documentos/` — gestion documental (actas, reglamentos, contratos, facturas, fotos, cotizaciones), archivos en Supabase Storage

Tambien usa `src/middlewares/auth.middleware.js`, `src/middlewares/rbac.middleware.js` y `src/middlewares/upload.middleware.js` (multer, para `documentos/`).
