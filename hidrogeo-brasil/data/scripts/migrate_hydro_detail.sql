-- Mais detalhe na rede: rios ordem >=3, secundários ordem <=4
CREATE OR REPLACE VIEW public.rivers AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers
WHERE strahler_order >= 3;

GRANT SELECT ON public.rivers TO hidrogeo;
