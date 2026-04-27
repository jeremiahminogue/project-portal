export type DocumentKind = 'drawing' | 'specification' | 'file';

export type DrawingPageAnalysis = {
  pageNumber: number;
  name: string;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revision: string | null;
  text: string;
};

export type DrawingAnalysis = {
  documentKind: DocumentKind;
  pageCount: number;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revision: string | null;
  ocrStatus: 'indexed' | 'partial' | 'failed' | 'skipped';
  ocrText: string;
  pages: DrawingPageAnalysis[];
};

const MAX_PAGE_TEXT = 8000;
const MAX_FILE_TEXT = 16000;
const DISCIPLINE_PREFIXES = new Set([
  'A',
  'AD',
  'AS',
  'C',
  'CS',
  'E',
  'EL',
  'FA',
  'FP',
  'FS',
  'G',
  'I',
  'ID',
  'M',
  'P',
  'S',
  'T',
  'X'
]);
const SHEET_NUMBER_PATTERN = /\b(?:AD|AS|CS|EL|FA|FP|FS|ID|[ACEGIMPSTX])[-\s_.]?[0-9OILSZ]{1,4}(?:[.\-\s_]?[0-9OILSZ]{1,3})?[A-Z]?\b/gi;

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeSheetNumber(value: string | null) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, '').replaceAll('_', '-').toUpperCase();
  const match = compact.match(/^([A-Z]{1,3})[-.]?([0-9OILSZ]+)(?:[-.]?([0-9OILSZ]+))?([A-Z]?)$/);
  if (!match) return compact;
  const [, prefix, primaryRaw, secondaryRaw, suffix] = match;
  if (!DISCIPLINE_PREFIXES.has(prefix)) return null;
  const fixDigits = (part: string) =>
    part
      .replaceAll('O', '0')
      .replaceAll('I', '1')
      .replaceAll('L', '1')
      .replaceAll('S', '5')
      .replaceAll('Z', '2');
  const primary = fixDigits(primaryRaw);
  const secondary = secondaryRaw ? fixDigits(secondaryRaw) : '';
  const separator = prefix.length > 1 || primary.length > 2 ? '-' : '';
  return `${prefix}${separator}${primary}${secondary ? `.${secondary}` : ''}${suffix}`;
}

