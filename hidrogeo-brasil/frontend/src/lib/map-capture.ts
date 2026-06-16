/** Compõe todos os canvas WebGL do mapa (base + Deck.gl) num PNG. */
export function compositeMapCanvases(container: HTMLElement): string | null {
  const canvases = Array.from(container.querySelectorAll("canvas"));
  if (canvases.length === 0) return null;

  const primary = canvases[0]!;
  const w = primary.width;
  const h = primary.height;
  if (w <= 0 || h <= 0) return null;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, w, h);

  for (const canvas of canvases) {
    if (canvas.width === 0 || canvas.height === 0) continue;
    try {
      ctx.drawImage(canvas, 0, 0, w, h);
    } catch {
      /* canvas tainted — skip */
    }
  }

  return out.toDataURL("image/png");
}

/** Detecta captura vazia (canvas WebGL sem preserveDrawingBuffer). */
export function isCaptureMostlyBlank(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.min(64, img.width);
      c.height = Math.min(64, img.height);
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let bright = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! + data[i + 1]! + data[i + 2]! > 30) bright++;
      }
      resolve(bright < data.length / 16);
    };
    img.onerror = () => resolve(true);
    img.src = dataUrl;
  });
}
