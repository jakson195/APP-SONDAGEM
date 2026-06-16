import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { fetchInventarioAna } from "@/lib/hidrochu-br/ana-inventario";
import { buscarEstacoes } from "@/lib/hidrochu-br/estacoes-catalog";
import type { CatalogoBrasil } from "@/lib/hidrochu-br/estacoes-catalog";
import type { EstacaoBrasil } from "@/lib/hidrochu-br/types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "hidrochu-br");
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

async function loadSeed(): Promise<CatalogoBrasil> {
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "hidrochu-br",
    "estacoes-brasil-seed.json",
  );
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as CatalogoBrasil;
}

async function loadAnaCache(uf: string): Promise<EstacaoBrasil[] | null> {
  try {
    const p = path.join(CACHE_DIR, `inventario-${uf.toUpperCase()}.json`);
    const raw = await readFile(p, "utf8");
    const data = JSON.parse(raw) as { at: number; estacoes: EstacaoBrasil[] };
    if (Date.now() - data.at > CACHE_TTL_MS) return null;
    return data.estacoes;
  } catch {
    return null;
  }
}

async function saveAnaCache(uf: string, estacoes: EstacaoBrasil[]) {
  await mkdir(CACHE_DIR, { recursive: true });
  const p = path.join(CACHE_DIR, `inventario-${uf.toUpperCase()}.json`);
  await writeFile(p, JSON.stringify({ at: Date.now(), estacoes }), "utf8");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uf = searchParams.get("uf") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const tipo = searchParams.get("tipo") as
    | "Pluviometrica"
    | "Fluviometrica"
    | "Mista"
    | null;
  const fonte = searchParams.get("fonte") ?? "seed";
  const refresh = searchParams.get("refresh") === "1";
  const telemetrica = searchParams.get("telemetrica") as "0" | "1" | null;

  try {
    if (fonte === "ana" && uf) {
      let estacoes = refresh ? null : await loadAnaCache(uf);
      let aviso: string | undefined;

      if (!estacoes) {
        const tp =
          tipo === "Fluviometrica" ? "1" : tipo === "Pluviometrica" ? "2" : undefined;
        const inv = await fetchInventarioAna({
          uf,
          tipoEstacao: tp,
          telemetrica: telemetrica ?? undefined,
        });
        estacoes = inv.estacoes;
        aviso = inv.aviso;
        if (estacoes.length) await saveAnaCache(uf, estacoes);
      }

      if (q?.trim()) {
        const qq = q.trim().toLowerCase();
        estacoes = estacoes.filter(
          (e) =>
            e.nome.toLowerCase().includes(qq) ||
            e.municipio.toLowerCase().includes(qq) ||
            e.codigo.includes(qq),
        );
      }

      return NextResponse.json({
        total: estacoes.length,
        catalogoTotal: estacoes.length,
        fonte: "ANA HidroInventario",
        uf,
        aviso,
        estacoes,
      });
    }

    const cat = await loadSeed();
    const estacoes = buscarEstacoes(cat, {
      uf: uf || undefined,
      q: q || undefined,
      tipo: tipo ?? undefined,
    });
    return NextResponse.json({
      total: estacoes.length,
      catalogoTotal: cat.estacoes.length,
      fonte: cat.fonte,
      estacoes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao carregar catálogo" },
      { status: 500 },
    );
  }
}
