-- Coluna JSONB do AOI (fallback sem PostGIS).
-- Preferível usar o pacote completo: scripts/sql/neon-obra-insar-columns.sql
-- Idempotente: pode voltar a executar sem erro.
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "area_of_interest_geojson" JSONB;


