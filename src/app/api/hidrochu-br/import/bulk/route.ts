import { NextResponse } from "next/server";
import { fetchInventarioAna } from "@/lib/hidrochu-br/ana-inventario";
import { bulkImportEstacoes } from "@/lib/hidrochu-br/bulk-import";
import { buscarEstacoes } from "@/lib/hidrochu-br/estacoes-catalog";
import type { EstacaoBrasil, FonteHidrologica } from "@/lib/hidrochu-br/types";
import { readFile } from "fs/promises";
import path from "path";

async function loadSeedEstacoes(uf?: string) {
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "hidrochu-br",
    "estacoes-brasil-seed.json",
  );
  const cat = JSON.parse(await readFile(p, "utf8")) as { estacoes: EstacaoBrasil[] };
  return buscarEstacoes(
    { version: 1, atualizado: "", fonte: "seed", estacoes: cat.estacoes },
    { uf },
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      ufs?: string[];
      uf?: string;
      fonteCatalogo?: "seed" | "ana";
      tipo?: "Pluviometrica" | "Fluviometrica";
      telemetrica?: "0" | "1";
      dataInicio?: string;
      dataFim?: string;
      fonte?: FonteHidrologica;
      maxEstacoes?: number;
      codigos?: string[];
    };

    const hoje = new Date();
    const dataFim = body.dataFim ?? hoje.toISOString().slice(0, 10);
    const dataInicio =
      body.dataInicio ??
      new Date(hoje.getFullYear() - 5, 0, 1).toISOString().slice(0, 10);

    let estacoes: EstacaoBrasil[] = [];

    if (body.codigos?.length) {
      const all = await loadSeedEstacoes();
      const set = new Set(body.codigos.map((c) => c.padStart(8, "0").slice(-8)));
      estacoes = all.filter((e) => set.has(e.codigo));
      for (const c of body.codigos) {
        const cod = c.padStart(8, "0").slice(-8);
        if (!estacoes.some((e) => e.codigo === cod)) {
          estacoes.push({
            codigo: cod,
            nome: cod,
            uf: body.uf ?? "BR",
            municipio: "",
            tipo: "Pluviometrica",
            latitude: 0,
            longitude: 0,
            fonte: "ANA",
          });
        }
      }
    } else {
      const ufs = body.ufs?.length ? body.ufs : body.uf ? [body.uf] : ["SC"];
      for (const uf of ufs) {
        if (body.fonteCatalogo === "ana") {
          const tp =
            body.tipo === "Fluviometrica"
              ? "1"
              : body.tipo === "Pluviometrica"
                ? "2"
                : undefined;
          const inv = await fetchInventarioAna({
            uf,
            tipoEstacao: tp,
            telemetrica: body.telemetrica,
          });
          estacoes.push(...inv.estacoes);
        } else {
          estacoes.push(...(await loadSeedEstacoes(uf)));
        }
      }
    }

    if (!estacoes.length) {
      return NextResponse.json(
        { error: "Nenhuma estação encontrada para importação." },
        { status: 400 },
      );
    }

    const result = await bulkImportEstacoes({
      estacoes,
      dataInicio,
      dataFim,
      fonte: body.fonte ?? "ANA",
      maxEstacoes: body.maxEstacoes ?? 15,
      pausaMs: 350,
    });

    return NextResponse.json({
      ...result,
      periodo: { dataInicio, dataFim },
      importadoEm: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na importação em lote" },
      { status: 500 },
    );
  }
}
