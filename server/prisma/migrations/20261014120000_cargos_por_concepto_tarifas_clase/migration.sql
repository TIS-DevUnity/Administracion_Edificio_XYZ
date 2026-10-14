-- Cobro de baulera y parqueo: tarifa general por clase, monto propio opcional por inmueble y
-- lineas de cargo por concepto en cada expensa.
--
-- Expensas existentes: reciben una linea de cargo "DEPARTAMENTO" igual a su montoBase, asi el
-- desglose siempre suma el mismo total que ya tenian.
-- Inmuebles existentes: cuotaMensual queda en NULL (usan la tarifa de su clase, que arranca
-- sin definir), por lo que no se genera ningun cobro nuevo hasta que se configure una tarifa.

-- AlterTable
ALTER TABLE "inmuebles" ADD COLUMN     "cuotaMensual" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "tarifas_clase" (
    "id" TEXT NOT NULL,
    "clase" "ClaseInmueble" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tarifas_clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_expensa" (
    "id" TEXT NOT NULL,
    "expensaId" TEXT NOT NULL,
    "inmuebleId" TEXT,
    "clase" "ClaseInmueble" NOT NULL,
    "codigo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargos_expensa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarifas_clase_clase_key" ON "tarifas_clase"("clase");

-- CreateIndex
CREATE INDEX "cargos_expensa_expensaId_idx" ON "cargos_expensa"("expensaId");

-- AddForeignKey
ALTER TABLE "cargos_expensa" ADD CONSTRAINT "cargos_expensa_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_expensa" ADD CONSTRAINT "cargos_expensa_inmuebleId_fkey" FOREIGN KEY ("inmuebleId") REFERENCES "inmuebles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Linea de departamento para cada expensa ya generada
INSERT INTO "cargos_expensa" ("id", "expensaId", "inmuebleId", "clase", "codigo", "monto")
SELECT gen_random_uuid()::text, e."id", e."inmuebleId", 'DEPARTAMENTO', i."codigo", e."montoBase"
FROM "expensas" e
JOIN "inmuebles" i ON i."id" = e."inmuebleId";
