-- Estabilidade de taludes — schema geotech
CREATE SCHEMA IF NOT EXISTS geotech;

-- Inventário de movimentos de massa (ingestão futura CPRM/CPRM-Geo/ANM)
CREATE TABLE IF NOT EXISTS geotech.landslide_inventory (
    id SERIAL PRIMARY KEY,
    name TEXT,
    code TEXT,
    event_date DATE,
    movement_type TEXT,
    risk_class TEXT,
    volume_m3 DOUBLE PRECISION,
    fatalities INT,
    attrs JSONB DEFAULT '{}',
    geom geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS landslide_inventory_geom_idx
    ON geotech.landslide_inventory USING GIST (geom);

-- Análises guardadas (opcional — histórico do utilizador)
CREATE TABLE IF NOT EXISTS geotech.slope_analyses (
    id SERIAL PRIMARY KEY,
    method TEXT NOT NULL DEFAULT 'infinite_slope',
    factor_of_safety DOUBLE PRECISION,
    risk_class TEXT,
    params JSONB DEFAULT '{}',
    lithology_id INT,
    attrs JSONB DEFAULT '{}',
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slope_analyses_geom_idx
    ON geotech.slope_analyses USING GIST (geom);

-- Views para pg_tileserv
CREATE OR REPLACE VIEW public.landslide_inventory AS
SELECT
    id,
    name,
    code,
    event_date,
    movement_type,
    risk_class,
    volume_m3,
    fatalities,
    attrs,
    geom
FROM geotech.landslide_inventory;

GRANT USAGE ON SCHEMA geotech TO hidrogeo;
GRANT SELECT ON ALL TABLES IN SCHEMA geotech TO hidrogeo;
GRANT SELECT ON public.landslide_inventory TO hidrogeo;
