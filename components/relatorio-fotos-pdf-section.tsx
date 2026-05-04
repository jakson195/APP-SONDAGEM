import type { CSSProperties } from "react";

type Props = {
  fotos: string[];
  border?: string;
  titulo?: string;
};

/**
 * Grelha de fotos para html2canvas / PDF (data URLs).
 */
export function RelatorioFotosPdfSection({
  fotos,
  border = "2px solid #000000",
  titulo = "Registo fotográfico de campo",
}: Props) {
  if (!fotos.length) return null;

  const wrap: CSSProperties = {
    marginTop: "8px",
    border,
    padding: "8px",
    backgroundColor: "#ffffff",
    position: "relative",
    zIndex: 1,
  };

  const title: CSSProperties = {
    fontWeight: 700,
    fontSize: "8px",
    textAlign: "center",
    marginBottom: "8px",
    color: "#000000",
  };

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "6px",
  };

  const cell: CSSProperties = {
    border,
    padding: "2px",
    backgroundColor: "#fafafa",
    minHeight: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const imgStyle: CSSProperties = {
    width: "100%",
    maxHeight: "160px",
    height: "auto",
    objectFit: "cover" as const,
    display: "block",
  };

  return (
    <div data-spt-pdf-fotos-wrap style={wrap}>
      <div style={title}>{titulo}</div>
      <div style={grid}>
        {fotos.map((src, i) => (
          <div key={i} style={cell}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-spt-pdf-foto
              src={src}
              alt=""
              style={imgStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
