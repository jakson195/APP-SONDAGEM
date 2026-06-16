-- Monitoramento geotécnico: projetos, terreno, InSAR, sensores e alertas
CREATE SCHEMA IF NOT EXISTS geotech;

COMMENT ON SCHEMA geotech IS 'Monitoramento geotécnico — projetos, InSAR, sensores e alertas';

-- ── Tipos enumerados ─────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE geotech.alert_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE geotech.alert_status AS ENUM ('open', 'acknowledged', 'resolved');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE geotech.sensor_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── Projetos (âmbito espacial do empreendimento) ─────────────
CREATE TABLE geotech.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    boundary GEOMETRY(MultiPolygon, 4326),
    center GEOMETRY(Point, 4326),
    crs_epsg INTEGER NOT NULL DEFAULT 4326,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_geotech_projects_code UNIQUE (code),
    CONSTRAINT chk_geotech_projects_crs CHECK (crs_epsg > 0)
);

COMMENT ON TABLE geotech.projects IS 'Empreendimentos / obras com extensão geográfica';
COMMENT ON COLUMN geotech.projects.boundary IS 'Polígono delimitador do projeto (WGS84)';
COMMENT ON COLUMN geotech.projects.center IS 'Centroide ou ponto de referência do projeto';

-- ── Modelos de terreno (DTM/DEM/malha) ───────────────────────
CREATE TABLE geotech.terrain_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model_type TEXT NOT NULL DEFAULT 'dtm',
    source_uri TEXT,
    acquisition_date DATE,
    resolution_m DOUBLE PRECISION,
    vertical_datum TEXT,
    footprint GEOMETRY(Polygon, 4326),
    extent_3d GEOMETRY(GeometryZ, 4326),
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_geotech_terrain_resolution CHECK (
        resolution_m IS NULL OR resolution_m > 0
    )
);

COMMENT ON TABLE geotech.terrain_models IS 'Modelos digitais de terreno associados ao projeto';
COMMENT ON COLUMN geotech.terrain_models.footprint IS 'Embrulho horizontal do modelo';
COMMENT ON COLUMN geotech.terrain_models.extent_3d IS 'Envelope 3D opcional (superfície/malha)';

-- ── Imagens / cenas InSAR ────────────────────────────────────
CREATE TABLE geotech.insar_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    scene_id TEXT,
    satellite TEXT,
    orbit_direction TEXT,
    acquisition_date DATE NOT NULL,
    processing_level TEXT,
    footprint GEOMETRY(Polygon, 4326) NOT NULL,
    bbox_native GEOMETRY(Polygon),
    native_srid INTEGER,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_geotech_insar_orbit CHECK (
        orbit_direction IS NULL
        OR orbit_direction IN ('ASC', 'DESC', 'asc', 'desc')
    )
);

COMMENT ON TABLE geotech.insar_images IS 'Cenas ou stacks InSAR de referência';
COMMENT ON COLUMN geotech.insar_images.bbox_native IS 'Extensão no SRID nativo do produto (se ≠ 4326)';

-- ── Deslocamentos InSAR (pontos ou amostras) ─────────────────
CREATE TABLE geotech.insar_displacement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    insar_image_id UUID NOT NULL REFERENCES geotech.insar_images (id) ON DELETE CASCADE,
    terrain_model_id UUID REFERENCES geotech.terrain_models (id) ON DELETE SET NULL,
    epoch_date DATE NOT NULL,
    displacement_mm DOUBLE PRECISION NOT NULL,
    velocity_mm_yr DOUBLE PRECISION,
    coherence DOUBLE PRECISION,
    los_azimuth_deg DOUBLE PRECISION,
    los_incidence_deg DOUBLE PRECISION,
    geom GEOMETRY(Point, 4326) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_geotech_insar_disp_coherence CHECK (
        coherence IS NULL OR (coherence >= 0 AND coherence <= 1)
    )
);

COMMENT ON TABLE geotech.insar_displacement IS 'Deslocamentos LOS ou verticais derivados de InSAR';
COMMENT ON COLUMN geotech.insar_displacement.displacement_mm IS 'Deslocamento na linha de visada ou componente vertical (mm)';

