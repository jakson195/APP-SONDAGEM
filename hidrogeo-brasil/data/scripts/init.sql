-- HidroGeo Brasil — schema PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS hydro;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS admin;

-- Rios principais (ANA / seed)
CREATE TABLE IF NOT EXISTS hydro.rivers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    strahler_order SMALLINT DEFAULT 1,
    basin TEXT,
    hydro_region TEXT,
    length_km DOUBLE PRECISION,
    source TEXT DEFAULT 'ANA',
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiLineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS rivers_geom_idx ON hydro.rivers USING GIST (geom);
CREATE INDEX IF NOT EXISTS rivers_name_idx ON hydro.rivers (name);

-- Cursos d'água secundários (ordem Strahler 1–3: córregos, afluentes)
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

-- Nascentes (pontos de cabeceira derivados de HydroRIVERS)
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

-- Corpos hídricos
CREATE TABLE IF NOT EXISTS hydro.water_bodies (
    id SERIAL PRIMARY KEY,
    name TEXT,
    type TEXT,
    area_km2 DOUBLE PRECISION,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS water_bodies_geom_idx ON hydro.water_bodies USING GIST (geom);

-- Regiões hidrográficas
CREATE TABLE IF NOT EXISTS hydro.hydro_regions (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS hydro_regions_geom_idx ON hydro.hydro_regions USING GIST (geom);

-- Bacias hidrográficas
CREATE TABLE IF NOT EXISTS hydro.basins (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS basins_geom_idx ON hydro.basins USING GIST (geom);

-- Litologia (CPRM — fase 2)
CREATE TABLE IF NOT EXISTS geo.lithology (
    id SERIAL PRIMARY KEY,
    unit_name TEXT,
    rock_type TEXT,
    age TEXT,
    description TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS lithology_geom_idx ON geo.lithology USING GIST (geom);

-- Limites administrativos IBGE
CREATE TABLE IF NOT EXISTS admin.states (
    id SERIAL PRIMARY KEY,
    code TEXT,
    uf TEXT NOT NULL,
    name TEXT NOT NULL,
    region TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS states_geom_idx ON admin.states USING GIST (geom);
CREATE INDEX IF NOT EXISTS states_uf_idx ON admin.states (uf);

CREATE TABLE IF NOT EXISTS admin.municipalities (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    uf TEXT NOT NULL,
    state_name TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS municipalities_geom_idx ON admin.municipalities USING GIST (geom);
CREATE INDEX IF NOT EXISTS municipalities_uf_idx ON admin.municipalities (uf);
CREATE INDEX IF NOT EXISTS municipalities_name_idx ON admin.municipalities (name);

-- Mineração ANM (SIGMINE)
CREATE SCHEMA IF NOT EXISTS mining;

CREATE TABLE IF NOT EXISTS mining.mining_processes (
    id SERIAL PRIMARY KEY,
    process_number TEXT NOT NULL,
    phase TEXT,
    holder TEXT,
    substance TEXT,
    use_type TEXT,
    area_ha DOUBLE PRECISION,
    uf TEXT,
    last_event TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS mining_processes_geom_idx ON mining.mining_processes USING GIST (geom);
CREATE INDEX IF NOT EXISTS mining_processes_process_idx ON mining.mining_processes (process_number);
CREATE INDEX IF NOT EXISTS mining_processes_uf_idx ON mining.mining_processes (uf);

CREATE TABLE IF NOT EXISTS mining.source_protection (
    id SERIAL PRIMARY KEY,
    process_number TEXT,
    area_ha DOUBLE PRECISION,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS source_protection_geom_idx ON mining.source_protection USING GIST (geom);

CREATE TABLE IF NOT EXISTS mining.mining_leases (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    area_ha DOUBLE PRECISION,
    uf TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS mining_leases_geom_idx ON mining.mining_leases USING GIST (geom);

CREATE TABLE IF NOT EXISTS mining.mining_blocks (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    area_ha DOUBLE PRECISION,
    uf TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS mining_blocks_geom_idx ON mining.mining_blocks USING GIST (geom);

CREATE TABLE IF NOT EXISTS mining.placer_reserves (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    area_ha DOUBLE PRECISION,
    uf TEXT,
    attrs JSONB DEFAULT '{}',
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS placer_reserves_geom_idx ON mining.placer_reserves USING GIST (geom);

-- View para pg_tileserv (public schema)
CREATE OR REPLACE VIEW public.rivers AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers
WHERE strahler_order >= 5;

CREATE OR REPLACE VIEW public.stream_category_1 AS
SELECT id, name, strahler_order, 1 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 1;

CREATE OR REPLACE VIEW public.stream_category_2 AS
SELECT id, name, strahler_order, 2 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 2;

CREATE OR REPLACE VIEW public.stream_category_3 AS
SELECT id, name, strahler_order, 3 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 3;

CREATE OR REPLACE VIEW public.stream_category_4 AS
SELECT id, name, strahler_order, 4 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 4;

CREATE OR REPLACE VIEW public.secondary_streams AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.secondary_streams;

CREATE OR REPLACE VIEW public.springs AS
SELECT id, name, stream_name, strahler_order, basin, source, attrs, geom
FROM hydro.springs;

CREATE OR REPLACE VIEW public.water_bodies AS
SELECT id, name, type, area_km2, attrs, geom FROM hydro.water_bodies;

CREATE OR REPLACE VIEW public.hydro_regions AS
SELECT id, code, name, attrs, geom FROM hydro.hydro_regions;

CREATE OR REPLACE VIEW public.basins AS
SELECT id, code, name, attrs, geom FROM hydro.basins;

CREATE OR REPLACE VIEW public.lithology AS
SELECT id, unit_name, rock_type, age, description, attrs, geom FROM geo.lithology;

CREATE OR REPLACE VIEW public.states AS
SELECT id, code, uf, name, region, attrs, geom FROM admin.states;

CREATE OR REPLACE VIEW public.municipalities AS
SELECT id, code, name, uf, state_name, attrs, geom FROM admin.municipalities;

CREATE OR REPLACE VIEW public.mining_processes AS
SELECT id, process_number, phase, holder, substance, use_type, area_ha, uf, last_event, attrs, geom
FROM mining.mining_processes;

CREATE OR REPLACE VIEW public.source_protection AS
SELECT id, process_number, area_ha, attrs, geom FROM mining.source_protection;

CREATE OR REPLACE VIEW public.mining_leases AS
SELECT id, code, name, area_ha, uf, attrs, geom FROM mining.mining_leases;

CREATE OR REPLACE VIEW public.mining_blocks AS
SELECT id, code, name, area_ha, uf, attrs, geom FROM mining.mining_blocks;

CREATE OR REPLACE VIEW public.placer_reserves AS
SELECT id, code, name, area_ha, uf, attrs, geom FROM mining.placer_reserves;

GRANT USAGE ON SCHEMA hydro, geo, admin, mining TO hidrogeo;
GRANT SELECT ON ALL TABLES IN SCHEMA hydro, geo, admin, mining TO hidrogeo;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hidrogeo;
