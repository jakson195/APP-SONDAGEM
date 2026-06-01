import { NextResponse } from "next/server";
import { preverEnchente } from "@/lib/hidrochu-br/flood-predict";
import type {
  ContextoEnchenteInformado,
  EstacaoBrasil,
  RegistroDiarioBr,
} from "@/lib/hidrochu-br/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      estacao: EstacaoBrasil;
      serieDiaria: RegistroDiarioBr[];
      p1diaTr10Mm?: number;
      i1hTr10MmH?: number;
      contexto?: ContextoEnchenteInformado;
    };

    if (!body.estacao || !Array.isArray(body.serieDiaria)) {
      return NextResponse.json(
        { error: "estacao e serieDiaria são obrigatórios" },
        { status: 400 },
      );
    }

    if (body.serieDiaria.length < 3) {
      return NextResponse.json(
        { error: "Mínimo 3 registos diários para previsão" },
        { status: 400 },
      );
    }

    const result = preverEnchente({
      estacao: body.estacao,
      serieDiaria: body.serieDiaria,
      p1diaTr10Mm: body.p1diaTr10Mm,
      i1hTr10MmH: body.i1hTr10MmH,
      contexto: body.contexto,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro na previsão" },
      { status: 500 },
    );
  }
}
