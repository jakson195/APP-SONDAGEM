-- ANM Leilão SOPLE — extensão SIGMINE (rodadas + áreas de leilão)
-- Aplicar: psql -h localhost -p 5434 -U hidrogeo -d hidrogeo -f migrate_mining_leilao.sql

ALTER TABLE mining.mining_processes
  ADD COLUMN IF NOT EXISTS rodada INTEGER,
  ADD COLUMN IF NOT EXISTS data_leilao DATE,
  ADD COLUMN IF NOT EXISTS data_oferta_pub DATE,
  ADD COLUMN IF NOT EXISTS valor_minimo NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS status_leilao VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vencedor TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS mining_processes_process_uniq
  ON mining.mining_processes (process_number);

CREATE INDEX IF NOT EXISTS mining_processes_rodada_idx ON mining.mining_processes (rodada);
CREATE INDEX IF NOT EXISTS mining_processes_data_leilao_idx ON mining.mining_processes (data_leilao);
CREATE INDEX IF NOT EXISTS mining_processes_fase_idx ON mining.mining_processes (phase);

CREATE TABLE IF NOT EXISTS mining.leilao_rodadas (
    rodada INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    data_leilao DATE,
    data_oferta_pub DATE,
    data_encerramento DATE,
    areas_count INTEGER DEFAULT 0,
    pdf_url TEXT,
    attrs JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mining.sync_jobs (
    id SERIAL PRIMARY KEY,
    job_type TEXT NOT NULL DEFAULT 'sigmine_uf',
    uf TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress_pct SMALLINT DEFAULT 0,
    message TEXT,
    areas_imported INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP
);

-- View MVT — áreas em disponibilidade ou vinculadas a rodada SOPLE
CREATE OR REPLACE VIEW public.mining_leilao_areas AS
SELECT
    id,
    process_number,
    phase,
    holder,
    substance,
    use_type,
    area_ha,
    uf,
    rodada,
    data_leilao,
    data_oferta_pub,
    valor_minimo,
    status_leilao,
    last_event,
    attrs,
    geom
FROM mining.mining_processes
WHERE phase ILIKE '%DISPONIB%'
   OR rodada IS NOT NULL;

-- Seed rodadas SOPLE (metadados — processos vinculados depois via edital/seed)
INSERT INTO mining.leilao_rodadas (rodada, nome, data_leilao, data_oferta_pub, data_encerramento)
VALUES
  (1, '1ª Rodada SOPLE', '2021-01-25', '2020-11-25', '2021-01-25'),
  (2, '2ª Rodada SOPLE', '2021-03-24', '2021-01-15', '2021-03-24'),
  (3, '3ª Rodada SOPLE', '2021-06-29', '2021-04-01', '2021-06-29'),
  (4, '4ª Rodada SOPLE', '2022-06-15', '2022-04-01', '2022-06-15'),
  (5, '5ª Rodada SOPLE', '2023-05-30', '2023-03-01', '2023-05-30'),
  (6, '6ª Rodada SOPLE', '2024-04-15', '2024-02-01', '2024-04-15'),
  (7, '7ª Rodada SOPLE', '2024-11-20', '2024-09-01', '2024-11-20'),
  (8, '8ª Rodada SOPLE', '2025-06-01', '2025-04-01', '2025-06-01')
ON CONFLICT (rodada) DO UPDATE SET
  nome = EXCLUDED.nome,
  data_leilao = EXCLUDED.data_leilao,
  data_oferta_pub = EXCLUDED.data_oferta_pub,
  data_encerramento = EXCLUDED.data_encerramento;

GRANT SELECT ON public.mining_leilao_areas TO hidrogeo;
GRANT SELECT, INSERT, UPDATE ON mining.leilao_rodadas TO hidrogeo;
GRANT SELECT, INSERT, UPDATE ON mining.sync_jobs TO hidrogeo;
