-- Las fechas existentes se guardaron en UTC (TIMESTAMP sin zona). Se convierten a TIMESTAMPTZ
-- conservando el instante exacto, y la base pasa a mostrarlas en hora de Bolivia (UTC-4).
-- expensas.fechaVencimiento no se toca: es una fecha de calendario, no un evento con hora.

BEGIN;

ALTER TABLE "usuarios"
  ALTER COLUMN "ultimoLogin" SET DATA TYPE TIMESTAMPTZ(3) USING "ultimoLogin" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "copropietarios"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "tipos_inmueble"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "inmuebles"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "configuracion_mora"
  ALTER COLUMN "vigenteDesde" SET DATA TYPE TIMESTAMPTZ(3) USING "vigenteDesde" AT TIME ZONE 'UTC';

ALTER TABLE "ocupante_inmueble"
  ALTER COLUMN "fechaInicio" SET DATA TYPE TIMESTAMPTZ(3) USING "fechaInicio" AT TIME ZONE 'UTC',
  ALTER COLUMN "fechaFin" SET DATA TYPE TIMESTAMPTZ(3) USING "fechaFin" AT TIME ZONE 'UTC';

ALTER TABLE "documentos"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "historial_auditoria"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "expensas"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "pagos"
  ALTER COLUMN "fechaPago" SET DATA TYPE TIMESTAMPTZ(3) USING "fechaPago" AT TIME ZONE 'UTC';

ALTER TABLE "movimientos_financieros"
  ALTER COLUMN "fecha" SET DATA TYPE TIMESTAMPTZ(3) USING "fecha" AT TIME ZONE 'UTC';

ALTER TABLE "cuentas_bancarias"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "movimientos_caja"
  ALTER COLUMN "fecha" SET DATA TYPE TIMESTAMPTZ(3) USING "fecha" AT TIME ZONE 'UTC';

ALTER TABLE "personal"
  ALTER COLUMN "fechaIngreso" SET DATA TYPE TIMESTAMPTZ(3) USING "fechaIngreso" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "pagos_personal"
  ALTER COLUMN "fechaPago" SET DATA TYPE TIMESTAMPTZ(3) USING "fechaPago" AT TIME ZONE 'UTC';

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/La_Paz');
END
$$;

COMMIT;
