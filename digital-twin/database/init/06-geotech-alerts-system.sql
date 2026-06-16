-- Sistema de alertas geotécnicos: regras, notificações e áreas críticas

CREATE TABLE geotech.alert_rules (
    project_id UUID PRIMARY KEY REFERENCES geotech.projects (id) ON DELETE CASCADE,
    displacement_mm DOUBLE PRECISION NOT NULL DEFAULT 10,
    velocity_mm_yr DOUBLE PRECISION NOT NULL DEFAULT 5,
    coherence_min DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    critical_displacement_mm DOUBLE PRECISION NOT NULL DEFAULT 20,
    critical_velocity_mm_yr DOUBLE PRECISION NOT NULL DEFAULT 12,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_alert_rules_coherence CHECK (
        coherence_min >= 0 AND coherence_min <= 1
    ),
    CONSTRAINT chk_alert_rules_positive CHECK (
        displacement_mm > 0 AND velocity_mm_yr > 0
    )
);

COMMENT ON TABLE geotech.alert_rules IS 'Limiares de alerta InSAR por projeto';

CREATE TABLE geotech.alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    alert_id UUID NOT NULL REFERENCES geotech.alerts (id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'in_app',
    title TEXT NOT NULL,
    body TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE geotech.alert_notifications IS 'Histórico de notificações geradas por alertas';

CREATE INDEX idx_alert_notifications_project
    ON geotech.alert_notifications (project_id, created_at DESC);

CREATE INDEX idx_alert_notifications_unread
    ON geotech.alert_notifications (project_id)
    WHERE read_at IS NULL;

CREATE TABLE geotech.critical_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES geotech.projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    severity geotech.alert_severity NOT NULL DEFAULT 'critical',
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    alert_count INTEGER NOT NULL DEFAULT 0,
    max_displacement_mm DOUBLE PRECISION,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE geotech.critical_areas IS 'Zonas críticas agregadas a partir de alertas';

CREATE INDEX idx_critical_areas_project
    ON geotech.critical_areas (project_id);

CREATE INDEX idx_critical_areas_geom
    ON geotech.critical_areas USING GIST (geom);

CREATE TRIGGER trg_critical_areas_updated
    BEFORE UPDATE ON geotech.critical_areas
    FOR EACH ROW
    EXECUTE FUNCTION geotech.touch_updated_at();

-- Regras default para projetos existentes
INSERT INTO geotech.alert_rules (project_id)
SELECT id FROM geotech.projects
ON CONFLICT (project_id) DO NOTHING;
