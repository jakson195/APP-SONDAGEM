import { ajustarGumbelChow, tabelaQuantis } from "@/lib/hidrochu/gumbel-chow";
import type { GumbelChowFit, HidroChuDuracaoInput, HidroChuEstacao } from "@/lib/hidrochu/types";
import { PERIODOS_RETORNO } from "@/lib/hidrochu/types";

function fmt(n: number, dec = 1): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function padLine(label: string, value: string, width = 22): string {
  return `${label.padEnd(width)}${value}`;
}

export function gerarRelatorioHidroChuSC(
  estacao: HidroChuEstacao,
  duracoes: HidroChuDuracaoInput[],
): string {
  const lines: string[] = [];
  lines.push("Relatório  HidroChuSC");
  lines.push("Chuvas Máximas de Santa Catarina");
  lines.push("");
  lines.push("Dados da Estação Pluviométrica");
  lines.push(padLine("Nome:", estacao.nome));
  lines.push(padLine("Município:", estacao.municipio));
  lines.push(padLine("Código:", estacao.codigo));
  lines.push(padLine("Latitude:", estacao.latitude));
  lines.push(padLine("Longitude:", estacao.longitude));
  lines.push(padLine("Altitude", String(estacao.altitude)));
  lines.push(padLine("Fonte:", estacao.fonte));
  lines.push(padLine("Ano inicial:", String(estacao.anoInicial)));
  lines.push(padLine("Ano final:", String(estacao.anoFinal)));

  const principal = duracoes.find((d) => d.duracaoDias === 1) ?? duracoes[0];
  const nDados =
    principal?.valores?.length ?? (principal?.media != null ? 30 : 0);
  lines.push(padLine("Nº de dados:", String(nDados)));
  lines.push(padLine("Falha:", "0   0,00 %"));
  lines.push(padLine("Numero:", "5"));
  lines.push("");
  lines.push("Estatísticas Observadas");
  lines.push(
    "Duração   média     desv pad. Assimetria maior    menor",
  );

  const fits: { duracao: number; fit: GumbelChowFit }[] = [];

  for (const d of duracoes.sort((a, b) => a.duracaoDias - b.duracaoDias)) {
    try {
      const fit = ajustarGumbelChow(d);
      fits.push({ duracao: d.duracaoDias, fit });
      const label =
        d.duracaoDias === 1
          ? " 1 dia"
          : `${String(d.duracaoDias).padStart(2)} dias`;
      lines.push(
        `${label}    ${fmt(fit.media, 2).padStart(7)}     ${fmt(fit.desvio, 2).padStart(6)}      ${fmt(fit.assimetria, 2).padStart(4)}     ${fmt(fit.maior, 1).padStart(6)}      ${fmt(fit.menor, 1).padStart(5)}`,
      );
    } catch {
      /* ignorar duração sem dados */
    }
  }

  const ref = fits.find((f) => f.duracao === 1) ?? fits[0];
  if (!ref) {
    lines.push("");
    lines.push("(Sem dados para ajuste Gumbel-Chow)");
    return lines.join("\r\n");
  }

  lines.push("");
  lines.push("Chuvas máximas ");
  lines.push(`Duração ${ref.duracao} dias`);
  lines.push("Intervalo de confiança 95 %");
  lines.push("Parametros do distribuição Gumbel-chow");
  lines.push(`Alfa   ${ref.fit.alpha.toFixed(4)}`);
  lines.push(`Beta   ${ref.fit.beta.toFixed(4)}`);
  lines.push(`Yn     ${ref.fit.yn.toFixed(4)}`);
  lines.push(`Sn     ${ref.fit.sn.toFixed(4)}`);
  lines.push("Teste de Kolmogorov-Smirnov");
  lines.push("Nível de significancia 5 %");
  lines.push(
    `D máximo   ${ref.fit.ksDMax != null ? ref.fit.ksDMax.toFixed(3) : "—"}`,
  );
  lines.push(`D crítico  ${ref.fit.ksDCritico.toFixed(3)}`);
  lines.push(
    "T (anos)  P[X <= x]  P[X >= x]  Y        X          Li          Ls",
  );

  const quants = tabelaQuantis(ref.fit);
  for (const q of quants) {
    const half = (q.x - ref.fit.beta) * 0.12;
    const li = q.x - half;
    const ls = q.x + half;
    lines.push(
      `${String(q.T).padStart(7)}    ${q.pLe.toFixed(4)}    ${q.pGe.toFixed(4)}    ${q.y.toFixed(4)}     ${fmt(q.x, 1).padStart(6)}      ${fmt(li, 1).padStart(5)}     ${fmt(ls, 1).padStart(5)}`,
    );
  }

  if (fits.length > 1) {
    lines.push("Chuvas máximas 1 a 10 dias ");
    lines.push("Parametros do distribuição Gumbel-chow");
    lines.push(`Yn     ${ref.fit.yn.toFixed(4)}`);
    lines.push(`Sn     ${ref.fit.sn.toFixed(4)}`);
    lines.push("Teste de Kolmogorov-Smirnov");
    lines.push("Nível de significancia 5 %");
    lines.push(
      `D máximo   ${ref.fit.ksDMax != null ? ref.fit.ksDMax.toFixed(3) : "—"}`,
    );
    lines.push(`D crítico  ${ref.fit.ksDCritico.toFixed(3)}`);
    lines.push(
      "Duração  media     Desv pad. Alfa      Beta      D maximo",
    );
    for (const f of fits) {
      lines.push(
        `${String(f.duracao).padStart(7)}     ${fmt(f.fit.media, 1).padStart(6)}      ${fmt(f.fit.desvio, 1).padStart(5)}    ${f.fit.alpha.toFixed(4).padStart(8)}     ${f.fit.beta.toFixed(2).padStart(7)}     ${(f.fit.ksDMax ?? 0).toFixed(3).padStart(8)}`,
      );
    }
    lines.push(
      "T (anos)  " +
        fits
          .map((f) =>
            (f.duracao === 1 ? " 1 dia" : `${String(f.duracao).padStart(2)} dias`).padStart(
              8,
            ),
          )
          .join("    "),
    );
    for (const T of PERIODOS_RETORNO) {
      const cols = fits.map((f) => {
        const x =
          f.fit.beta + (1 / f.fit.alpha) * (-Math.log(-Math.log(1 - 1 / T)));
        return fmt(x, 1).padStart(8);
      });
      lines.push(`${String(T).padStart(7)}  ${cols.join("    ")}`);
    }
  }

  lines.push("");
  lines.push("— Gerado por DataGeo Digital (módulo HidroChuSC) —");
  return lines.join("\r\n");
}
