/*
  Warnings:

  - You are about to drop the column `tipo` on the `inmuebles` table. All the data in the column will be lost.
  - Added the required column `tipoInmuebleId` to the `inmuebles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoValorMora" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN     "montoMora" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inmuebles" DROP COLUMN "tipo",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tipoInmuebleId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TipoInmueble";

-- CreateTable
CREATE TABLE "tipos_inmueble" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "montoBase" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_inmueble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_mora" (
    "id" TEXT NOT NULL,
    "diaGeneracion" INTEGER NOT NULL DEFAULT 1,
    "diasGracia" INTEGER NOT NULL DEFAULT 0,
    "tipoValor" "TipoValorMora" NOT NULL DEFAULT 'PORCENTAJE',
    "valor" DECIMAL(10,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_mora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_inmueble_nombre_key" ON "tipos_inmueble"("nombre");

-- CreateIndex
CREATE INDEX "inmuebles_tipoInmuebleId_idx" ON "inmuebles"("tipoInmuebleId");

-- AddForeignKey
ALTER TABLE "inmuebles" ADD CONSTRAINT "inmuebles_tipoInmuebleId_fkey" FOREIGN KEY ("tipoInmuebleId") REFERENCES "tipos_inmueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
