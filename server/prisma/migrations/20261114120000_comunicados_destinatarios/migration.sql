-- CreateEnum
CREATE TYPE "ModoDestinatarios" AS ENUM ('TODOS', 'SELECCIONADOS');

-- AlterTable
ALTER TABLE "comunicados" ADD COLUMN     "destinatarioIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "destinatariosModo" "ModoDestinatarios";
