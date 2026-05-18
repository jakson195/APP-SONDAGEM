import {
  DigitalTwinSectionPage,
  digitalTwinViewerUrl,
} from "@/components/digital-twin/section-page";
import { digitalTwinSection } from "@/lib/digital-twin-page";

export default function DigitalTwinModelos3dPage() {
  const s = digitalTwinSection("modelos-3d");
  return (
    <DigitalTwinSectionPage
      title={s.label}
      description={s.description ?? ""}
      icon={s.icon}
      viewerUrl={digitalTwinViewerUrl()}
    />
  );
}
