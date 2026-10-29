-- Agua cargada a mano por departamento.
--
-- Antes el administrador registraba una factura total del edificio y el sistema la repartia por
-- pesos. Ahora el administrador carga el agua de cada departamento directamente en su expensa
-- (`Expensa.montoAgua`), asi que ya no existen la factura de agua ni los pesos de reparto.
--
-- Expensas existentes: conservan su `montoAgua` tal como esta (ya forma parte de su total). Las que
-- tienen agua mayor que 0 se marcan como "agua cargada" en la fecha de su ultima actualizacion;
-- las que tienen 0 quedan sin marca (pendientes de cargar).

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN     "aguaRegistradaEn" TIMESTAMPTZ(3);

UPDATE "expensas" SET "aguaRegistradaEn" = "updatedAt" WHERE "montoAgua" > 0;

-- DropForeignKey
ALTER TABLE "facturas_agua" DROP CONSTRAINT "facturas_agua_registradoPorId_fkey";

-- DropTable
DROP TABLE "facturas_agua";

-- AlterTable (el CHECK "tipos_inmueble_peso_agua_positivo" se elimina junto con la columna)
ALTER TABLE "tipos_inmueble" DROP COLUMN "pesoAgua";

-- AlterTable
ALTER TABLE "expensas" DROP COLUMN "pesoAgua";
