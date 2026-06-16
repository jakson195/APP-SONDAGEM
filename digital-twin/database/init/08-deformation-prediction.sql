-- Observações multi-fonte e previsões de deformação (IA)

CREATE TYPE geotech.monitoring_source AS ENUM ('rain', 'gnss', 'iot');

CREATE TABLE geotech.monitoring_observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    source geotech.monitoring_source NOT NULL,
    sensor_id UUID REFERENCES geotech.sensors (id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_monitoring_sensor CHECK (
        (source = 'rain' AND sensor_id IS NULL)
        OR (source IN ('gnss', 'iot') AND sensor_id IS NOT NULL)
    )
);

COMMENT ON TABLE geotech.monitoring_observations IS 'Chuva, GNSS e sensores IoT (série temporal)';

CREATE INDEX idx_monitoring_obs_project_time
    ON geotech.monitoring_observations (project_id, observed_at DESC);

CREATE INDEX idx_monitoring_obs_sensor
    ON geotech.monitoring_observations (sensor_id, observed_at DESC)
    WHERE sensor_id IS NOT NULL;

CREATE TYPE geotech.prediction_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE geotech.prediction_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    status geotech.prediction_status NOT NULL DEFAULT 'pending',
    horizon_days INTEGER NOT NULL DEFAULT 30,
    model_version TEXT NOT NULL DEFAULT 'fusion-v1',
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_prediction_horizon CHECK (horizon_days > 0 AND horizon_days <= 365)
);

COMMENT ON TABLE geotech.prediction_runs IS 'Execuções do modelo de previsão de deformação';

CREATE INDEX idx_prediction_runs_project
    ON geotech.prediction_runs (project_id, created_at DESC);

CREATE TABLE geotech.prediction_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES geotech.prediction_runs (id) ON DELETE CASCADE,
    insar_displacement_id UUID REFERENCES geotech.insar_displacement (id) ON DELETE SET NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    forecast_displacement_mm DOUBLE PRECISION NOT NULL,
    rupture_risk DOUBLE PRECISION NOT NULL,
    failure_probability DOUBLE PRECISION NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_prediction_outputs_risk CHECK (
        rupture_risk >= 0 AND rupture_risk <= 1
        AND failure_probability >= 0 AND failure_probability <= 1
        AND confidence >= 0 AND confidence <= 1
    )
);

COMMENT ON TABLE geotech.prediction_outputs IS 'Previsão pontual: deslocamento, risco ruptura e probabilidade';

CREATE INDEX idx_prediction_outputs_run
    ON geotech.prediction_outputs (run_id);

CREATE INDEX idx_prediction_outputs_geom
    ON geotech.prediction_outputs USING GIST (geom);
