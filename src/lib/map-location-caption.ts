/** Legenda sobreposta ao mapa estático (PDF / API). */

export type MapLocationCaption = {
  titulo: string;
  descricao?: string;
  lat: number;
  lng: number;
};

export function mapLocationCaptionLines(c: MapLocationCaption): string[] {
  const lines: string[] = [c.titulo.trim() || "Furo"];
  const desc = c.descricao?.trim();
  if (desc) lines.push(desc.length > 90 ? `${desc.slice(0, 87)}…` : desc);
  lines.push(`${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} (WGS84)`);
  return lines;
}

/** SVG para composição com sharp (640×360). */
export function buildMapCaptionOverlaySvg(
  width: number,
  height: number,
  caption: MapLocationCaption,
): string {
  const lines = mapLocationCaptionLines(caption);
  const boxH = 18 + lines.length * 16;
  const y0 = height - boxH - 6;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const textEls = lines
    .map((line, i) => {
      const y = y0 + 22 + i * 16;
      const weight = i === 0 ? ' font-weight="700"' : "";
      const size = i === 0 ? 13 : 11;
      return `<text x="14" y="${y}" font-family="Arial,sans-serif" font-size="${size}"${weight} fill="#0f172a">${esc(line)}</text>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="8" y="${y0}" width="${width - 16}" height="${boxH}" rx="6" fill="rgba(255,255,255,0.94)" stroke="#cbd5e1" stroke-width="1"/>
  ${textEls}
</svg>`;
}
