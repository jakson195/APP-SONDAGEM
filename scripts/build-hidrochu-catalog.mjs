import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfText = path.resolve(
  __dirname,
  "../../../Users/jakso/.cursor/projects/c-VISION-APP-SONDAGEM/agent-tools/b7c138e7-64c1-4c2a-b45e-693cb3809a00.txt",
);
const altPdf = path.resolve(__dirname, "../public/data/hidrochu/epagri-source.txt");

const src = fs.existsSync(pdfText) ? pdfText : altPdf;
if (!fs.existsSync(src)) {
  console.error("Fonte EPAGRI não encontrada:", src);
  process.exit(1);
}

const raw = fs.readFileSync(src, "utf8");
const start = raw.indexOf("Abdon Batista");
const end = raw.indexOf("Conclusões");
const block = start >= 0 && end > start ? raw.slice(start, end) : raw;

const re = /([A-Za-zÀ-ÿ\.\s']+?)\s+(\d+,\d+)\s+(\d+,\d+)/g;
const out = [];
let m;
while ((m = re.exec(block)) !== null) {
  const nome = m[1].trim().replace(/\s+/g, " ");
  const p1dia10 = parseFloat(m[2].replace(",", "."));
  const i15_10 = parseFloat(m[3].replace(",", "."));
  if (nome.length < 3 || /mm|h-1|Tabela/i.test(nome)) continue;
  out.push({ nome, p1dia10, i15_10 });
}

const byName = new Map();
for (const r of out) byName.set(r.nome, r);
const municipios = [...byName.values()].sort((a, b) =>
  a.nome.localeCompare(b.nome, "pt-BR"),
);

const catalog = {
  fonte: "EPAGRI/HidroChuSC — Back et al. (2021) Agropecuária Catarinense 34(2)",
  referencia:
    "Chuvas intensas para projetos de conservação do solo e da água no estado de Santa Catarina",
  periodoRetorno: 10,
  idfRegional: {
    curta: { K: 944.88, m: 0.192, b: 8.92, n: 0.698, limiteMin: 120 },
    longa: { K: 1380.95, m: 0.192, b: 11.68, n: 0.773, limiteMin: 1440 },
    nota: "Coeficientes regionais SC (HidroChuSC / relatórios exportados)",
  },
  totalMunicipios: municipios.length,
  municipios,
};

const outDir = path.resolve(__dirname, "../public/data/hidrochu");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "hidrochu-municipios-sc.json");
fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2), "utf8");
console.log("Escrito", outFile, "—", municipios.length, "municípios");
