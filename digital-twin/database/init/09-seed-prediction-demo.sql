-- Dados demo: chuva, GNSS, IoT para modelo de previsão (DEMO-01)

INSERT INTO geotech.sensors (
    id, project_id, sensor_code, sensor_type, geom, properties
)
SELECT
    'c0000000-0000-4000-8000-000000000001',
    p.id,
    'GNSS-01',
    'gnss',
    ST_SetSRID(ST_MakePoint(-47.76, -15.76, 920), 4326),
    '{"brand": "demo"}'::jsonb
FROM geotech.projects p
WHERE p.code = 'DEMO-01'
ON CONFLICT (id) DO NOTHING;

INSERT INTO geotech.sensors (
    id, project_id, sensor_code, sensor_type, geom, properties
)
SELECT
    'c0000000-0000-4000-8000-000000000002',
    p.id,
    'IOT-INC-01',
    'inclinometer',
    ST_SetSRID(ST_MakePoint(-47.78, -15.78, 45), 4326),
    '{"axis": "A"}'::jsonb
FROM geotech.projects p
WHERE p.code = 'DEMO-01'
ON CONFLICT (id) DO NOTHING;

-- Chuva diária (últimos 45 dias)
INSERT INTO geotech.monitoring_observations (
    project_id, source, metric, observed_at, value
)
SELECT
    p.id,
    'rain'::geotech.monitoring_source,
    'rainfall_mm',
    (CURRENT_DATE - offs) ::timestamptz,
    5 + (random() * 18)::float
FROM geotech.projects p
CROSS JOIN generate_series(0, 44) AS offs
WHERE p.code = 'DEMO-01'
  AND NOT EXISTS (
      SELECT 1 FROM geotech.monitoring_observations m
      WHERE m.project_id = p.id AND m.source = 'rain' LIMIT 1
  );

-- GNSS deslocamento acumulado (mm)
INSERT INTO geotech.monitoring_observations (
    project_id, source, sensor_id, metric, observed_at, value, geom
)
SELECT
    p.id,
    'gnss'::geotech.monitoring_source,
    'c0000000-0000-4000-8000-000000000001'::uuid,
    'displacement_mm',
    (CURRENT_DATE - offs)::timestamptz,
    offs * 0.35,
    ST_SetSRID(ST_MakePoint(-47.76, -15.76), 4326)
FROM geotech.projects p
CROSS JOIN generate_series(0, 59) AS offs
WHERE p.code = 'DEMO-01'
  AND NOT EXISTS (
      SELECT 1 FROM geotech.monitoring_observations m
      WHERE m.sensor_id = 'c0000000-0000-4000-8000-000000000001'::uuid LIMIT 1
  );

-- IoT inclinómetro (mrad) com pico recente
INSERT INTO geotech.monitoring_observations (
    project_id, source, sensor_id, metric, observed_at, value, geom
)
SELECT
    p.id,
    'iot'::geotech.monitoring_source,
    'c0000000-0000-4000-8000-000000000002'::uuid,
    'tilt_mrad',
    (CURRENT_DATE - offs)::timestamptz,
    CASE WHEN offs < 3 THEN 2.5 + offs * 0.8 ELSE 0.4 + random() * 0.3 END,
    ST_SetSRID(ST_MakePoint(-47.78, -15.78), 4326)
FROM geotech.projects p
CROSS JOIN generate_series(0, 29) AS offs
WHERE p.code = 'DEMO-01'
  AND NOT EXISTS (
      SELECT 1 FROM geotech.monitoring_observations m
      WHERE m.sensor_id = 'c0000000-0000-4000-8000-000000000002'::uuid LIMIT 1
  );
