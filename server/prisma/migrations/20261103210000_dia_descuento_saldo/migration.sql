-- Dia del mes en que los pagos anticipados (saldo a favor) se descuentan de la expensa.
-- Solo aditiva: las configuraciones existentes toman el dia 9, o su vencimiento si vence antes.
ALTER TABLE "configuracion_mora" ADD COLUMN "diaDescuentoSaldo" INTEGER NOT NULL DEFAULT 9;

UPDATE "configuracion_mora" SET "diaDescuentoSaldo" = "diaVencimiento" WHERE "diaVencimiento" < 9;
