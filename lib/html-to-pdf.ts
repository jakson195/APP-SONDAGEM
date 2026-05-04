import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Captura um nó HTML e gera PDF (A4, várias páginas se a imagem for mais alta que a folha).
 * Use com `useRef<HTMLDivElement>(null)` no componente cliente e passa `ref.current`.
 */
export async function downloadNodeAsPdf(
  element: HTMLElement,
  fileName: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  const name = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  pdf.save(name);
}
