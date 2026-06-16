"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ANM_LEILAO_VIEWER_READY } from "@/lib/anm-leilao-viewer-ready";

type Status = "checking" | "loading" | "ready" | "failed";

/** Iframe viewer ANM Leilão — independente do HidroGeo. */
export function useAnmLeilaoIframeReady(viewerUrl: string) {
  const [status, setStatus] = useState<Status>("checking");
  const [slowHint, setSlowHint] = useState(false);
  const readyRef = useRef(false);

  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setStatus("ready");
    setSlowHint(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setStatus("checking");
    setSlowHint(false);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === ANM_LEILAO_VIEWER_READY) markReady();
    };
    window.addEventListener("message", onMessage);

    const slowId = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) setSlowHint(true);
    }, 25_000);

    const forceReadyId = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) markReady();
    }, 12_000);

    void (async () => {
      const isExternal =
        viewerUrl.startsWith("http://") || viewerUrl.startsWith("https://");
      if (isExternal) {
        if (!cancelled) setStatus("loading");
        return;
      }
      try {
        const res = await fetch(viewerUrl, { method: "GET", cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setStatus("failed");
          return;
        }
        const html = await res.text();
        if (!html.includes('id="root"')) {
          setStatus("failed");
        } else {
          setStatus("loading");
        }
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(slowId);
      window.clearTimeout(forceReadyId);
    };
  }, [viewerUrl, markReady]);

  const onIframeLoad = useCallback(() => {
    markReady();
  }, [markReady]);

  return { status, slowHint, onIframeLoad };
}
