-- Esquema inicial Digital Twin (exemplo)
CREATE SCHEMA IF NOT EXISTS twin;

COMMENT ON SCHEMA twin IS 'Ativos e geometrias do Digital Twin';

CREATE TABLE IF NOT EXISTS twin.assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'generic',
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom GEOMETRY(GEOMETRYZ, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twin_assets_geom ON twin.assets USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_twin_assets_type ON twin.assets (asset_type);
