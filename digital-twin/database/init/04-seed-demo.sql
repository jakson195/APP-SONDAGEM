-- Projeto de demonstração (apenas se ainda não existir)
INSERT INTO geotech.projects (id, code, name, description, boundary, center, properties)
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    'DEMO-01',
    'Projeto Demonstração Digital Twin',
    'Área de teste para uploads LiDAR/InSAR e monitoramento',
    ST_GeomFromText(
        'MULTIPOLYGON(((-48.10 -16.10, -47.40 -16.10, -47.40 -15.40, -48.10 -15.40, -48.10 -16.10)))',
        4326
    ),
    ST_SetSRID(ST_MakePoint(-47.75, -15.75), 4326),
    '{"region": "demo"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- Alerta espacial de exemplo (geom obrigatória sem sensor/InSAR)
INSERT INTO geotech.alerts (
    project_id,
    alert_type,
    severity,
    status,
    parameter_name,
    measured_value,
    threshold_value,
    message,
    geom
)
SELECT
    p.id,
    'displacement_threshold',
    'warning'::geotech.alert_severity,
    'open'::geotech.alert_status,
    'displacement_mm',
    -12.5,
    -10.0,
    'Deslocamento acima do limiar de atenção (demo)',
    ST_SetSRID(ST_MakePoint(-47.75, -15.75), 4326)
FROM geotech.projects p
WHERE p.code = 'DEMO-01'
  AND NOT EXISTS (
      SELECT 1 FROM geotech.alerts a
      WHERE a.project_id = p.id AND a.alert_type = 'displacement_threshold'
  );
