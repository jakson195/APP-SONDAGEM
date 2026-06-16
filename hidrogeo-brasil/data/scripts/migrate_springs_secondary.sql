-- Migração: nascentes + cursos d'água secundários (BD existente)
CREATE TABLE IF NOT EXISTS hydro.secondary_streams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    strahler_order SMALLINT DEFAULT 1,
    basin TEXT,
    hydro_region TEXT,
    length_km DOUBLE PRECISION,
    source TEXT DEFAULT 'HydroRIVERS v1.0',
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiLineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS secondary_streams_geom_idx ON hydro.secondary_streams USING GIST (geom);
CREATE INDEX IF NOT EXISTS secondary_streams_order_idx ON hydro.secondary_streams (strahler_order);

CREATE TABLE IF NOT EXISTS hydro.springs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    stream_name TEXT,
    strahler_order SMALLINT DEFAULT 1,
    basin TEXT,
    source TEXT DEFAULT 'HydroRIVERS v1.0',
    attrs JSONB DEFAULT '{}',
    geom geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS springs_geom_idx ON hydro.springs USING GIST (geom);
CREATE INDEX IF NOT EXISTS springs_basin_idx ON hydro.springs (basin);

CREATE OR REPLACE VIEW public.rivers AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers
WHERE strahler_order >= 4;

CREATE OR REPLACE VIEW public.secondary_streams AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.secondary_streams;

CREATE OR REPLACE VIEW public.springs AS
SELECT id, name, stream_name, strahler_order, basin, source, attrs, geom
FROM hydro.springs;

GRANT SELECT ON hydro.secondary_streams, hydro.springs TO hidrogeo;
GRANT SELECT ON public.secondary_streams, public.springs TO hidrogeo;
