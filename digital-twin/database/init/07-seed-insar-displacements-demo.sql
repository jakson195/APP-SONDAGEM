-- Pontos InSAR de demonstração para motor de alertas

INSERT INTO geotech.insar_images (
    id,
    project_id,
    scene_id,
    satellite,
    acquisition_date,
    footprint
)
SELECT
    'b0000000-0000-4000-8000-000000000001',
    p.id,
    'DEMO-S1-001',
    'Sentinel-1',
    CURRENT_DATE - 30,
    p.boundary
FROM geotech.projects p
WHERE p.code = 'DEMO-01'
ON CONFLICT (id) DO NOTHING;

INSERT INTO geotech.insar_displacement (
    project_id,
    insar_image_id,
    epoch_date,
    displacement_mm,
    velocity_mm_yr,
    coherence,
    geom
)
SELECT
    p.id,
    'b0000000-0000-4000-8000-000000000001'::uuid,
    CURRENT_DATE,
    v.disp,
    v.vel,
    v.coh,
    ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)
FROM geotech.projects p
CROSS JOIN (
    VALUES
        (-47.78, -15.78, 14.2, 8.5, 0.32),
        (-47.72, -15.72, -11.5, 6.2, 0.55),
        (-47.76, -15.74, 22.0, 14.0, 0.28),
        (-47.74, -15.76, 3.0, 1.0, 0.85)
) AS v(lon, lat, disp, vel, coh)
WHERE p.code = 'DEMO-01'
  AND NOT EXISTS (
      SELECT 1
      FROM geotech.insar_displacement d
      WHERE d.project_id = p.id
        AND d.displacement_mm = v.disp
  );
