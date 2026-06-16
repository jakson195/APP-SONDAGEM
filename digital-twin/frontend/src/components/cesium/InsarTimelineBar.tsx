import { useInsarTimeline } from "../../hooks/useInsarTimeline";

interface Props {
  projectId: string | null;
}

export function InsarTimelineBar({ projectId }: Props) {
  const t = useInsarTimeline(projectId);

  if (!projectId) {
    return (
      <footer className="insar-timeline insar-timeline--empty">
        <span>Timeline InSAR — selecione um projeto</span>
      </footer>
    );
  }

  return (
    <footer className="insar-timeline">
      <div className="insar-timeline-header">
        <strong>Timeline InSAR</strong>
        {t.loading && <span className="timeline-hint">A carregar…</span>}
        {t.error && <span className="timeline-error">{t.error}</span>}
        <div className="insar-timeline-modes">
          <button
            type="button"
            className={t.mode === "playback" ? "active" : ""}
            onClick={() => {
              t.exitCompare();
              t.setMode("playback");
            }}
          >
            Animação
          </button>
          <button
            type="button"
            className={t.mode === "compare" ? "active" : ""}
            onClick={() => t.setMode("compare")}
          >
            Comparar
          </button>
        </div>
      </div>

      {t.mode === "playback" && (
        <div className="insar-timeline-body">
          <div className="insar-epoch-chips">
            {t.epochs.map((d) => (
              <button
                key={d}
                type="button"
                className={`epoch-chip ${t.selectedDates.has(d) ? "selected" : ""} ${t.currentEpoch === d ? "active" : ""}`}
                onClick={() => t.toggleDate(d)}
                onDoubleClick={() => t.selectEpoch(d)}
                title="Clique: incluir na animação · Duplo-clique: ir para data"
              >
                {d}
              </button>
            ))}
          </div>

          <div className="insar-playback-row">
            <button
              type="button"
              className="tl-btn"
              disabled={!t.ready || t.playbackDates.length === 0}
              onClick={t.stepPrev}
              title="Época anterior"
            >
              ⏮
            </button>
            <button
              type="button"
              className="tl-btn tl-btn-play"
              disabled={!t.ready || t.playbackDates.length === 0}
              onClick={() => t.setPlaying((p) => !p)}
            >
              {t.playing ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              className="tl-btn"
              disabled={!t.ready || t.playbackDates.length === 0}
              onClick={t.stepNext}
              title="Próxima época"
            >
              ⏭
            </button>
            <input
              type="range"
              className="timeline-slider insar-timeline-slider"
              min={0}
              max={Math.max(0, t.playbackDates.length - 1)}
              value={t.index}
              disabled={t.playbackDates.length === 0}
              onChange={(e) => t.selectEpoch(t.playbackDates[Number(e.target.value)])}
            />
            <span className="insar-current-epoch">{t.currentEpoch ?? "—"}</span>
            <label className="insar-speed">
              Vel.
              <select
                value={t.speedIdx}
                onChange={(e) => t.setSpeedIdx(Number(e.target.value))}
              >
                {t.speedOptions.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {t.mode === "compare" && (
        <div className="insar-timeline-body insar-compare-body">
          <label>
            Período A (referência)
            <select
              value={t.compareA}
              onChange={(e) => t.setCompareA(e.target.value)}
              disabled={t.epochs.length === 0}
            >
              {t.epochs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Período B
            <select
              value={t.compareB}
              onChange={(e) => t.setCompareB(e.target.value)}
              disabled={t.epochs.length === 0}
            >
              {t.epochs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={!t.ready || !t.compareA || !t.compareB || t.compareA === t.compareB}
            onClick={() => void t.runCompare()}
          >
            Comparar períodos
          </button>
          <button type="button" className="btn-secondary" onClick={t.exitCompare}>
            Sair da comparação
          </button>
          <p className="insar-compare-legend">
            <span className="diff-less">▼</span> Subsídio (B−A &lt; 0)
            <span className="diff-more">▲</span> Subida (B−A &gt; 0)
            · Camadas A + B sobrepostas + mapa Δ
          </p>
        </div>
      )}
    </footer>
  );
}
