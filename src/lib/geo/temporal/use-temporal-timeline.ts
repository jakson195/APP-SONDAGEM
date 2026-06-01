"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TemporalCompareMode, TemporalScene } from "./temporal-types";

const SPEED_OPTIONS = [
  { label: "0.5×", ms: 2000 },
  { label: "1×", ms: 1200 },
  { label: "2×", ms: 700 },
  { label: "4×", ms: 350 },
];

export function useTemporalTimeline(scenes: TemporalScene[]) {
  const epochs = useMemo(
    () =>
      [...new Set(scenes.map((s) => s.date))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [scenes],
  );

  const [mode, setMode] = useState<"playback" | "compare">("playback");
  const [compareMode, setCompareMode] = useState<TemporalCompareMode>("side_by_side");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [currentEpoch, setCurrentEpoch] = useState<string | null>(null);
  const [dateA, setDateA] = useState<string | null>(null);
  const [dateB, setDateB] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [index, setIndex] = useState(0);

  const playbackDates = useMemo(() => {
    const sel = epochs.filter((d) => selectedDates.has(d));
    return sel.length >= 2 ? sel : epochs;
  }, [epochs, selectedDates]);

  useEffect(() => {
    if (epochs.length === 0) {
      setCurrentEpoch(null);
      setDateA(null);
      setDateB(null);
      return;
    }
    setCurrentEpoch((prev) =>
      prev && epochs.includes(prev) ? prev : epochs[0]!,
    );
    setDateA((prev) => (prev && epochs.includes(prev) ? prev : epochs[0]!));
    setDateB((prev) =>
      prev && epochs.includes(prev) ? prev : epochs[epochs.length - 1]!,
    );
    setSelectedDates((prev) => {
      if (prev.size === 0) return new Set(epochs);
      const next = new Set([...prev].filter((d) => epochs.includes(d)));
      return next.size >= 2 ? next : new Set(epochs);
    });
  }, [epochs]);

  useEffect(() => {
    if (!playing || playbackDates.length === 0) return;
    const ms = SPEED_OPTIONS[speedIdx]?.ms ?? 1200;
    const t = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % playbackDates.length;
        setCurrentEpoch(playbackDates[next] ?? null);
        return next;
      });
    }, ms);
    return () => window.clearInterval(t);
  }, [playing, playbackDates, speedIdx]);

  const toggleDate = useCallback((d: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        if (next.size > 2) next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  }, []);

  const selectEpoch = useCallback(
    (d: string) => {
      setCurrentEpoch(d);
      const idx = playbackDates.indexOf(d);
      if (idx >= 0) setIndex(idx);
    },
    [playbackDates],
  );

  const stepPrev = useCallback(() => {
    if (playbackDates.length === 0) return;
    setIndex((i) => {
      const next = (i - 1 + playbackDates.length) % playbackDates.length;
      setCurrentEpoch(playbackDates[next] ?? null);
      return next;
    });
  }, [playbackDates]);

  const stepNext = useCallback(() => {
    if (playbackDates.length === 0) return;
    setIndex((i) => {
      const next = (i + 1) % playbackDates.length;
      setCurrentEpoch(playbackDates[next] ?? null);
      return next;
    });
  }, [playbackDates]);

  const exitCompare = useCallback(() => {
    setCompareMode("none");
  }, []);

  const sceneForDate = useCallback(
    (date: string | null) => {
      if (!date) return null;
      const matches = scenes.filter((s) => s.date === date && s.provider !== "srtm");
      if (matches.length === 0) {
        return scenes.find((s) => s.date === date) ?? null;
      }
      const y = Number(date.slice(0, 4));
      if (y >= 2015) {
        return (
          matches.find((s) => s.provider === "sentinel2") ??
          matches.find((s) => s.provider === "landsat") ??
          matches[0]
        );
      }
      if (y >= 1999) {
        return (
          matches.find((s) => s.provider === "cbers" || s.provider === "inpe") ??
          matches.find((s) => s.provider === "landsat") ??
          matches[0]
        );
      }
      return matches.find((s) => s.provider === "landsat") ?? matches[0]!;
    },
    [scenes],
  );

  return {
    epochs,
    mode,
    setMode,
    compareMode,
    setCompareMode,
    selectedDates,
    toggleDate,
    currentEpoch,
    selectEpoch,
    dateA,
    setDateA,
    dateB,
    setDateB,
    playing,
    setPlaying,
    speedIdx,
    setSpeedIdx,
    speedOptions: SPEED_OPTIONS,
    index,
    playbackDates,
    stepPrev,
    stepNext,
    exitCompare,
    sceneForDate,
    ready: epochs.length > 0,
  };
}
