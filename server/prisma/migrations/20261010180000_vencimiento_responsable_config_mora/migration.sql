-- Cada expensa guarda la configuracion de mora de su periodo y la persona responsable al
-- generarla, y los cambios manuales de vencimiento quedan en un historial.
--
-- Expensas existentes: se les asigna la configuracion que regia cuando se generaron.

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN     "configuracionMoraId" TEXT,
ADD COLUMN     "responsableId" TEXT,
ADD COLUMN     "responsableNombre" TEXT,
ADD COLUMN     "responsableRol" TEXT;

-- CreateTable
CREATE TABLE "cambios_vencimiento" (
    "id" TEXT NOT NULL,
    "expensaId" TEXT NOT NULL,
    "fechaAnterior" DATE NOT NULL,
    "fechaNueva" DATE NOT NULL,
    "motivo" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cambios_vencimiento_expensaId_idx" ON "cambios_vencimiento"("expensaId");

-- AddForeignKey
ALTER TABLE "expensas" ADD CONSTRAINT "expensas_configuracionMoraId_fkey" FOREIGN KEY ("configuracionMoraId") REFERENCES "configuracion_mora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expensas" ADD CONSTRAINT "expensas_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "copropietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_vencimiento" ADD CONSTRAINT "cambios_vencimiento_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_vencimiento" ADD CONSTRAINT "cambios_vencimiento_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Configuracion que regia al generar cada expensa existente
UPDATE "expensas" SET "configuracionMoraId" = (
  SELECT c."id" FROM "configuracion_mora" c
  WHERE c."vigenteDesde" <= "expensas"."createdAt"
  ORDER BY c."vigenteDesde" DESC
  LIMIT 1
);