-- ── Sensores geotécnicos ─────────────────────────────────────
CREATE TABLE geotech.sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    sensor_code TEXT NOT NULL,
    sensor_type TEXT NOT NULL,
    status geotech.sensor_status NOT NULL DEFAULT 'active',
    install_date DATE,
    depth_m DOUBLE PRECISION,
    geom GEOMETRY(PointZ, 4326) NOT NULL,
    orientation GEOMETRY(LineStringZ, 4326),
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_geotech_sensors_code_per_project UNIQUE (project_id, sensor_code),
    CONSTRAINT chk_geotech_sensors_depth CHECK (depth_m IS NULL OR depth_m >= 0)
);

COMMENT ON TABLE geotech.sensors IS 'Instrumentação de campo (piezómetro, inclinómetro, GPS, etc.)';
COMMENT ON COLUMN geotech.sensors.orientation IS 'Eixo ou direção de medição (ex. tubo inclinómetro)';

-- ── Alertas ──────────────────────────────────────────────────
CREATE TABLE geotech.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    sensor_id UUID REFERENCES geotech.sensors (id) ON DELETE SET NULL,
    insar_displacement_id UUID REFERENCES geotech.insar_displacement (id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL,
    severity geotech.alert_severity NOT NULL DEFAULT 'warning',
    status geotech.alert_status NOT NULL DEFAULT 'open',
    parameter_name TEXT,
    measured_value DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    message TEXT,
    geom GEOMETRY(Geometry, 4326),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_geotech_alerts_source CHECK (
        sensor_id IS NOT NULL
        OR insar_displacement_id IS NOT NULL
        OR geom IS NOT NULL
    ),
    CONSTRAINT chk_geotech_alerts_resolved CHECK (
        resolved_at IS NULL OR resolved_at >= triggered_at
    )
);

COMMENT ON TABLE geotech.alerts IS 'Alertas de limiar associados a sensores, InSAR ou zona espacial';
COMMENT ON COLUMN geotech.alerts.geom IS 'Local do alerta ou polígono da zona afetada';

-- ── Índices B-tree (FK e consultas temporais) ─────────────────
CREATE INDEX idx_geotech_terrain_models_project
    ON geotech.terrain_models (project_id);

CREATE INDEX idx_geotech_insar_images_project
    ON geotech.insar_images (project_id);

CREATE INDEX idx_geotech_insar_images_date
    ON geotech.insar_images (project_id, acquisition_date DESC);

CREATE INDEX idx_geotech_insar_disp_project
    ON geotech.insar_displacement (project_id);

CREATE INDEX idx_geotech_insar_disp_image
    ON geotech.insar_displacement (insar_image_id);

CREATE INDEX idx_geotech_insar_disp_epoch
    ON geotech.insar_displacement (project_id, epoch_date DESC);

CREATE INDEX idx_geotech_sensors_project
    ON geotech.sensors (project_id);

CREATE INDEX idx_geotech_sensors_type
    ON geotech.sensors (project_id, sensor_type);

CREATE INDEX idx_geotech_alerts_project
    ON geotech.alerts (project_id);

CREATE INDEX idx_geotech_alerts_status
    ON geotech.alerts (project_id, status)
    WHERE status = 'open';

CREATE INDEX idx_geotech_alerts_sensor
    ON geotech.alerts (sensor_id)
    WHERE sensor_id IS NOT NULL;

CREATE INDEX idx_geotech_alerts_triggered
    ON geotech.alerts (project_id, triggered_at DESC);

-- ── Índices GIST (consultas espaciais) ───────────────────────
CREATE INDEX idx_geotech_projects_boundary
    ON geotech.projects USING GIST (boundary);

CREATE INDEX idx_geotech_projects_center
    ON geotech.projects USING GIST (center);

CREATE INDEX idx_geotech_terrain_footprint
    ON geotech.terrain_models USING GIST (footprint);

CREATE INDEX idx_geotech_terrain_extent_3d
    ON geotech.terrain_models USING GIST (extent_3d);

CREATE INDEX idx_geotech_insar_images_footprint
    ON geotech.insar_images USING GIST (footprint);

CREATE INDEX idx_geotech_insar_images_bbox_native
    ON geotech.insar_images USING GIST (bbox_native);

CREATE INDEX idx_geotech_insar_disp_geom
    ON geotech.insar_displacement USING GIST (geom);

CREATE INDEX idx_geotech_sensors_geom
    ON geotech.sensors USING GIST (geom);

