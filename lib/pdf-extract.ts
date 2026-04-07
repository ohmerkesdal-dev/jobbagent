/**
 * Klientside PDF → tekst (pdfjs-dist). Kun i nettleser.
 */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const version = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (typeof item === "object" && item !== null && "str" in item) {
        const s = (item as { str: string }).str;
        if (s) parts.push(s);
      }
    }
    parts.push("\n");
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
