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
  ocrStatus: 'pending' | 'indexed' | 'partial' | 'failed' | 'skipped';
  ocrText: string;
  pages: DrawingPageAnalysis[];
};

export type TitleBlockRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DrawingOcrOptions = {
  titleBlockRegion?: TitleBlockRegion | null;
};

export function normalizeDocumentKind(value: unknown): DocumentKind | null {
  return value === 'drawing' || value === 'specification' || value === 'file' ? value : null;
}

function finiteRegionNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampRegionValue(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function normalizeTitleBlockRegion(value: unknown): TitleBlockRegion | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  const x = finiteRegionNumber(candidate.x);
  const y = finiteRegionNumber(candidate.y);
  const width = finiteRegionNumber(candidate.width);
  const height = finiteRegionNumber(candidate.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0.02 || height <= 0.02) return null;
  const left = clampRegionValue(x);
  const top = clampRegionValue(y);
  const right = clampRegionValue(x + width);
  const bottom = clampRegionValue(y + height);
  const normalized = {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  };
  return normalized.width > 0.02 && normalized.height > 0.02 ? normalized : null;
}

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
const SHEET_TITLE_LABEL_PATTERN = /\b(?:sheet|drawing)\s*(?:title|name)\b|\btitle\b/i;
const COLOR_OR_LEGEND_TOKENS = new Set([
  'BLK',
  'BLU',
  'BLUE',
  'BRN',
  'BROWN',
  'GRN',
  'GREEN',
  'ORG',
  'ORANGE',
  'PNK',
  'RED',
  'VIO',
  'VIOLET',
  'WHT',
  'WHITE',
  'YEL',
  'YELLOW'
]);

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function tokensFromLine(line: string) {
  return cleanText(line)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function likelyAbbreviationRun(line: string) {
  const tokens = tokensFromLine(line);
  if (tokens.length < 2) return false;
  const colorTokens = tokens.filter((token) => COLOR_OR_LEGEND_TOKENS.has(token)).length;
  if (colorTokens >= 2) return true;
  return tokens.length >= 3 && tokens.every((token) => /^\d+$/.test(token) || /^[A-Z]{1,4}\d{0,2}$/.test(token));
}

function likelyNonSheetTitleLine(line: string) {
  const cleaned = cleanText(line);
  if (!cleaned) return true;
  if (/^(?:ref|refs|reference|note|notes)\.?$/i.test(cleaned)) return true;
  if (/\b(?:key notes?|general notes?|sheet index|sheet list)\b/i.test(cleaned)) return true;
  if (/\b(?:maximum|minimum)\b.*\b(?:sensor|height|top|bottom|mm)\b/i.test(cleaned)) return true;
  if (/^\d+[\s"'.(]/.test(cleaned)) return true;
  return likelyAbbreviationRun(cleaned);
}

function normalizeSheetNumber(value: string | null) {
  if (!value) return null;
  const raw = value.trim();
  const compact = raw.replace(/\s+/g, '').replaceAll('_', '-').toUpperCase();
  const match = compact.match(/^([A-Z]{1,3})[-.]?([0-9OILSZ]+)(?:[-.]?([0-9OILSZ]+))?([A-Z]?)$/);
  if (!match) return compact;
  const [, prefix, primaryRaw, secondaryRaw, suffix] = match;
  if (!DISCIPLINE_PREFIXES.has(prefix)) return null;
  const sourceSeparator = raw.match(/^[A-Z]{1,3}([-_\s.]?)[0-9OILSZ]/i)?.[1] ?? '';
  const fixDigits = (part: string) =>
    part
      .replaceAll('O', '0')
      .replaceAll('I', '1')
      .replaceAll('L', '1')
      .replaceAll('S', '5')
      .replaceAll('Z', '2');
  const primary = fixDigits(primaryRaw);
  const secondary = secondaryRaw ? fixDigits(secondaryRaw) : '';
  const separator = /[-_]/.test(sourceSeparator) || prefix.length > 1 || primary.length > 2 ? '-' : '';
  return `${prefix}${separator}${primary}${secondary ? `.${secondary}` : ''}${suffix}`;
}

function usableTitleLine(line: string) {
  const cleaned = cleanText(line);
  if (cleaned.length < 4 || cleaned.length > 90) return false;
  if (/^(sheet|drawing|number|title|date|scale|project|revision|rev\.?|checked|drawn|approved)\b/i.test(cleaned)) return false;
  if (/\b(pueblo|electric|engineer|architect|contractor|copyright|www\.|@)\b/i.test(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (likelyNonSheetTitleLine(cleaned)) return false;
  return /[A-Za-z]{3,}/.test(cleaned);
}

function stripSheetNumber(line: string, sheetNumber: string | null) {
  if (!sheetNumber) return cleanText(line);
  return cleanText(line.replace(sheetNumberSearchPattern(sheetNumber), '').replace(/[-:|]+/g, ' '));
}

export function parseSheetName(value: string) {
  const withoutExt = value.replace(/\.[^.]+$/, '');
  const displayName = withoutExt.replaceAll('_', ' ');
  const sheetNumber = normalizeSheetNumber(withoutExt.match(SHEET_NUMBER_PATTERN)?.[0] ?? null);
  const sheetTitle = stripSheetNumber(displayName, sheetNumber);
  return {
    sheetNumber,
    sheetTitle: usableTitleLine(sheetTitle) ? sheetTitle : null,
    revision: extractRevision([displayName])
  };
}

export function isPdfDocument(filename: string, contentType: string) {
  return contentType.split(';')[0]?.trim().toLowerCase() === 'application/pdf' || /\.pdf$/i.test(filename);
}

type SheetNameFallback = ReturnType<typeof parseSheetName>;

function fallbackPage(pageNumber: number, filename: string, fallback: SheetNameFallback, useFilenameMetadata: boolean): DrawingPageAnalysis {
  const sheetNumber = useFilenameMetadata ? fallback.sheetNumber : null;
  const sheetTitle = useFilenameMetadata ? fallback.sheetTitle : null;
  const revision = useFilenameMetadata ? fallback.revision : null;

  return {
    pageNumber,
    name: buildPageName(pageNumber, sheetNumber, sheetTitle, filename),
    sheetNumber,
    sheetTitle,
    revision,
    text: ''
  };
}

function fallbackPages(pageCount: number, filename: string) {
  const fallback = parseSheetName(filename);
  return Array.from({ length: Math.max(pageCount, 1) }, (_, index) => fallbackPage(index + 1, filename, fallback, index === 0));
}

function analysisFromPages(
  documentKind: DocumentKind,
  fallback: SheetNameFallback,
  pages: DrawingPageAnalysis[],
  status: DrawingAnalysis['ocrStatus']
): DrawingAnalysis {
  const firstPage = pages[0];
  return {
    documentKind,
    pageCount: Math.max(pages.length, 1),
    sheetNumber: firstPage?.sheetNumber ?? fallback.sheetNumber,
    sheetTitle: firstPage?.sheetTitle ?? fallback.sheetTitle,
    revision: firstPage?.revision ?? fallback.revision,
    ocrStatus: documentKind === 'drawing' ? status : 'skipped',
    ocrText: pages.map((page) => page.text).join('\n\n').slice(0, MAX_FILE_TEXT),
    pages
  };
}

const REVISION_HEADER_TOKENS = new Set([
  'DATE',
  'DESC',
  'DESCRIPTION',
  'DRAWN',
  'BY',
  'NO',
  'NUMBER',
  'ISSUE',
  'ISSUED',
  'REV',
  'REVISION',
  'SHEET',
  'TITLE'
]);

function normalizeRevisionToken(value: string | null | undefined) {
  const token = cleanText(String(value ?? ''))
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')
    .toUpperCase();
  if (!token || token.length > 4 || REVISION_HEADER_TOKENS.has(token)) return null;
  if (/^\d{1,2}$/.test(token)) return token;
  if (/^[A-H]$/.test(token)) return token;
  if (/^[A-Z]\d{1,2}$/.test(token)) return token;
  if (/^\d{1,2}[A-Z]$/.test(token)) return token;
  if (/^(?:ASI|CCD|PR|SK|RFI)\d{1,2}$/.test(token)) return token;
  return null;
}

function extractInlineRevision(line: string) {
  const patterns = [
    /\brevision[\s:#._-]+([A-Z0-9]{1,4})\b/i,
    /\brev\.?[\s:#._-]+([A-Z0-9]{1,4})\b/i,
    /\brev\.?([A-Z0-9]{1,4})\b/i,
    /\bR[\s:#._-]+([A-Z0-9]{1,4})\b/i,
    /\bR([0-9]{1,2}|[A-H])\b/i
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    const revision = normalizeRevisionToken(match?.[1]);
    if (revision) return revision;
  }
  return null;
}

function lineLooksLikeRevisionLabel(line: string) {
  return /\b(?:revision|rev\.?)\b/i.test(line) || /^R$/i.test(cleanText(line));
}

function firstStandaloneRevisionToken(line: string) {
  for (const token of line.split(/[^A-Za-z0-9]+/)) {
    const revision = normalizeRevisionToken(token);
    if (revision) return revision;
  }
  return null;
}

function extractRevision(lines: string[]) {
  for (const line of lines) {
    const revision = extractInlineRevision(line);
    if (revision) return revision;
  }

  const labelIndex = lines.findIndex(lineLooksLikeRevisionLabel);
  if (labelIndex >= 0) {
    for (const line of lines.slice(labelIndex + 1, labelIndex + 4)) {
      const revision = firstStandaloneRevisionToken(line);
      if (revision) return revision;
    }
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

function sheetNumberSearchPattern(sheetNumber: string) {
  const flexible = sheetNumber
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\-/g, '[-\\s_.]?')
    .replace(/\\\./g, '[.\\s_-]?');
  return new RegExp(`\\b${flexible}\\b`, 'i');
}

function scoreSheetCandidate(line: string, sheetNumber: string, lineIndex: number, totalLines: number, lines: string[] = []) {
  let score = 0;
  const compactLine = cleanText(line).toLowerCase();
  const nearbyPreviousLines = lines.slice(Math.max(0, lineIndex - 8), lineIndex + 1).join(' ').toLowerCase();
  const prefix = sheetNumber.match(/^[A-Z]+/)?.[0] ?? '';
  if (sheetNumber.includes('-') || sheetNumber.includes('.')) score += 6;
  if (prefix.length > 1) score += 4;
  if (/\b(sheet|drawing)\s*(no\.?|number|#)\b/i.test(line)) score += 8;
  if (sheetNumberSearchPattern(sheetNumber).test(line)) score += 3;
  if (lineIndex > totalLines * 0.55) score += 2;
  if (compactLine.includes('sheet list') || compactLine.includes('sheet index')) score -= 4;
  if (nearbyPreviousLines.includes('sheet list') || nearbyPreviousLines.includes('sheet index')) score -= 8;
  if (/\bsheet\s+\d+\b/i.test(line) && /^T\d+$/i.test(sheetNumber)) score -= 10;
  if (/^(REV|R|NO|N|SHT)/i.test(sheetNumber)) score -= 12;
  return score;
}

function bestSheetNumberCandidate(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /\b(sheet|drawing)\s*(no\.?|number|#)\b/i.test(line));
  if (labelIndex >= 0) {
    const labelled = lines.slice(labelIndex, labelIndex + 5);
    const labelledCandidates = labelled.flatMap((line, index) =>
      candidateSheetNumbers(line).map((sheetNumber) => ({
        sheetNumber,
        score: scoreSheetCandidate(line, sheetNumber, labelIndex + index, lines.length, lines) + 10
      }))
    );
    labelledCandidates.sort((a, b) => b.score - a.score);
    if (labelledCandidates[0]?.sheetNumber) return labelledCandidates[0];
  }

  const candidates = lines.flatMap((line, index) =>
    candidateSheetNumbers(line).map((sheetNumber) => ({
      sheetNumber,
      score: scoreSheetCandidate(line, sheetNumber, index, lines.length, lines)
    }))
  );

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function extractSheetNumber(lines: string[]) {
  return bestSheetNumberCandidate(lines)?.sheetNumber ?? null;
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

function titleCandidate(line: string, sheetNumber: string | null) {
  const stripped = stripSheetNumber(line.replace(SHEET_TITLE_LABEL_PATTERN, ' '), sheetNumber);
  return usableTitleLine(stripped) && !likelyProjectTitle(stripped) ? stripped : null;
}

function titleCandidateScore(title: string, index: number, totalLines: number, bonus = 0) {
  let score = bonus;
  if (index > totalLines * 0.5) score += 3;
  if (index > totalLines * 0.72) score += 4;
  if (/^[A-Z0-9][A-Z0-9\s&/#.'()+-]+$/.test(title)) score += 1;
  if (title.split(/\s+/).length >= 2) score += 1;
  if (likelyProjectTitle(title)) score -= 8;
  if (likelyNonSheetTitleLine(title)) score -= 12;
  return score;
}

function extractSheetTitle(lines: string[], sheetNumber: string | null) {
  for (const line of lines) {
    const inlineTitle = titleAfterSheetNumber(line, sheetNumber);
    if (inlineTitle) return inlineTitle;
  }

  const candidates: { title: string; score: number }[] = [];
  const addCandidate = (line: string, index: number, bonus = 0) => {
    const title = titleCandidate(line, sheetNumber);
    if (!title) return;
    candidates.push({
      title,
      score: titleCandidateScore(title, index, lines.length, bonus)
    });
  };

  lines.forEach((line, index) => {
    if (!SHEET_TITLE_LABEL_PATTERN.test(line)) return;
    for (let offset = 0; offset <= 6; offset += 1) {
      const candidateIndex = index + offset;
      const candidateLine = lines[candidateIndex];
      if (candidateLine) addCandidate(candidateLine, candidateIndex, 24 - offset * 3);
    }
  });

  lines.forEach((line, index) => addCandidate(line, index));
  candidates.sort((a, b) => b.score - a.score || b.title.length - a.title.length);
  if (candidates[0] && candidates[0].score >= 0) return candidates[0].title;

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

async function recognizeImage(bytes: Uint8Array, parameters: Record<string, string> = {}) {
  const tesseract = await import('tesseract.js');
  const result = await tesseract.default.recognize(Buffer.from(bytes), 'eng', {
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: '6',
    ...parameters
  } as any);
  return String(result.data.text ?? '').slice(0, MAX_PAGE_TEXT);
}

function needsOcr(text: string, lines: string[], sheetNumber: string | null, sheetTitle: string | null) {
  return text.trim().length < 80 || (lines.length < 8 && !sheetNumber && !sheetTitle);
}

function needsTitleBlockOcr(titleBlockLines: string[], sheetNumberFromTitleBlock: boolean, sheetTitle: string | null) {
  if (!sheetNumberFromTitleBlock) return true;
  if (!sheetTitle) return true;
  return titleBlockLines.length < 3;
}

function positionedLines(
  textContent: any,
  page: any,
  zone: 'all' | 'titleBlock' | 'titleCandidate' | 'customTitleRegion' = 'all',
  customRegion: TitleBlockRegion | null = null
) {
  const viewport = page.getViewport({ scale: 1 });
  const width = viewport.width || 1;
  const height = viewport.height || 1;
  const region = customRegion ? normalizeTitleBlockRegion(customRegion) : null;
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
      if (zone === 'customTitleRegion' && region) {
        const left = region.x * width;
        const right = (region.x + region.width) * width;
        const top = (1 - region.y) * height;
        const bottom = (1 - region.y - region.height) * height;
        return item.x >= left && item.x <= right && item.y >= bottom && item.y <= top;
      }
      if (zone === 'titleCandidate') return item.x > width * 0.5 && item.y < height * 0.38;
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
  return (await ocrPdfPageRegions(page)).text;
}

async function ocrPdfPageRegions(page: any, titleBlockRegion: TitleBlockRegion | null = null) {
  try {
    const canvasKit = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ??= canvasKit.DOMMatrix as typeof DOMMatrix;
    globalThis.DOMPoint ??= canvasKit.DOMPoint as typeof DOMPoint;
    globalThis.DOMRect ??= canvasKit.DOMRect as typeof DOMRect;
    globalThis.ImageData ??= canvasKit.ImageData as unknown as typeof ImageData;

    const viewport = page.getViewport({ scale: 2.3 });
    const canvas = canvasKit.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext('2d');
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
      viewport
    }).promise;
    const region = normalizeTitleBlockRegion(titleBlockRegion);
    const titleBlockCrop = region
      ? cropCanvas(
          canvasKit,
          canvas,
          canvas.width * region.x,
          canvas.height * region.y,
          canvas.width * region.width,
          canvas.height * region.height
        )
      : cropCanvas(canvasKit, canvas, canvas.width * 0.5, canvas.height * 0.62, canvas.width * 0.5, canvas.height * 0.38);
    const [rightText, titleBlockText, fullPageText] = await Promise.all([
      recognizeImage(cropCanvas(canvasKit, canvas, canvas.width * 0.68, 0, canvas.width * 0.32, canvas.height), {
        tessedit_pageseg_mode: '11'
      }),
      recognizeImage(titleBlockCrop),
      recognizeImage(new Uint8Array(canvas.toBuffer('image/png')), {
        tessedit_pageseg_mode: '11'
      })
    ]);
    return {
      titleBlockText: titleBlockText.slice(0, MAX_PAGE_TEXT),
      text: [rightText, titleBlockText, fullPageText].join('\n').slice(0, MAX_PAGE_TEXT)
    };
  } catch (error) {
    console.error('[files] PDF raster OCR failed:', error);
    return { titleBlockText: '', text: '' };
  }
}

export function classifyDocument(filename: string, contentType: string, folderName: string): DocumentKind {
  const haystack = `${filename} ${contentType} ${folderName}`.toLowerCase();
  const folder = folderName.toLowerCase();
  if (/\bspec(?:s|ification|ifications)?\b/.test(haystack) || haystack.includes('project manual') || /\bdivision\s+\d{1,2}\b/.test(haystack)) {
    return 'specification';
  }
  if (
    /\b(rfi|rfis|submittals?|documents?|contracts?|meeting notes?|schedules?|safety|photos?|pictures?|purchase orders?|close[-\s]?out|o&m)\b/.test(folder)
  ) {
    return 'file';
  }
  if (haystack.includes('drawing') || haystack.includes('sheet') || haystack.includes('plan')) return 'drawing';
  if (contentType === 'application/pdf' || contentType.startsWith('image/')) return 'drawing';
  return 'file';
}

export function basicDrawingAnalysis(
  filename: string,
  contentType: string,
  folderName = '',
  status: DrawingAnalysis['ocrStatus'] = 'pending',
  documentKindOverride: DocumentKind | null = null
): DrawingAnalysis {
  const documentKind = documentKindOverride ?? classifyDocument(filename, contentType, folderName);
  const fallback = parseSheetName(filename);
  return {
    documentKind,
    pageCount: 1,
    sheetNumber: fallback.sheetNumber,
    sheetTitle: fallback.sheetTitle,
    revision: fallback.revision,
    ocrStatus: documentKind === 'drawing' ? status : 'skipped',
    ocrText: '',
    pages: []
  };
}

export async function extractPdfPageSkeleton(bytes: Uint8Array, filename: string) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return fallbackPages(pdf.getPageCount(), filename);
}

export async function basicDrawingAnalysisFromBytes(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  folderName = '',
  status: DrawingAnalysis['ocrStatus'] = 'pending',
  documentKindOverride: DocumentKind | null = null
): Promise<DrawingAnalysis> {
  const basic = basicDrawingAnalysis(filename, contentType, folderName, status, documentKindOverride);
  if (basic.documentKind !== 'drawing' || !isPdfDocument(filename, contentType)) return basic;

  try {
    const pages = await extractPdfPageSkeleton(bytes, filename);
    return analysisFromPages(basic.documentKind, parseSheetName(filename), pages, basic.ocrStatus);
  } catch {
    return {
      ...basic,
      pages: [fallbackPage(1, filename, parseSheetName(filename), true)]
    };
  }
}

async function extractPdfPages(bytes: Uint8Array, filename: string, options: DrawingOcrOptions = {}): Promise<DrawingPageAnalysis[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes)
  });
  const pdf = await loadingTask.promise;
  const pages: DrawingPageAnalysis[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const titleBlockRegion = normalizeTitleBlockRegion(options.titleBlockRegion);
      const selectedTitleLines = titleBlockRegion ? positionedLines(textContent, page, 'customTitleRegion', titleBlockRegion) : [];
      const titleBlockLines = positionedLines(textContent, page, 'titleBlock');
      const titleCandidateLines = positionedLines(textContent, page, 'titleCandidate');
      const positionedFullPageLines = positionedLines(textContent, page, 'all');
      const rawText = textContent.items
        .map((item: unknown) => {
          const candidate = item as { str?: string };
          return candidate.str ?? '';
        })
        .join('\n')
        .slice(0, MAX_PAGE_TEXT);
      let lines = positionedFullPageLines.length ? positionedFullPageLines : linesFromText(rawText);
      let text = lines.length ? lines.join('\n').slice(0, MAX_PAGE_TEXT) : rawText;
      const filenameFallback = pageNumber === 1 ? parseSheetName(filename) : { sheetNumber: null, sheetTitle: null, revision: null };
      const titleBlockSheetCandidate = bestSheetNumberCandidate(titleBlockLines);
      const fullPageSheetCandidate = bestSheetNumberCandidate(lines);
      let sheetNumber = titleBlockSheetCandidate?.sheetNumber ?? fullPageSheetCandidate?.sheetNumber ?? filenameFallback.sheetNumber;
      let sheetNumberScore = titleBlockSheetCandidate?.score ?? fullPageSheetCandidate?.score ?? 0;
      let sheetNumberFromTitleBlock = Boolean(titleBlockSheetCandidate);
      const lowerPageLines = lines.slice(Math.floor(lines.length * 0.55));
      let sheetTitle =
        extractSheetTitle(selectedTitleLines, sheetNumber) ??
        extractSheetTitle(titleCandidateLines, sheetNumber) ??
        extractSheetTitle(titleBlockLines, sheetNumber) ??
        extractSheetTitle(lowerPageLines, sheetNumber) ??
        filenameFallback.sheetTitle;
      let revision = extractRevision(titleBlockLines) ?? extractRevision(lines) ?? filenameFallback.revision;

      if (needsOcr(text, lines, sheetNumber, sheetTitle) || needsTitleBlockOcr(titleBlockLines, sheetNumberFromTitleBlock, sheetTitle)) {
        const ocr = await ocrPdfPageRegions(page, titleBlockRegion);
        const ocrText = ocr.text;
        if (ocrText) {
          const ocrLines = linesFromText(ocrText);
          const ocrTitleLines = linesFromText(ocr.titleBlockText);
          const ocrSheetCandidate = bestSheetNumberCandidate(ocrLines);
          if (
            ocrSheetCandidate?.sheetNumber &&
            (!sheetNumber || (!sheetNumberFromTitleBlock && ocrSheetCandidate.score > sheetNumberScore + 4))
          ) {
            sheetNumber = ocrSheetCandidate.sheetNumber;
            sheetNumberScore = ocrSheetCandidate.score;
            sheetNumberFromTitleBlock = false;
          }
          sheetTitle = extractSheetTitle(ocrTitleLines, sheetNumber) ?? sheetTitle;
          revision = extractRevision(ocrTitleLines) ?? extractRevision(ocrLines) ?? revision;
          text = [text, ocrText].filter(Boolean).join('\n\n').slice(0, MAX_PAGE_TEXT);
          lines = [...lines, ...ocrLines].slice(0, 180);
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
  } finally {
    await pdf.destroy().catch(() => undefined);
  }

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

export async function analyzeDrawingUpload(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  folderName = '',
  documentKindOverride: DocumentKind | null = null,
  options: DrawingOcrOptions = {}
): Promise<DrawingAnalysis> {
  const documentKind = documentKindOverride ?? classifyDocument(filename, contentType, folderName);
  const fallback = parseSheetName(filename);
  const isPdf = isPdfDocument(filename, contentType);
  const isImage = contentType.startsWith('image/');

  if (documentKind !== 'drawing') {
    return basicDrawingAnalysis(filename, contentType, folderName, 'skipped', documentKind);
  }

  try {
    const pages = isPdf ? await extractPdfPages(bytes, filename, options) : isImage ? [await extractImagePage(bytes, filename)] : [];
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
    const pages = isPdf
      ? await extractPdfPageSkeleton(bytes, filename).catch(() => [fallbackPage(1, filename, fallback, true)])
      : [fallbackPage(1, filename, fallback, true)];
    return analysisFromPages(documentKind, fallback, pages, 'failed');
  }
}
