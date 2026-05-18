import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Viewer } from "cesium";

import type { LayerManager } from "../cesium/LayerManager";
import type { FlyToTarget } from "../cesium/types";
import { flyToPosition } from "../cesium/flyTo";

interface CesiumContextValue {
  viewer: Viewer | null;
  layerManager: LayerManager | null;
  ready: boolean;
  setViewer: (viewer: Viewer | null, manager: LayerManager | null) => void;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  currentEpoch: string | null;
  setCurrentEpoch: (epoch: string | null) => void;
  flyTo: (target: FlyToTarget) => void;
}

const CesiumContext = createContext<CesiumContextValue | null>(null);

export function CesiumProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewerState] = useState<Viewer | null>(null);
  const [layerManager, setLayerManager] = useState<LayerManager | null>(null);
  const [ready, setReady] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<string | null>(null);

  const setViewer = useCallback(
    (v: Viewer | null, manager: LayerManager | null) => {
      setViewerState(v);
      setLayerManager(manager);
      setReady(v != null && manager != null);
    },
    [],
  );

  const flyTo = useCallback(
    (target: FlyToTarget) => {
      if (viewer) flyToPosition(viewer, target);
    },
    [viewer],
  );

  const setEpoch = useCallback(
    (epoch: string | null) => {
      setCurrentEpoch(epoch);
      layerManager?.setCurrentEpoch(epoch);
    },
    [layerManager],
  );

  const value = useMemo(
    () => ({
      viewer,
      layerManager,
      ready,
      setViewer,
      projectId,
      setProjectId,
      currentEpoch,
      setCurrentEpoch: setEpoch,
      flyTo,
    }),
    [
      viewer,
      layerManager,
      ready,
      setViewer,
      projectId,
      currentEpoch,
      setEpoch,
      flyTo,
    ],
  );

  return (
    <CesiumContext.Provider value={value}>{children}</CesiumContext.Provider>
  );
}

export function useCesium(): CesiumContextValue {
  const ctx = useContext(CesiumContext);
  if (!ctx) throw new Error("useCesium deve estar dentro de CesiumProvider");
  return ctx;
}
