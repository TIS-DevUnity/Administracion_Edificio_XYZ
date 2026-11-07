-- DEMO: agregar descripcion del departamento y asignacion directa de parqueo/baulera.
-- No modifica ni recalcula expensas antiguas.
ALTER TABLE "inmuebles"
  ADD COLUMN "descripcion" TEXT,
  ADD COLUMN "parqueo_id" TEXT,
  ADD COLUMN "baulera_id" TEXT;

CREATE UNIQUE INDEX "inmuebles_parqueo_id_key" ON "inmuebles"("parqueo_id");
CREATE UNIQUE INDEX "inmuebles_baulera_id_key" ON "inmuebles"("baulera_id");

ALTER TABLE "inmuebles"
  ADD CONSTRAINT "inmuebles_parqueo_id_fkey"
    FOREIGN KEY ("parqueo_id") REFERENCES "inmuebles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "inmuebles_baulera_id_fkey"
    FOREIGN KEY ("baulera_id") REFERENCES "inmuebles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Solo los departamentos pueden tener accesorios o descripcion.
ALTER TABLE "inmuebles"
  ADD CONSTRAINT "inmuebles_accesorios_solo_departamento_chk"
  CHECK ("clase" = 'DEPARTAMENTO' OR ("parqueo_id" IS NULL AND "baulera_id" IS NULL AND "descripcion" IS NULL));
