import { useEffect, useMemo, useState } from "react";

import { fetchTimeline } from "../../api/client";
import type { TimelineEpoch } from "../../api/types";
import { useCesium } from "../../context/CesiumContext";

interface Props {
  projectId: string | null;
}

export function TimelineBar({ projectId }: Props) {
  const { ready, setCurrentEpoch } = useCesium();
  const [epochs, setEpochs] = useState<TimelineEpoch[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setEpochs([]);
      setCurrentEpoch(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchTimeline(projectId)
      .then((data) => {
        const list = data.epochs.length
          ? data.epochs
          : data.insar_acquisitions.map((a) => ({
              epoch_date: a.acquisition_date,
              displacement_count: 0,
              insar_scenes: 1,
              open_alerts: 0,
            }));
        setEpochs(list);
        if (list.length > 0) {
          setIndex(list.length - 1);
          setCurrentEpoch(list[list.length - 1].epoch_date);
        } else {
          setCurrentEpoch(null);
        }
      })
      .catch(() => setError("Timeline indisponível"))
      .finally(() => setLoading(false));
  }, [projectId, setCurrentEpoch]);

  const sortedDates = useMemo(
    () => epochs.map((e) => e.epoch_date).sort(),
    [epochs],
  );

  useEffect(() => {
    if (!playing || sortedDates.length === 0) return;
    const timer = window.setInterval(() => {
      setIndex((i) => {
        const next = i >= sortedDates.length - 1 ? 0 : i + 1;
        setCurrentEpoch(sortedDates[next]);
        return next;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [playing, sortedDates, setCurrentEpoch]);

  const onSlider = (i: number) => {
    setIndex(i);
    if (sortedDates[i]) setCurrentEpoch(sortedDates[i]);
  };

  const current = epochs[index];

  if (!projectId) {
    return (
      <footer className="timeline-bar timeline-bar--empty">
        <span>Selecione um projeto para a timeline temporal</span>
      </footer>
    );
  }

  return (
    <footer className="timeline-bar">
      <div className="timeline-meta">
        <strong>Timeline</strong>
        {loading && <span className="timeline-hint">A carregar…</span>}
        {error && <span className="timeline-error">{error}</span>}
        {current && !loading && (
          <span className="timeline-date">{current.epoch_date}</span>
        )}
      </div>

      <div className="timeline-controls">
        <button
          type="button"
          disabled={!ready || sortedDates.length === 0}
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={Math.max(0, sortedDates.length - 1)}
          value={index}
          disabled={sortedDates.length === 0}
          onChange={(e) => onSlider(Number(e.target.value))}
        />
        {current && (
          <span className="timeline-stats">
            {current.displacement_count} pts · {current.insar_scenes} cenas
            {current.mean_displacement_mm != null &&
              ` · μ ${current.mean_displacement_mm.toFixed(1)} mm`}
          </span>
        )}
      </div>
    </footer>
  );
}
