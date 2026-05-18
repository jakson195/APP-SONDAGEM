/**
 * Reduz imagem para caber no relatório PDF (html2canvas) e comprime em JPEG.
 */
export function resizeImageFileToJpegDataUrl(
  file: File,
  maxEdge = 1280,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Não é imagem"));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: width, naturalHeight: height } = img;
      if (width < 1 || height < 1) {
        reject(new Error("Imagem inválida"));
        return;
      }
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler imagem"));
    };
    img.src = url;
  });
}
