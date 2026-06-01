import { NextResponse } from "next/server";
import { autoImportFromSource } from "@/lib/hidrochu-br/auto-import";
import type { EstacaoBrasil, FonteHidrologica } from "@/lib/hidrochu-br/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      estacao?: EstacaoBrasil;
      fonte?: FonteHidrologica;
      dataInicio?: string;
      dataFim?: string;
      codEstacao?: string;
      uf?: string;
    };

    if (!body.estacao?.codigo && !body.codEstacao) {
      return NextResponse.json(
        { error: "estacao ou codEstacao obrigatório" },
        { status: 400 },
      );
    }

    const hoje = new Date();
    const dataFim = body.dataFim ?? hoje.toISOString().slice(0, 10);
    const dataInicio =
      body.dataInicio ??
      new Date(hoje.getFullYear() - 10, 0, 1).toISOString().slice(0, 10);

    let estacao = body.estacao;
    if (!estacao && body.codEstacao) {
      estacao = {
        codigo: body.codEstacao,
        nome: body.codEstacao,
        uf: body.uf ?? "BR",
        municipio: "",
        tipo: "Pluviometrica",
        latitude: 0,
        longitude: 0,
        fonte: body.fonte ?? "ANA",
      };
    }

    const result = await autoImportFromSource({
      estacao: estacao!,
      fonte: body.fonte,
      dataInicio,
      dataFim,
    });

    return NextResponse.json({
      ...result,
      periodo: { dataInicio, dataFim },
      importadoEm: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na importação automática" },
      { status: 500 },
    );
  }
}
