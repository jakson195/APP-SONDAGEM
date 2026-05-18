-- PostGIS + AOI da obra (polígono WGS84) + tipo de monitoramento InSAR/campo.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "tipo_monitoramento" TEXT;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "area_of_interest" geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS "Obra_area_of_interest_gix" ON "Obra" USING GIST ("area_of_interest");
