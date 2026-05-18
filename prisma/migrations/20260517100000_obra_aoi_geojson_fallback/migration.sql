-- AOI em GeoJSON quando PostGIS não está disponível (JSONB nativo Postgres).
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "area_of_interest_geojson" JSONB;
