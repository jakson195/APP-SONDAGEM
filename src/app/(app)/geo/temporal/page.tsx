import { TemporalImageryClient } from "./temporal-imagery-client";

export const metadata = {
  title: "Imagens históricas — DataGeo Digital",
  description:
    "Timeline temporal, índices espectrais, comparação de datas, heatmap e IA para alterações geológicas.",
};

export default function TemporalImageryPage() {
  return <TemporalImageryClient />;
}
