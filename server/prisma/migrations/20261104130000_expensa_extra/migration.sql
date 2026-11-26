-- Cobro "Extra" opcional por expensa (pintura del edificio, reparaciones...), ademas del agua.
-- montoTotal = montoBase + montoAgua + montoExtra. Aditiva: las expensas existentes quedan con extra 0 y sin
-- concepto, asi que su montoTotal no cambia.

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN     "extraConcepto" TEXT,
ADD COLUMN     "montoExtra" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- El extra nunca es negativo. (Toda fila existente tiene 0, asi que no puede fallar.)
ALTER TABLE "expensas" ADD CONSTRAINT "expensas_monto_extra_no_negativo" CHECK ("montoExtra" >= 0);
