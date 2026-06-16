import { create } from "zustand";
import type { LeilaoCategoriaToggleKey, LeilaoCategoriaToggles } from "../layers/leilao";
import { DEFAULT_LEILAO_CATEGORIAS } from "../layers/leilao";

type LeilaoState = {
  ufs: string[];
  rodadas: number[];
  categorias: LeilaoCategoriaToggles;
  dataInicio: string;
  dataFim: string;
  substancia: string;
  importStatus: string | null;
  setUfs: (ufs: string[]) => void;
  toggleRodada: (r: number) => void;
  setRodadas: (r: number[]) => void;
  toggleCategoria: (c: LeilaoCategoriaToggleKey) => void;
  setDataInicio: (d: string) => void;
  setDataFim: (d: string) => void;
  setSubstancia: (s: string) => void;
  setImportStatus: (s: string | null) => void;
};

export const useLeilaoStore = create<LeilaoState>((set, get) => ({
  ufs: ["MG"],
  rodadas: [],
  categorias: { ...DEFAULT_LEILAO_CATEGORIAS },
  dataInicio: "",
  dataFim: "",
  substancia: "",
  importStatus: null,
  setUfs: (ufs) => set({ ufs }),
  toggleRodada: (r) => {
    const cur = get().rodadas;
    set({ rodadas: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] });
  },
  setRodadas: (rodadas) => set({ rodadas }),
  toggleCategoria: (c) => {
    const cur = get().categorias;
    set({ categorias: { ...cur, [c]: !cur[c] } });
  },
  setDataInicio: (dataInicio) => set({ dataInicio }),
  setDataFim: (dataFim) => set({ dataFim }),
  setSubstancia: (substancia) => set({ substancia }),
  setImportStatus: (importStatus) => set({ importStatus }),
}));
