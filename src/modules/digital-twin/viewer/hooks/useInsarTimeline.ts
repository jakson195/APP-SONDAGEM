import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchTimeline } from "../api/client";
import { listInsarRasters } from "../api/insar";
import { useCesium } from "../context/CesiumContext";

export type TimelineMode = "playback" | "compare";

const SPEED_OPTIONS = [
  { label: "0.5×", ms: 800 },
  { label: "1×", ms: 1500 },
  { label: "2×", ms: 2500 },
  { label: "3×", ms: 4000 },
] as const;

export function useInsarTimeline(projectId: string | null) {
  const { layerManager, ready, currentEpoch, setCurrentEpoch } = useCesium();
  const [mode, setMode] = useState<TimelineMode>("playback");
  const [epochs, setEpochs] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareActive, setCompareActive] = useState(false);

  const playbackDates = useMemo(() => {
    const sorted = [...selectedDates].sort();
    return sorted.length > 0 ? sorted : epochs;
  }, [selectedDates, epochs]);

  const loadEpochs = useCallback(async () => {
    if (!projectId) {
      setEpochs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fromApi = await listInsarRasters(projectId, undefined, "displacement");
      const apiDates = fromApi.items
        .map((r) => r.epoch_date)
        .filter((d): d is string => Boolean(d));
      let merged = [...new Set(apiDates)];
      try {
        const tl = await fetchTimeline(projectId);
        const tlDates = tl.epochs.map((e) => e.epoch_date);
        merged = [...new Set([...merged, ...tlDates])].sort();
      } catch {
        /* timeline API opcional */
      }
      const fromLayers = layerManager?.getInsarDisplacementEpochs() ?? [];
      merged = [...new Set([...merged, ...fromLayers])].sort();
      setEpochs(merged);
      setSelectedDates(new Set(merged));
      if (merged.length > 0) {
        setIndex(merged.length - 1);
        setCompareA(merged[0]);
        setCompareB(merged[merged.length - 1]);
        if (mode === "playback") {
          setCurrentEpoch(merged[merged.length - 1]);
        }
      }
    } catch {
      setError("Não foi possível carregar épocas InSAR");
    } finally {
      setLoading(false);
    }
  }, [projectId, layerManager, mode, setCurrentEpoch]);

  useEffect(() => {
    void loadEpochs();
  }, [loadEpochs]);

  useEffect(() => {
    layerManager?.setPlaybackDates(playbackDates);
  }, [layerManager, playbackDates]);

  useEffect(() => {
    if (mode !== "playback") {
      setPlaying(false);
      return;
    }
    layerManager?.clearCompare();
    if (!playing || playbackDates.length === 0) return;
    const ms = SPEED_OPTIONS[speedIdx]?.ms ?? 1500;
    const timer = window.setInterval(() => {
      setIndex((i) => {
        const next = i >= playbackDates.length - 1 ? 0 : i + 1;
        setCurrentEpoch(playbackDates[next]);
        return next;
      });
    }, ms);
    return () => window.clearInterval(timer);
  }, [playing, playbackDates, speedIdx, mode, setCurrentEpoch, layerManager]);

  const selectEpoch = useCallback(
    (date: string) => {
      const i = playbackDates.indexOf(date);
      if (i >= 0) setIndex(i);
      setCurrentEpoch(date);
      setMode("playback");
      layerManager?.clearCompare();
    },
    [playbackDates, setCurrentEpoch, layerManager],
  );

  const toggleDate = useCallback((date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        if (next.size > 1) next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const stepPrev = useCallback(() => {
    if (playbackDates.length === 0) return;
    const i = index <= 0 ? playbackDates.length - 1 : index - 1;
    setIndex(i);
    setCurrentEpoch(playbackDates[i]);
  }, [index, playbackDates, setCurrentEpoch]);

  const stepNext = useCallback(() => {
    if (playbackDates.length === 0) return;
    const i = index >= playbackDates.length - 1 ? 0 : index + 1;
    setIndex(i);
    setCurrentEpoch(playbackDates[i]);
  }, [index, playbackDates, setCurrentEpoch]);

  const runCompare = useCallback(async () => {
    if (!layerManager || !compareA || !compareB) return;
    setMode("compare");
    setPlaying(false);
    await layerManager.setComparePeriods(compareA, compareB);
    setCompareActive(true);
  }, [layerManager, compareA, compareB]);

  const exitCompare = useCallback(() => {
    layerManager?.clearCompare();
    setMode("playback");
    setCompareActive(false);
    if (playbackDates.length > 0) {
      setCurrentEpoch(playbackDates[index]);
    }
  }, [layerManager, playbackDates, index, setCurrentEpoch]);

  return {
    ready,
    mode,
    setMode,
    epochs,
    playbackDates,
    selectedDates,
    toggleDate,
    index,
    currentEpoch,
    selectEpoch,
    playing,
    setPlaying,
    speedIdx,
    setSpeedIdx,
    speedOptions: SPEED_OPTIONS,
    stepPrev,
    stepNext,
    compareA,
    setCompareA,
    compareB,
    setCompareB,
    runCompare,
    exitCompare,
    compareActive,
    loading,
    error,
    reload: loadEpochs,
  };
}
