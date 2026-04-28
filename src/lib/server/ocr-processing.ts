import {
  analyzeDrawingUpload,
  basicDrawingAnalysis,
  basicDrawingAnalysisFromBytes,
  isPdfDocument,
  type DocumentKind,
  type DrawingAnalysis
} from './drawing-ocr';
import { serverEnv } from './env';

type OcrOutcome = {
  analysis: DrawingAnalysis;
  completed: boolean;
  reason?: 'deferred_size' | 'timeout' | 'failed';
};

type AnalyzeOcrOptions = {
  force?: boolean;
  timeoutMs?: number;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(serverEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const INLINE_MAX_BYTES = numberEnv('PORTAL_OCR_INLINE_MAX_BYTES', 15 * 1024 * 1024);
const PDF_PAGE_INDEX_MAX_BYTES = numberEnv('PORTAL_PDF_PAGE_INDEX_MAX_BYTES', 75 * 1024 * 1024);
const OCR_TIMEOUT_MS = numberEnv('PORTAL_OCR_TIMEOUT_MS', 30_000);
const MANUAL_OCR_TIMEOUT_MS = numberEnv('PORTAL_OCR_MANUAL_TIMEOUT_MS', 10 * 60_000);

function timeout(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('OCR analysis timed out.')), ms);
  });
}

export function shouldAnalyzeInline(sizeBytes: number) {
  return sizeBytes <= INLINE_MAX_BYTES;
}

export function shouldIndexPdfPages(sizeBytes: number, filename: string, contentType: string, documentKind: DocumentKind = 'drawing') {
  return documentKind === 'drawing' && isPdfDocument(filename, contentType) && sizeBytes <= PDF_PAGE_INDEX_MAX_BYTES;
}

export async function analyzeDrawingUploadSafely(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  folderName = '',
  documentKindOverride: DocumentKind | null = null,
  options: AnalyzeOcrOptions = {}
): Promise<OcrOutcome> {
  const pending = basicDrawingAnalysis(filename, contentType, folderName, 'pending', documentKindOverride);
  if (pending.ocrStatus === 'skipped') return { analysis: pending, completed: true };

  if (!options.force && !shouldAnalyzeInline(bytes.byteLength)) {
    return {
      analysis: await basicDrawingAnalysisFromBytes(bytes, filename, contentType, folderName, 'pending', documentKindOverride),
      completed: false,
      reason: 'deferred_size'
    };
  }

  try {
    const timeoutMs = options.timeoutMs ?? (options.force ? MANUAL_OCR_TIMEOUT_MS : OCR_TIMEOUT_MS);
    const analysis = await Promise.race([
      analyzeDrawingUpload(bytes, filename, contentType, folderName, documentKindOverride),
      timeout(timeoutMs)
    ]);
    return { analysis, completed: true };
  } catch (error) {
    const timedOut = error instanceof Error && error.message.includes('timed out');
    const analysis = await basicDrawingAnalysisFromBytes(
      bytes,
      filename,
      contentType,
      folderName,
      timedOut ? 'pending' : 'failed',
      documentKindOverride
    );
    return {
      analysis,
      completed: false,
      reason: timedOut ? 'timeout' : 'failed'
    };
  }
}
