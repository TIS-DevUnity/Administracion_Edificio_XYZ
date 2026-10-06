-- AlterTable
-- Rol del usuario al momento del evento. Columna opcional: los eventos previos
-- y los generados por el sistema (cron) quedan con rol NULL.
ALTER TABLE "historial_auditoria" ADD COLUMN "rol" "RolNombre";
