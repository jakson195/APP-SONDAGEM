-- Áreas a entrar em leilão SOPLE — confirmadas (edital) + previstas (próxima rodada)
-- psql -h localhost -p 5434 -U hidrogeo -d hidrogeo -f migrate_mining_leilao_upcoming.sql

ALTER TABLE mining.mining_processes
  ADD COLUMN IF NOT EXISTS rodada_prevista INTEGER;

CREATE INDEX IF NOT EXISTS mining_processes_rodada_prevista_idx
  ON mining.mining_processes (rodada_prevista);

CREATE INDEX IF NOT EXISTS mining_processes_status_leilao_idx
  ON mining.mining_processes (status_leilao);

-- Processos vinculados por edital SOPLE (fonte externa / import manual)
CREATE TABLE IF NOT EXISTS mining.leilao_edital_processos (
    process_number TEXT NOT NULL,
    rodada INTEGER NOT NULL REFERENCES mining.leilao_rodadas (rodada) ON DELETE CASCADE,
    valor_minimo NUMERIC(15, 2),
    data_leilao DATE,
    data_oferta_pub DATE,
    status_leilao VARCHAR(50) DEFAULT 'CONFIRMADA',
    source TEXT DEFAULT 'edital',
    imported_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (process_number, rodada)
);

CREATE INDEX IF NOT EXISTS leilao_edital_rodada_idx
  ON mining.leilao_edital_processos (rodada);

-- Rodada 9+ (placeholder — actualizar datas quando ANM publicar edital)
INSERT INTO mining.leilao_rodadas (rodada, nome, data_leilao, data_oferta_pub, data_encerramento)
VALUES
  (9, '9ª Rodada SOPLE (prevista)', '2026-09-01', '2026-06-01', '2026-09-01')
ON CONFLICT (rodada) DO UPDATE SET
  nome = EXCLUDED.nome,
  data_leilao = EXCLUDED.data_leilao,
  data_oferta_pub = EXCLUDED.data_oferta_pub,
  data_encerramento = EXCLUDED.data_encerramento;

-- View enriquecida — categorias para mapa e API
DROP VIEW IF EXISTS public.mining_leilao_upcoming;
DROP VIEW IF EXISTS public.mining_leilao_areas;

CREATE VIEW public.mining_leilao_areas AS
SELECT
    mp.id,
    mp.process_number,
    mp.phase,
    mp.holder,
    mp.substance,
    mp.use_type,
    mp.area_ha,
    mp.uf,
    mp.rodada,
    mp.rodada_prevista,
    COALESCE(mp.data_leilao, lr.data_leilao, lr_prev.data_leilao) AS data_leilao,
    COALESCE(mp.data_oferta_pub, lr.data_oferta_pub, lr_prev.data_oferta_pub) AS data_oferta_pub,
    mp.valor_minimo,
    COALESCE(mp.status_leilao, 'CANDIDATA') AS status_leilao,
    mp.last_event,
    mp.attrs,
    mp.geom,
    CASE
        WHEN mp.rodada IS NOT NULL
             AND (mp.data_leilao IS NULL OR mp.data_leilao >= CURRENT_DATE)
             AND COALESCE(mp.status_leilao, '') IN ('CONFIRMADA', 'PROGRAMADA', 'confirmada')
            THEN 'confirmada'
        WHEN mp.rodada IS NOT NULL
             AND mp.data_leilao IS NOT NULL
             AND mp.data_leilao >= CURRENT_DATE
            THEN 'confirmada'
        WHEN mp.rodada IS NOT NULL THEN 'historica'
        WHEN mp.rodada_prevista IS NOT NULL THEN 'prevista'
        WHEN mp.phase ILIKE '%DISPONIB%' THEN 'candidata'
        ELSE 'outra'
    END AS leilao_categoria,
    COALESCE(mp.rodada, mp.rodada_prevista) AS rodada_exibicao
FROM mining.mining_processes mp
LEFT JOIN mining.leilao_rodadas lr ON lr.rodada = mp.rodada
LEFT JOIN mining.leilao_rodadas lr_prev ON lr_prev.rodada = mp.rodada_prevista
WHERE mp.phase ILIKE '%DISPONIB%'
   OR mp.rodada IS NOT NULL
   OR mp.rodada_prevista IS NOT NULL;

-- Camada MVT — áreas confirmadas + previstas para próximos leilões
CREATE VIEW public.mining_leilao_upcoming AS
SELECT *
FROM public.mining_leilao_areas
WHERE leilao_categoria IN ('confirmada', 'prevista', 'candidata');

GRANT SELECT ON public.mining_leilao_areas TO hidrogeo;
GRANT SELECT ON public.mining_leilao_upcoming TO hidrogeo;
GRANT SELECT, INSERT, UPDATE, DELETE ON mining.leilao_edital_processos TO hidrogeo;
