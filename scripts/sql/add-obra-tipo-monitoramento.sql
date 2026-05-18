-- Coluna tipo de monitorização InSAR.
-- Preferível: scripts/sql/neon-obra-insar-columns.sql (inclui também AOI JSON).
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "tipo_monitoramento" TEXT;

