export type ToolbarProps = {
  onNovoFuro?: () => void;
  onMedir?: () => void;
  onLocalizacao?: () => void;
  onImportarMapa?: () => void;
  onExportarPontos?: () => void;
};

export default function Toolbar({
  onNovoFuro,
  onMedir,
  onLocalizacao,
  onImportarMapa,
  onExportarPontos,
}: ToolbarProps) {
  const btnClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-left text-sm text-[var(--text)] shadow-sm transition hover:bg-[var(--muted)]/15";

  return (
    <div
      className="absolute left-2.5 top-2.5 z-[1000] flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-white p-2.5 shadow-md"
      role="toolbar"
      aria-label="Ferramentas do mapa"
    >
      <button type="button" className={btnClass} onClick={onNovoFuro}>
        📍 Novo Furo
      </button>
      <button type="button" className={btnClass} onClick={onMedir}>
        📏 Medir
      </button>
      <button type="button" className={btnClass} onClick={onLocalizacao}>
        📡 Minha localização
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={onImportarMapa}
        title="PDF/TIFF georreferenciado ou KML/KMZ"
      >
        🗺️ Importar mapa (PDF / TIFF / KML / KMZ)
      </button>
      <button type="button" className={btnClass} onClick={onExportarPontos}>
        ⬇️ Exportar pontos (KML / KMZ)
      </button>
    </div>
  );
}
