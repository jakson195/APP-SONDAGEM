import { useRef, useState, type ChangeEvent } from "react";

import {
  pollLasUntilDone,
  resolveTilesetUrl,
  uploadLas,
  type LasStatusResult,
} from "../../api/las";
import { useCesium } from "../../context/CesiumContext";

interface Props {
  projectId: string | null;
}

export function LasUploadPanel({ projectId }: Props) {
  const { layerManager, ready } = useCesium();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId || !layerManager) return;

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".las") && !ext.endsWith(".laz")) {
      setError("Selecione um ficheiro .las ou .laz");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage("A enviar ficheiro…");
    setProgress(5);

    try {
      const uploaded = await uploadLas(projectId, file, {
        name: name.trim() || file.name,
      });
      setMessage(uploaded.processing.message || "A processar com PDAL…");
      setProgress(15);

      const finalStatus = await pollLasUntilDone(
        projectId,
        uploaded.terrain_model_id,
        (tick: LasStatusResult) => {
          setProgress(Math.max(15, tick.processing.progress));
          setMessage(tick.processing.message || tick.processing.status);
        },
      );

      const tilesetPath =
        finalStatus.tileset_url ?? finalStatus.processing.tileset_url;
      if (!tilesetPath) {
        throw new Error("Tileset não gerado");
      }

      const url = resolveTilesetUrl(tilesetPath);
      await layerManager.addPointCloudTileset(
        name.trim() || file.name,
        url,
        true,
      );

      const pts = finalStatus.processing.point_count;
      setMessage(
        pts != null
          ? `Nuvem carregada (${pts.toLocaleString()} pontos)`
          : "Nuvem de pontos carregada no viewer",
      );
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload LAS");
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="las-upload-panel">
      <h3>Upload LAS / LAZ</h3>
      <p className="las-hint">PDAL → 3D Tiles → Cesium (nuvem de pontos)</p>

      <input
        ref={inputRef}
        type="file"
        accept=".las,.laz"
        hidden
        onChange={(ev) => void onFile(ev)}
      />

      <label className="las-name-label">
        Nome
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Opcional"
          disabled={busy}
        />
      </label>

      <button
        type="button"
        className="btn-primary las-upload-btn"
        disabled={!ready || !projectId || busy}
        onClick={onPick}
      >
        {busy ? "A processar…" : "Selecionar LAS/LAZ"}
      </button>

      {busy && (
        <>
          <div className="las-progress">
            <div className="las-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          {message && <p className="las-status-msg">{message}</p>}
        </>
      )}

      {!busy && message && <p className="las-ok">{message}</p>}
      {error && <p className="las-error">{error}</p>}
    </section>
  );
}