function usableTitleLine(line: string) {
  const cleaned = cleanText(line);
  if (cleaned.length < 4 || cleaned.length > 90) return false;
  if (/^(sheet|drawing|number|title|date|scale|project|revision|rev\.?|checked|drawn|approved)\b/i.test(cleaned)) return false;
  if (/\b(pueblo|electric|engineer|architect|contractor|copyright|www\.|@)\b/i.test(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  return /[A-Za-z]{3,}/.test(cleaned);
}

function stripSheetNumber(line: string, sheetNumber: string | null) {
  if (!sheetNumber) return cleanText(line);
  return cleanText(line.replace(new RegExp(`\\b${sheetNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '').replace(/[-:|]+/g, ' '));
}

export function parseSheetName(value: string) {
  const withoutExt = value.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
  const sheetNumber = normalizeSheetNumber(withoutExt.match(SHEET_NUMBER_PATTERN)?.[0] ?? null);
  const sheetTitle = stripSheetNumber(withoutExt, sheetNumber);
  return {
    sheetNumber,
    sheetTitle: usableTitleLine(sheetTitle) ? sheetTitle : null,
    revision: extractRevision([withoutExt])
  };
}

function extractRevision(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/\b(?:revision|rev\.?|r)[\s:#-]*([A-Z0-9]{1,4})\b/i);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function candidateSheetNumbers(line: string) {
  const candidates: string[] = [];
  for (const match of line.matchAll(SHEET_NUMBER_PATTERN)) {
    const normalized = normalizeSheetNumber(match[0]);
    if (normalized) candidates.push(normalized);
  }
  return candidates;
}

function scoreSheetCandidate(line: string, sheetNumber: string, lineIndex: number, totalLines: number) {
  let score = 0;
  const compactLine = cleanText(line).toLowerCase();
  const prefix = sheetNumber.match(/^[A-Z]+/)?.[0] ?? '';
  if (sheetNumber.includes('-') || sheetNumber.includes('.')) score += 6;
  if (prefix.length > 1) score += 4;
  if (/\b(sheet|drawing)\s*(no\.?|number|#)\b/i.test(line)) score += 8;
  if (new RegExp(`\\b${sheetNumber.replace('-', '[-\\s_.]?')}\\b`, 'i').test(line)) score += 3;
  if (lineIndex > totalLines * 0.55) score += 2;
  if (compactLine.includes('sheet list') || compactLine.includes('sheet index')) score -= 4;
  if (/\bsheet\s+\d+\b/i.test(line) && /^T\d+$/i.test(sheetNumber)) score -= 10;
  if (/^(REV|R|NO|N|SHT)/i.test(sheetNumber)) score -= 12;
  return score;
}

function extractSheetNumber(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /\b(sheet|drawing)\s*(no\.?|number|#)\b/i.test(line));
  if (labelIndex >= 0) {
    const labelled = lines.slice(labelIndex, labelIndex + 5);
    const labelledCandidates = labelled.flatMap((line, index) =>
      candidateSheetNumbers(line).map((sheetNumber) => ({
        sheetNumber,
        score: scoreSheetCandidate(line, sheetNumber, labelIndex + index, lines.length) + 10
      }))
    );
    labelledCandidates.sort((a, b) => b.score - a.score);
    if (labelledCandidates[0]?.sheetNumber) return labelledCandidates[0].sheetNumber;
  }

  const candidates = lines.flatMap((line, index) =>
    candidateSheetNumbers(line).map((sheetNumber) => ({
      sheetNumber,
      score: scoreSheetCandidate(line, sheetNumber, index, lines.length)
    }))
  );

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.sheetNumber ?? null;
}

function lineMentionsSheetNumber(line: string, sheetNumber: string) {
  const normalizedCandidates = candidateSheetNumbers(line);
  return normalizedCandidates.includes(sheetNumber);
}

function titleAfterSheetNumber(line: string, sheetNumber: string | null) {
  if (!sheetNumber || !lineMentionsSheetNumber(line, sheetNumber)) return null;
  const stripped = cleanText(
    line
      .replace(SHEET_NUMBER_PATTERN, ' ')
      .replace(/\b(sheet|drawing)\s*(title|name|no\.?|number|#)\b/gi, ' ')
      .replace(/[-:|]+/g, ' ')
  );
  return usableTitleLine(stripped) ? stripped : null;
}

function likelyProjectTitle(line: string) {
  const cleaned = cleanText(line);
  if (cleaned.length > 42 && /\b(project|system|upgrade|site|facility|campus|building)\b/i.test(cleaned)) return true;
  return /\b(notification upgrade|fire alarm system)\b/i.test(cleaned);
}

function extractSheetTitle(lines: string[], sheetNumber: string | null) {
  for (const line of lines) {
    const inlineTitle = titleAfterSheetNumber(line, sheetNumber);
    if (inlineTitle) return inlineTitle;
  }

  const labelIndex = lines.findIndex((line) => /\b(sheet|drawing)\s*title\b/i.test(line));
  if (labelIndex >= 0) {
    for (const line of lines.slice(labelIndex, labelIndex + 5)) {
      const stripped = stripSheetNumber(line.replace(/\b(sheet|drawing)\s*title\b/i, ''), sheetNumber);
      if (usableTitleLine(stripped) && !likelyProjectTitle(stripped)) return stripped;
    }
  }

  for (const line of lines) {
    const stripped = stripSheetNumber(line, sheetNumber);
    if (usableTitleLine(stripped) && !likelyProjectTitle(stripped)) return stripped;
  }

  return null;
}

function buildPageName(pageNumber: number, sheetNumber: string | null, sheetTitle: string | null, fallback: string) {
  if (sheetNumber && sheetTitle) return `${sheetNumber} - ${sheetTitle}`;
  if (sheetNumber) return sheetNumber;
  if (sheetTitle) return sheetTitle;
  return `${fallback.replace(/\.[^.]+$/, '')} - Page ${pageNumber}`;
}

function linesFromText(text: string) {
  return text
    .split(/\r?\n| {2,}/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 180);
}

async function recognizeImage(bytes: Uint8Array) {
  const tesseract = await import('tesseract.js');
  const result = await tesseract.default.recognize(Buffer.from(bytes), 'eng');
  return String(result.data.text ?? '').slice(0, MAX_PAGE_TEXT);
}

function needsOcr(text: string, lines: string[], sheetNumber: string | null, sheetTitle: string | null) {
  return text.trim().length < 80 || (lines.length < 8 && !sheetNumber && !sheetTitle);
}

function positionedLines(textContent: any, page: any, zone: 'all' | 'titleBlock' = 'all') {
  const viewport = page.getViewport({ scale: 1 });
  const width = viewport.width || 1;
  const height = viewport.height || 1;
  const items = (textContent.items ?? [])
    .map((item: unknown) => {
      const candidate = item as { str?: string; transform?: number[] };
      const text = cleanText(candidate.str ?? '');
      const x = candidate.transform?.[4] ?? 0;
      const y = candidate.transform?.[5] ?? 0;
      return { text, x, y };
    })
    .filter((item: { text: string; x: number; y: number }) => {
      if (!item.text) return false;
      if (zone === 'all') return true;
      return item.x > width * 0.68 || item.y < height * 0.22 || (item.x > width * 0.52 && item.y < height * 0.34);
    })
    .sort((a: { x: number; y: number }, b: { x: number; y: number }) => b.y - a.y || a.x - b.x);

  const lines: string[] = [];
  let currentY: number | null = null;
  let current: string[] = [];
  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) < 5) {
      current.push(item.text);
      currentY = currentY ?? item.y;
    } else {
      lines.push(cleanText(current.join(' ')));
      current = [item.text];
      currentY = item.y;
    }
  }
  if (current.length) lines.push(cleanText(current.join(' ')));
  return lines.filter(Boolean).slice(0, 220);
}

function cropCanvas(canvasKit: typeof import('@napi-rs/canvas'), canvas: import('@napi-rs/canvas').Canvas, x: number, y: number, width: number, height: number) {
  const crop = canvasKit.createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  const cropContext = crop.getContext('2d');
  cropContext.drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
  return new Uint8Array(crop.toBuffer('image/png'));
}

async function ocrPdfPage(page: any) {
  try {
    const canvasKit = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ??= canvasKit.DOMMatrix as typeof DOMMatrix;
    globalThis.DOMPoint ??= canvasKit.DOMPoint as typeof DOMPoint;
    globalThis.DOMRect ??= canvasKit.DOMRect as typeof DOMRect;
    globalThis.ImageData ??= canvasKit.ImageData as unknown as typeof ImageData;

    const viewport = page.getViewport({ scale: 2.3 });
    const canvas = canvasKit.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext('2d');
    await page.render({ canvasContext, viewport }).promise;
    const cropTexts = await Promise.all([
      recognizeImage(cropCanvas(canvasKit, canvas, canvas.width * 0.68, 0, canvas.width * 0.32, canvas.height)),
      recognizeImage(cropCanvas(canvasKit, canvas, canvas.width * 0.54, canvas.height * 0.68, canvas.width * 0.46, canvas.height * 0.32)),
      recognizeImage(new Uint8Array(canvas.toBuffer('image/png')))
    ]);
    return cropTexts.join('\n').slice(0, MAX_PAGE_TEXT);
  } catch {
    return '';
  }
}

function classifyDocument(filename: string, contentType: string, folderName: string): DocumentKind {
  const haystack = `${filename} ${contentType} ${folderName}`.toLowerCase();
  if (haystack.includes('spec')) return 'specification';
  if (haystack.includes('drawing') || haystack.includes('sheet') || haystack.includes('plan')) return 'drawing';
  if (contentType === 'application/pdf' || contentType.startsWith('image/')) return 'drawing';
  return 'file';
}

async function extractPdfPages(bytes: Uint8Array, filename: string): Promise<DrawingPageAnalysis[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes)
  });
  const pdf = await loadingTask.promise;
  const pages: DrawingPageAnalysis[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const titleBlockLines = positionedLines(textContent, page, 'titleBlock');
    let text = textContent.items
      .map((item: unknown) => {
        const candidate = item as { str?: string };
        return candidate.str ?? '';
      })
      .join('\n')
      .slice(0, MAX_PAGE_TEXT);
    let lines = linesFromText(text);
    const filenameFallback = pageNumber === 1 ? parseSheetName(filename) : { sheetNumber: null, sheetTitle: null, revision: null };
    let sheetNumber = extractSheetNumber(titleBlockLines) ?? extractSheetNumber(lines) ?? filenameFallback.sheetNumber;
    let sheetTitle = extractSheetTitle(titleBlockLines, sheetNumber) ?? extractSheetTitle(lines, sheetNumber) ?? filenameFallback.sheetTitle;
    let revision = extractRevision(titleBlockLines) ?? extractRevision(lines) ?? filenameFallback.revision;

    if (needsOcr(text, lines, sheetNumber, sheetTitle) || !sheetNumber) {
      const ocrText = await ocrPdfPage(page);
      if (ocrText) {
        text = ocrText;
        lines = linesFromText(text);
        sheetNumber = extractSheetNumber(lines) ?? sheetNumber;
        sheetTitle = extractSheetTitle(lines, sheetNumber) ?? sheetTitle;
        revision = extractRevision(lines) ?? revision;
      }
    }

    pages.push({
      pageNumber,
      name: buildPageName(pageNumber, sheetNumber, sheetTitle, filename),
      sheetNumber,
      sheetTitle,
      revision,
      text
    });
  }

  await pdf.destroy();
  return pages;
}

async function extractImagePage(bytes: Uint8Array, filename: string): Promise<DrawingPageAnalysis> {
  const text = await recognizeImage(bytes);
  const lines = linesFromText(text);
  const fallback = parseSheetName(filename);
  const sheetNumber = extractSheetNumber(lines) ?? fallback.sheetNumber;
  const sheetTitle = extractSheetTitle(lines, sheetNumber) ?? fallback.sheetTitle;
  const revision = extractRevision(lines) ?? fallback.revision;

  return {
    pageNumber: 1,
    name: buildPageName(1, sheetNumber, sheetTitle, filename),
    sheetNumber,
    sheetTitle,
    revision,
    text
  };
}

export async function analyzeDrawingUpload(bytes: Uint8Array, filename: string, contentType: string, folderName = ''): Promise<DrawingAnalysis> {
  const documentKind = classifyDocument(filename, contentType, folderName);
  const fallback = parseSheetName(filename);

  if (documentKind !== 'drawing' && documentKind !== 'specification') {
    return {
      documentKind,
      pageCount: 1,
      sheetNumber: fallback.sheetNumber,
      sheetTitle: fallback.sheetTitle,
      revision: fallback.revision,
      ocrStatus: 'skipped',
      ocrText: '',
      pages: []
    };
  }

  try {
    const isPdf = contentType === 'application/pdf' || /\.pdf$/i.test(filename);
    const isImage = contentType.startsWith('image/');
    const pages = isPdf ? await extractPdfPages(bytes, filename) : isImage ? [await extractImagePage(bytes, filename)] : [];
    const firstPage = pages[0];
    const ocrText = pages.map((page) => page.text).join('\n\n').slice(0, MAX_FILE_TEXT);
    const allPagesHaveText = pages.every((page) => page.text.trim().length > 0);

    return {
      documentKind,
      pageCount: Math.max(pages.length, 1),
      sheetNumber: firstPage?.sheetNumber ?? fallback.sheetNumber,
      sheetTitle: firstPage?.sheetTitle ?? fallback.sheetTitle,
      revision: firstPage?.revision ?? fallback.revision,
      ocrStatus: pages.length > 0 ? (allPagesHaveText ? 'indexed' : 'partial') : 'skipped',
      ocrText,
      pages
    };
  } catch {
    return {
      documentKind,
      pageCount: 1,
      sheetNumber: fallback.sheetNumber,
      sheetTitle: fallback.sheetTitle,
      revision: fallback.revision,
      ocrStatus: 'failed',
      ocrText: '',
      pages: [
        {
          pageNumber: 1,
          name: buildPageName(1, fallback.sheetNumber, fallback.sheetTitle, filename),
          sheetNumber: fallback.sheetNumber,
          sheetTitle: fallback.sheetTitle,
          revision: fallback.revision,
          text: ''
        }
      ]
    };
  }
}
