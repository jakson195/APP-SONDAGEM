import { NextResponse } from "next/server";
import { fetchAnaSerieHistorica } from "@/lib/hidrochu-br/ana-telemetria";
import { parseAnaCsv } from "@/lib/hidrochu-br/parse-ana-csv";
import { maximasAnuaisPrecipitacao } from "@/lib/hidrochu-br/daily-series";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      codEstacao?: string;
      dataInicio?: string;
      dataFim?: string;
      tipoDados?: "1" | "2" | "3";
      csvText?: string;
    };

    const cod = body.codEstacao?.trim();
    if (!cod) {
      return NextResponse.json({ error: "codEstacao obrigatório" }, { status: 400 });
    }

    if (body.csvText?.trim()) {
      const registros = parseAnaCsv(body.csvText, cod);
      const maximas = maximasAnuaisPrecipitacao(registros);
      return NextResponse.json({
        fonte: "CSV",
        registros,
        total: registros.length,
        maximasAnuais: maximas,
      });
    }

    const hoje = new Date();
    const fim = body.dataFim ?? hoje.toISOString().slice(0, 10);
    const ini =
      body.dataInicio ??
      new Date(hoje.getFullYear() - 10, 0, 1).toISOString().slice(0, 10);

    const { registros, aviso, raw } = await fetchAnaSerieHistorica({
      codEstacao: cod,
      dataInicio: ini,
      dataFim: fim,
      tipoDados: body.tipoDados ?? "2",
    });

    const maximas = maximasAnuaisPrecipitacao(registros);

    return NextResponse.json({
      fonte: "ANA-TelemetriaWS",
      registros,
      total: registros.length,
      maximasAnuais: maximas,
      aviso,
      rawPreview: raw,
      periodo: { dataInicio: ini, dataFim: fim },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na importação ANA" },
      { status: 500 },
    );
  }
}
