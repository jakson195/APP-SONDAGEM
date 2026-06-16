-- Córregos por categoria (1ª–4ª ordem = Strahler 1–4)
CREATE OR REPLACE VIEW public.stream_category_1 AS
SELECT id, name, strahler_order, 1 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 1;

CREATE OR REPLACE VIEW public.stream_category_2 AS
SELECT id, name, strahler_order, 2 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 2;

CREATE OR REPLACE VIEW public.stream_category_3 AS
SELECT id, name, strahler_order, 3 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 3;

CREATE OR REPLACE VIEW public.stream_category_4 AS
SELECT id, name, strahler_order, 4 AS stream_category, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers WHERE strahler_order = 4;

CREATE OR REPLACE VIEW public.rivers AS
SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
FROM hydro.rivers
WHERE strahler_order >= 5;

GRANT SELECT ON public.stream_category_1, public.stream_category_2, public.stream_category_3, public.stream_category_4 TO hidrogeo;
