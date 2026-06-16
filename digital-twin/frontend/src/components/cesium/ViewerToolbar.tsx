import { useCesium } from "../../context/CesiumContext";
import { flyToProject } from "../../cesium/flyTo";
import type { ProjectSummary } from "../../api/types";

interface Props {
  project: ProjectSummary | null;
}

export function ViewerToolbar({ project }: Props) {
  const { viewer, ready, flyTo } = useCesium();

  const goHome = () => {
    if (!viewer || !project) return;
    flyToProject(viewer, project);
  };

  const goDemo = () => {
    flyTo({
      longitude: -47.75,
      latitude: -15.75,
      height: 18000,
      pitch: -50,
    });
  };

  return (
    <div className="viewer-toolbar">
      <button type="button" disabled={!ready} onClick={goHome} title="Fly to projeto">
        Projeto
      </button>
      <button type="button" disabled={!ready} onClick={goDemo} title="Fly to área demo">
        Demo
      </button>
    </div>
  );
}
