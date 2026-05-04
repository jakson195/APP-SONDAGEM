/** Ponto WGS84 para exportação Avenza / GIS. */
export type FieldPlacemark = {
  name: string;
  description?: string;
  lat: number;
  lng: number;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Nome de ficheiro seguro (ASCII). */
export function slugFieldExport(nomeObra: string, obraId: number): string {
  const base = nomeObra
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return (base || `obra_${obraId}`).toLowerCase();
}

export function buildKml(placemarks: FieldPlacemark[], documentName: string): string {
  const nameEsc = escapeXml(documentName);
  const marks = placemarks
    .map((p) => {
      const n = escapeXml(p.name);
      const d = p.description ? escapeXml(p.description) : "";
      const coord = `${p.lng},${p.lat},0`;
      return `    <Placemark>
      <name>${n}</name>
      ${d ? `<description>${d}</description>` : ""}
      <Point><coordinates>${coord}</coordinates></Point>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${nameEsc}</name>
${marks}
  </Document>
</kml>
`;
}

export function buildGpx(
  placemarks: FieldPlacemark[],
  meta: { creator?: string; trackName?: string },
): string {
  const creator = escapeXml(meta.creator ?? "APP-SONDAGEM");
  const trkName = escapeXml(meta.trackName ?? "Pontos de campo");
  const wpts = placemarks
    .map((p) => {
      const n = escapeXml(p.name);
      const d = p.description ? escapeXml(p.description) : "";
      return `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${n}</name>
    ${d ? `<desc>${d}</desc>` : ""}
  </wpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trkName}</name>
  </metadata>
${wpts}
</gpx>
`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
