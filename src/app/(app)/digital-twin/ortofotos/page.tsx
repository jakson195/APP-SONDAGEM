import { Image } from "lucide-react";
import { DigitalTwinSectionPage } from "@/components/digital-twin/section-page";
import { getDigitalTwinOrthoUrl } from "@/lib/digital-twin-url";

export default function DigitalTwinOrtofotosPage() {
  return (
    <DigitalTwinSectionPage
      title="Ortofotos"
      description="Comparação temporal T0/T1 com heatmap de mudanças, pontos de risco e slider before/after."
      icon={Image}
      viewerUrl={getDigitalTwinOrthoUrl()}
      embedViewer
    />
  );
}
