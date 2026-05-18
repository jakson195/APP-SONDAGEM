"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiUrl } from "@/lib/api-url";
import type { ModuloProjetoChave } from "@/lib/modulos-projeto";

const STORAGE_KEY = "soilsul:obraContextId";

type ObraModulosCtx = {
  selectedObraId: number | null;
  obraNome: string | null;
  modules: Record<ModuloProjetoChave, boolean> | null;
  modulesLoading: boolean;
  setObraContext: (id: number | null) => void;
  refreshObraModules: () => Promise<void>;
};

const ObraModulosContext = createContext<ObraModulosCtx | null>(null);

export function ObraModulosProvider({ children }: { children: React.ReactNode }) {
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [obraNome, setObraNome] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<
    ModuloProjetoChave,
    boolean
  > | null>(null);
  const [modulesLoading, setModulesLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null || raw === "") {
        setSelectedObraId(null);
        return;
      }
      const n = Number(raw);
      setSelectedObraId(Number.isFinite(n) ? n : null);
    } catch {
      setSelectedObraId(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  const setObraContext = useCallback((id: number | null) => {
    setSelectedObraId(id);
    try {
      if (id == null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (selectedObraId == null) {
      setObraNome(null);
      setModules(null);
      setModulesLoading(false);
      return;
    }

    let cancelled = false;
    setModulesLoading(true);

    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/obra/${selectedObraId}/modulos`), {
          credentials: "include",
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          nome?: string;
          modules?: Record<string, boolean>;
        };
        if (cancelled) return;
        if (!r.ok) {
          setObraNome(null);
          setModules(null);
          return;
        }
        setObraNome(typeof data.nome === "string" ? data.nome : null);
        const m = data.modules;
        if (m && typeof m === "object") {
          setModules(m as Record<ModuloProjetoChave, boolean>);
        } else {
          setModules(null);
        }
      } catch {
        if (!cancelled) {
          setObraNome(null);
          setModules(null);
        }
      } finally {
        if (!cancelled) setModulesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, selectedObraId]);

  const refreshObraModules = useCallback(async () => {
    if (selectedObraId == null) return;
    setModulesLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/obra/${selectedObraId}/modulos`), {
        credentials: "include",
      });
      const data = (await r.json().catch(() => ({}))) as {
        nome?: string;
        modules?: Record<string, boolean>;
      };
      if (!r.ok) return;
      setObraNome(typeof data.nome === "string" ? data.nome : null);
      const m = data.modules;
      if (m && typeof m === "object") {
        setModules(m as Record<ModuloProjetoChave, boolean>);
      }
    } finally {
      setModulesLoading(false);
    }
  }, [selectedObraId]);

  const value = useMemo(
    () => ({
      selectedObraId,
      obraNome,
      modules,
      modulesLoading,
      setObraContext,
      refreshObraModules,
    }),
    [
      selectedObraId,
      obraNome,
      modules,
      modulesLoading,
      setObraContext,
      refreshObraModules,
    ],
  );

  return (
    <ObraModulosContext.Provider value={value}>
      {children}
    </ObraModulosContext.Provider>
  );
}

export function useObraModulos() {
  const ctx = useContext(ObraModulosContext);
  if (!ctx) {
    throw new Error("useObraModulos must be used within ObraModulosProvider");
  }
  return ctx;
}
