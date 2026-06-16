"""Previsão e enriquecimento — áreas ANM a entrar em leilão SOPLE."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


def _next_rodada_row(conn: Connection) -> dict | None:
    row = (
        conn.execute(
            text(
                """
                SELECT rodada, nome, data_leilao, data_oferta_pub, data_encerramento
                FROM mining.leilao_rodadas
                WHERE COALESCE(data_leilao, data_oferta_pub, data_encerramento) >= CURRENT_DATE
                ORDER BY COALESCE(data_leilao, data_oferta_pub) ASC NULLS LAST, rodada ASC
                LIMIT 1
                """
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def apply_edital_to_processes(conn: Connection) -> int:
    """Copia vínculos do edital importado para mining_processes."""
    result = conn.execute(
        text(
            """
            UPDATE mining.mining_processes mp
            SET
              rodada = e.rodada,
              rodada_prevista = NULL,
              data_leilao = COALESCE(e.data_leilao, mp.data_leilao, lr.data_leilao),
              data_oferta_pub = COALESCE(e.data_oferta_pub, mp.data_oferta_pub, lr.data_oferta_pub),
              valor_minimo = COALESCE(e.valor_minimo, mp.valor_minimo),
              status_leilao = COALESCE(e.status_leilao, 'CONFIRMADA'),
              updated_at = NOW()
            FROM mining.leilao_edital_processos e
            LEFT JOIN mining.leilao_rodadas lr ON lr.rodada = e.rodada
            WHERE mp.process_number = e.process_number
            """
        )
    )
    return result.rowcount or 0


def refresh_leilao_predictions(conn: Connection) -> dict:
    """
    Classifica áreas SIGMINE:
    - CONFIRMADA: edital importado ou rodada com data futura
    - PREVISTA: disponibilidade marcada para próxima rodada SOPLE
    - CANDIDATA: disponibilidade sem rodada (pool)
    """
    apply_edital_to_processes(conn)

    next_rd = _next_rodada_row(conn)
    if not next_rd:
        latest = conn.execute(text("SELECT MAX(rodada) AS r FROM mining.leilao_rodadas")).scalar()
        next_num = int(latest or 8) + 1
        conn.execute(
            text(
                """
                INSERT INTO mining.leilao_rodadas (rodada, nome, data_leilao, data_oferta_pub, data_encerramento)
                VALUES (:r, :nome, CURRENT_DATE + INTERVAL '180 days', CURRENT_DATE + INTERVAL '90 days', CURRENT_DATE + INTERVAL '180 days')
                ON CONFLICT (rodada) DO NOTHING
                """
            ),
            {"r": next_num, "nome": f"{next_num}ª Rodada SOPLE (prevista)"},
        )
        next_rd = _next_rodada_row(conn) or {
            "rodada": next_num,
            "data_leilao": None,
            "data_oferta_pub": None,
        }

    rodada = int(next_rd["rodada"])

    conn.execute(
        text(
            """
            UPDATE mining.mining_processes
            SET rodada_prevista = NULL,
                status_leilao = CASE
                  WHEN rodada IS NOT NULL AND (data_leilao IS NULL OR data_leilao >= CURRENT_DATE)
                    THEN COALESCE(status_leilao, 'CONFIRMADA')
                  WHEN phase ILIKE '%DISPONIB%' AND rodada IS NULL
                    THEN 'CANDIDATA'
                  ELSE status_leilao
                END
            WHERE phase ILIKE '%DISPONIB%' OR rodada IS NOT NULL OR rodada_prevista IS NOT NULL
            """
        )
    )

    prevista = conn.execute(
        text(
            """
            UPDATE mining.mining_processes
            SET
              rodada_prevista = :rodada,
              status_leilao = 'PREVISTA',
              data_leilao = COALESCE(data_leilao, CAST(:data_leilao AS DATE)),
              data_oferta_pub = COALESCE(data_oferta_pub, CAST(:data_oferta_pub AS DATE))
            WHERE phase ILIKE '%DISPONIB%'
              AND rodada IS NULL
              AND process_number NOT IN (
                SELECT process_number FROM mining.leilao_edital_processos WHERE rodada <> :rodada
              )
            """
        ),
        {
            "rodada": rodada,
            "data_leilao": next_rd.get("data_leilao"),
            "data_oferta_pub": next_rd.get("data_oferta_pub"),
        },
    ).rowcount or 0

    counts = conn.execute(
        text(
            """
            SELECT leilao_categoria, COUNT(*) AS n
            FROM public.mining_leilao_areas
            GROUP BY leilao_categoria
            """
        )
    ).mappings().all()

    by_cat = {str(r["leilao_categoria"]): int(r["n"]) for r in counts}

    conn.execute(
        text(
            """
            UPDATE mining.leilao_rodadas
            SET areas_count = (
              SELECT COUNT(*) FROM mining.mining_processes
              WHERE rodada = :rodada OR rodada_prevista = :rodada
            )
            WHERE rodada = :rodada
            """
        ),
        {"rodada": rodada},
    )

    return {
        "proximaRodada": rodada,
        "previstasAtribuidas": prevista,
        "porCategoria": by_cat,
        "rodadaMeta": next_rd,
    }