CREATE INDEX idx_geotech_sensors_orientation
    ON geotech.sensors USING GIST (orientation);

CREATE INDEX idx_geotech_alerts_geom
    ON geotech.alerts USING GIST (geom);

-- ── Integridade espacial: entidades dentro do projeto ────────
CREATE OR REPLACE FUNCTION geotech.enforce_within_project_boundary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_boundary GEOMETRY;
    v_geom GEOMETRY;
    v_project_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'terrain_models' THEN
        v_project_id := NEW.project_id;
        v_geom := COALESCE(NEW.footprint, ST_Envelope(NEW.extent_3d));
    ELSIF TG_TABLE_NAME = 'insar_images' THEN
        v_project_id := NEW.project_id;
        v_geom := NEW.footprint;
    ELSIF TG_TABLE_NAME = 'insar_displacement' THEN
        v_project_id := NEW.project_id;
        v_geom := NEW.geom;
    ELSIF TG_TABLE_NAME = 'sensors' THEN
        v_project_id := NEW.project_id;
        v_geom := NEW.geom;
    ELSIF TG_TABLE_NAME = 'alerts' THEN
        v_project_id := NEW.project_id;
        v_geom := NEW.geom;
    ELSE
        RETURN NEW;
    END IF;

    IF v_geom IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT boundary INTO v_boundary
    FROM geotech.projects
    WHERE id = v_project_id;

    IF v_boundary IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT ST_Within(v_geom, v_boundary) THEN
        RAISE EXCEPTION
            'Geometria fora do boundary do projeto % (tabela %)',
            v_project_id, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geotech_terrain_within_project
    BEFORE INSERT OR UPDATE ON geotech.terrain_models
    FOR EACH ROW
    EXECUTE FUNCTION geotech.enforce_within_project_boundary();

CREATE TRIGGER trg_geotech_insar_image_within_project
    BEFORE INSERT OR UPDATE ON geotech.insar_images
    FOR EACH ROW
    EXECUTE FUNCTION geotech.enforce_within_project_boundary();

CREATE TRIGGER trg_geotech_insar_disp_within_project
    BEFORE INSERT OR UPDATE ON geotech.insar_displacement
    FOR EACH ROW
    EXECUTE FUNCTION geotech.enforce_within_project_boundary();

CREATE TRIGGER trg_geotech_sensor_within_project
    BEFORE INSERT OR UPDATE ON geotech.sensors
    FOR EACH ROW
    EXECUTE FUNCTION geotech.enforce_within_project_boundary();

CREATE TRIGGER trg_geotech_alert_within_project
    BEFORE INSERT OR UPDATE ON geotech.alerts
    FOR EACH ROW
    WHEN (NEW.geom IS NOT NULL)
    EXECUTE FUNCTION geotech.enforce_within_project_boundary();

-- ── updated_at automático ────────────────────────────────────
CREATE OR REPLACE FUNCTION geotech.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geotech_projects_updated
    BEFORE UPDATE ON geotech.projects
    FOR EACH ROW
    EXECUTE FUNCTION geotech.touch_updated_at();

CREATE TRIGGER trg_geotech_terrain_updated
    BEFORE UPDATE ON geotech.terrain_models
    FOR EACH ROW
    EXECUTE FUNCTION geotech.touch_updated_at();

CREATE TRIGGER trg_geotech_sensors_updated
    BEFORE UPDATE ON geotech.sensors
    FOR EACH ROW
    EXECUTE FUNCTION geotech.touch_updated_at();

-- ── Vista: alertas abertos com localização ───────────────────
CREATE OR REPLACE VIEW geotech.v_open_alerts AS
SELECT
    a.id,
    a.project_id,
    p.code AS project_code,
    p.name AS project_name,
    a.alert_type,
    a.severity,
    a.status,
    a.message,
    a.triggered_at,
    COALESCE(a.geom, s.geom, d.geom) AS alert_geom,
    a.sensor_id,
    a.insar_displacement_id
FROM geotech.alerts a
JOIN geotech.projects p ON p.id = a.project_id
LEFT JOIN geotech.sensors s ON s.id = a.sensor_id
LEFT JOIN geotech.insar_displacement d ON d.id = a.insar_displacement_id
WHERE a.status = 'open';

COMMENT ON VIEW geotech.v_open_alerts IS 'Alertas em aberto com geometria derivada (alerta, sensor ou InSAR)';
