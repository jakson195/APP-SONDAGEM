import { useEffect } from "react";
import { useLayerStore } from "../store/layerStore";

/** Inicializa só a camada ANM leilão — sem catálogo /layers do HidroGeo. */
export function useAnmLeilaoBootstrap() {
  const applyLeilaoOnlyLayers = useLayerStore((s) => s.applyLeilaoOnlyLayers);
  const setVisible = useLayerStore((s) => s.setVisible);

  useEffect(() => {
    applyLeilaoOnlyLayers();
    setVisible("mining_leilao_areas", true);
  }, [applyLeilaoOnlyLayers, setVisible]);
}
