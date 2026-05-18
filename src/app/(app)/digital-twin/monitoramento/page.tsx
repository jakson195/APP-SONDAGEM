import {
  DigitalTwinSectionPage,
  digitalTwinViewerUrl,
} from "@/components/digital-twin/section-page";
import { digitalTwinSection } from "@/lib/digital-twin-page";

export default function DigitalTwinMonitoramentoPage() {
  const s = digitalTwinSection("monitoramento");
  return (
    <DigitalTwinSectionPage
      title={s.label}
      description={s.description ?? ""}
      icon={s.icon}
      viewerUrl={digitalTwinViewerUrl()}
    />
  );
}
