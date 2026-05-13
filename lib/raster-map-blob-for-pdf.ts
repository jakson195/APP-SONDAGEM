/**
 * Desenha PNG/JPEG/SVG (blob) num <canvas> visível para o html2canvas capturar no PDF.
 * Evita <img> + data URLs longas, que muitas vezes saem em branco no html2canvas.
 */
export async function drawMapBlobOntoCanvas(
  blob: Blob,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const mime = blob.type || "";
  /** SVG via createImageBitmap falha em vários WebViews (ex.: PDF no Android). */
  const skipBitmap = mime.includes("svg");

  if (!skipBitmap && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d context");
        ctx.drawImage(bitmap, 0, 0);
        return;
      } finally {
        bitmap.close();
      }
    } catch {
      /* continuar com Image */
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || 640;
          const h = img.naturalHeight || 360;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("2d context"));
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("image load"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
