import pdf from "pdf-parse/lib/pdf-parse.js";

type PdfTransform = [number, number, number, number, number, number];

type PdfTextItem = {
  str: string;
  width: number;
  transform: PdfTransform;
  dir?: string;
  hasEOL?: boolean;
};

type PdfPage = {
  getTextContent(options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }): Promise<{ items: unknown[] }>;
};

type PositionedText = {
  item: PdfTextItem;
  x: number;
  y: number;
  unitX: number;
  unitY: number;
  fontSize: number;
};

function isPdfTextItem(value: unknown): value is PdfTextItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PdfTextItem>;
  return typeof candidate.str === "string"
    && typeof candidate.width === "number"
    && Number.isFinite(candidate.width)
    && Array.isArray(candidate.transform)
    && candidate.transform.length >= 6
    && candidate.transform.every((part) => typeof part === "number" && Number.isFinite(part));
}

function position(item: PdfTextItem): PositionedText {
  const [a, b, c, d, x, y] = item.transform;
  const baselineLength = Math.hypot(a, b);
  const direction = item.dir === "rtl" ? -1 : 1;
  return {
    item,
    x,
    y,
    unitX: baselineLength > 0 ? direction * a / baselineLength : direction,
    unitY: baselineLength > 0 ? direction * b / baselineLength : 0,
    fontSize: Math.max(baselineLength, Math.hypot(c, d), 1),
  };
}

function startsWithWhitespace(value: string): boolean {
  return /^\s/u.test(value);
}

function endsWithWhitespace(value: string): boolean {
  return /\s$/u.test(value);
}

async function renderPdfPage(page: PdfPage): Promise<string> {
  const content = await page.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });
  let output = "";
  let previous: PositionedText | null = null;

  for (const value of content.items) {
    if (!isPdfTextItem(value) || value.str.length === 0) continue;
    const current = position(value);
    if (previous) {
      const deltaX = current.x - previous.x;
      const deltaY = current.y - previous.y;
      const alongBaseline = deltaX * previous.unitX + deltaY * previous.unitY;
      const acrossBaseline = Math.abs(deltaX * previous.unitY - deltaY * previous.unitX);
      const orientation = previous.unitX * current.unitX + previous.unitY * current.unitY;
      const minimumFontSize = Math.min(previous.fontSize, current.fontSize);
      const changedLine = previous.item.hasEOL === true
        || orientation < 0.98
        || acrossBaseline > Math.max(0.5, 0.2 * minimumFontSize)
        || alongBaseline < -Math.max(previous.fontSize, current.fontSize);

      if (changedLine) {
        output = output.replace(/[\t ]+$/u, "");
        if (output && !output.endsWith("\n")) output += "\n";
      } else {
        const visualGap = alongBaseline - previous.item.width;
        const hasVisualWordGap = visualGap > Math.max(0.25, 0.1 * minimumFontSize);
        if (hasVisualWordGap && !endsWithWhitespace(output) && !startsWithWhitespace(value.str)) {
          output += " ";
        }
      }
    }
    output += value.str;
    previous = current;
  }

  return output;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // A copy avoids Buffer/ArrayBuffer realm issues in Next.js and PDF.js 1.x.
  const safeBytes = Uint8Array.from(bytes);
  return (await pdf(safeBytes, { pagerender: renderPdfPage })).text;
}
