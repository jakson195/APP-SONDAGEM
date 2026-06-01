import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buscarEstacoes } from "@/lib/hidrochu-br/estacoes-catalog";
import type { CatalogoBrasil } from "@/lib/hidrochu-br/estacoes-catalog";

async function loadCatalog(): Promise<CatalogoBrasil> {
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uf = searchParams.get("uf") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const tipo = searchParams.get("tipo") as
    | "Pluviometrica"
    | "Fluviometrica"
    | "Mista"
    | null;

  try {
    const cat = await loadCatalog();
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
