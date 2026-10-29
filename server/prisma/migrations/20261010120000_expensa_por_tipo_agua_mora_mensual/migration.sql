-- Expensa fija por tipo de departamento (A, B, C), agua repartida por pesos, vencimiento
-- configurable y mora desglosada por mes.
--
-- Datos existentes:
--  * Los tipos "Baulera" y "Parqueo" pasan a ser la CLASE del inmueble (sin tipo).
--  * El tipo generico "Departamento" se renombra a "A" (el administrador crea B, C, etc.).
--  * Las expensas y pagos actuales conservan su monto: `montoBase` toma el valor de
--    `montoTotal`, el agua queda en 0 y todo lo pagado cuenta como pago de la expensa.

-- CreateEnum
CREATE TYPE "ClaseInmueble" AS ENUM ('DEPARTAMENTO', 'BAULERA', 'PARQUEO');

-- AlterTable
ALTER TABLE "tipos_inmueble" ADD COLUMN     "pesoAgua" DECIMAL(6,3) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "inmuebles" ADD COLUMN     "clase" "ClaseInmueble" NOT NULL DEFAULT 'DEPARTAMENTO',
ALTER COLUMN "tipoInmuebleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "configuracion_mora" ADD COLUMN     "diaVencimiento" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "modoMora" SET DEFAULT 'MENSUAL';

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN     "montoBase" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipoNombre" TEXT,
ADD COLUMN     "pesoAgua" DECIMAL(6,3) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "montoMora" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoExpensa" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Clase de los inmuebles a partir del tipo que tenian
UPDATE "inmuebles" SET "clase" = 'BAULERA'
FROM "tipos_inmueble" t
WHERE "inmuebles"."tipoInmuebleId" = t."id" AND lower(t."nombre") IN ('baulera', 'bauleras');

UPDATE "inmuebles" SET "clase" = 'PARQUEO'
FROM "tipos_inmueble" t
WHERE "inmuebles"."tipoInmuebleId" = t."id" AND lower(t."nombre") IN ('parqueo', 'parqueos');

-- Baulera y parqueo no tienen tipo
UPDATE "inmuebles" SET "tipoInmuebleId" = NULL WHERE "clase" <> 'DEPARTAMENTO';

-- Los tipos que eran en realidad una clase ya no se usan
DELETE FROM "tipos_inmueble" t
WHERE lower(t."nombre") IN ('baulera', 'bauleras', 'parqueo', 'parqueos')
  AND NOT EXISTS (SELECT 1 FROM "inmuebles" i WHERE i."tipoInmuebleId" = t."id");

-- El tipo generico pasa a ser el tipo A
UPDATE "tipos_inmueble" SET "nombre" = 'A'
WHERE lower("nombre") = 'departamento'
  AND NOT EXISTS (SELECT 1 FROM "tipos_inmueble" WHERE "nombre" = 'A');

-- Expensas y pagos existentes
UPDATE "expensas" SET "montoBase" = "montoTotal";

UPDATE "expensas" SET "tipoNombre" = t."nombre", "pesoAgua" = t."pesoAgua"
FROM "inmuebles" i
JOIN "tipos_inmueble" t ON t."id" = i."tipoInmuebleId"
WHERE i."id" = "expensas"."inmuebleId";

UPDATE "pagos" SET "montoExpensa" = "monto";

-- La relacion con el tipo ahora es opcional: si se borra el tipo queda en null
ALTER TABLE "inmuebles" DROP CONSTRAINT "inmuebles_tipoInmuebleId_fkey";

-- AddForeignKey
ALTER TABLE "inmuebles" ADD CONSTRAINT "inmuebles_tipoInmuebleId_fkey" FOREIGN KEY ("tipoInmuebleId") REFERENCES "tipos_inmueble"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "moras_expensa" (
    "id" TEXT NOT NULL,
    "expensaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "fechaCorte" DATE NOT NULL,
    "base" DECIMAL(10,2) NOT NULL,
    "tipoValor" "TipoValorMora" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moras_expensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_agua" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "montoFactura" DECIMAL(10,2) NOT NULL,
    "totalPesos" DECIMAL(12,3) NOT NULL,
    "valorUnidad" DECIMAL(14,6) NOT NULL,
    "departamentos" INTEGER NOT NULL,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facturas_agua_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moras_expensa_expensaId_idx" ON "moras_expensa"("expensaId");

-- CreateIndex
CREATE UNIQUE INDEX "moras_expensa_expensaId_numero_key" ON "moras_expensa"("expensaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_agua_periodo_key" ON "facturas_agua"("periodo");

-- AddForeignKey
ALTER TABLE "moras_expensa" ADD CONSTRAINT "moras_expensa_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_agua" ADD CONSTRAINT "facturas_agua_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones de integridad (Prisma no las modela).
ALTER TABLE "tipos_inmueble"
  ADD CONSTRAINT "tipos_inmueble_peso_agua_positivo" CHECK ("pesoAgua" > 0);

ALTER TABLE "inmuebles"
  ADD CONSTRAINT "inmuebles_tipo_segun_clase" CHECK (
    ("clase" = 'DEPARTAMENTO' AND "tipoInmuebleId" IS NOT NULL)
    OR ("clase" <> 'DEPARTAMENTO' AND "tipoInmuebleId" IS NULL)
  );

ALTER TABLE "configuracion_mora"
  ADD CONSTRAINT "configuracion_mora_dia_vencimiento_valido" CHECK ("diaVencimiento" BETWEEN 1 AND 28);

ALTER TABLE "expensas"
  ADD CONSTRAINT "expensas_agua_no_negativa" CHECK ("montoBase" >= 0 AND "montoAgua" >= 0) NOT VALID;

ALTER TABLE "pagos"
  ADD CONSTRAINT "pagos_desglose_coherente" CHECK (
    "montoMora" >= 0 AND "montoExpensa" >= 0 AND "montoMora" + "montoExpensa" = "monto"
  ) NOT VALID;

ALTER TABLE "moras_expensa"
  ADD CONSTRAINT "moras_expensa_valores_validos" CHECK ("numero" >= 1 AND "base" >= 0 AND "monto" >= 0);

ALTER TABLE "facturas_agua"
  ADD CONSTRAINT "facturas_agua_monto_positivo" CHECK ("montoFactura" > 0);
