-- Processamento InSAR: jobs e produtos raster (GeoTIFF)
DO $$ BEGIN
    CREATE TYPE geotech.insar_job_status AS ENUM (
        'pending',
        'fetching',
        'processing',
        'exporting',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE geotech.insar_raster_kind AS ENUM (
        'displacement',
        'velocity',
        'coherence',
        'unwrapped_phase'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE geotech.insar_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status geotech.insar_job_status NOT NULL DEFAULT 'pending',
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    reference_date DATE,
    orbit_direction TEXT,
    aoi GEOMETRY(Polygon, 4326),
    scene_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_insar_job_dates CHECK (date_to >= date_from),
    CONSTRAINT chk_insar_job_orbit CHECK (
        orbit_direction IS NULL
        OR orbit_direction IN ('ASC', 'DESC', 'asc', 'desc')
    )
);

COMMENT ON TABLE geotech.insar_processing_jobs IS
    'Pipeline InSAR Sentinel-1 — busca, processamento e exportação GeoTIFF';

CREATE TABLE geotech.insar_rasters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES geotech.insar_processing_jobs (id) ON DELETE CASCADE,
    insar_image_id UUID REFERENCES geotech.insar_images (id) ON DELETE SET NULL,
    raster_kind geotech.insar_raster_kind NOT NULL,
    epoch_date DATE,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    crs_epsg INTEGER NOT NULL DEFAULT 4326,
    pixel_size_m DOUBLE PRECISION,
    width INTEGER,
    height INTEGER,
    nodata_value DOUBLE PRECISION,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,
    mean_value DOUBLE PRECISION,
    units TEXT NOT NULL DEFAULT 'mm',
    footprint GEOMETRY(Polygon, 4326) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_insar_raster_epoch CHECK (
        raster_kind <> 'displacement' OR epoch_date IS NOT NULL
    )
);

COMMENT ON TABLE geotech.insar_rasters IS 'Produtos raster InSAR exportados (GeoTIFF)';
COMMENT ON COLUMN geotech.insar_rasters.file_path IS 'Caminho relativo em uploads/insar/processed';

CREATE INDEX idx_insar_jobs_project ON geotech.insar_processing_jobs (project_id);
CREATE INDEX idx_insar_jobs_status ON geotech.insar_processing_jobs (project_id, status);
CREATE INDEX idx_insar_rasters_project ON geotech.insar_rasters (project_id);
CREATE INDEX idx_insar_rasters_job ON geotech.insar_rasters (job_id);
CREATE INDEX idx_insar_rasters_kind ON geotech.insar_rasters (project_id, raster_kind);
CREATE INDEX idx_insar_rasters_footprint ON geotech.insar_rasters USING GIST (footprint);

CREATE TRIGGER trg_insar_jobs_updated
    BEFORE UPDATE ON geotech.insar_processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION geotech.touch_updated_at();
