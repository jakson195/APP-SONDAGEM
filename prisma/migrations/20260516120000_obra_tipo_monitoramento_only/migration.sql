-- Coluna do formulário InSAR (funciona sem PostGIS).
-- Idempotente: seguro se já existir por migração anterior.
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "tipo_monitoramento" TEXT;
