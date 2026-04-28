import {
  analyzeDrawingUpload,
  basicDrawingAnalysis,
  type DrawingAnalysis
} from './drawing-ocr';
import { serverEnv } from './env';

type OcrOutcome = {
  analysis: DrawingAnalysis;
  completed: boolean;
  reason?: 'deferred_size' | 'timeout' | 'failed';
};

function numberEnv(name: string, fallback: number) {
  const value = Number(serverEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const INLINE_MAX_BYTES = numberEnv('PORTAL_OCR_INLINE_MAX_BYTES', 15 * 1024 * 1024);
const OCR_TIMEOUT_MS = numberEnv('PORTAL_OCR_TIMEOUT_MS', 20_000);

function timeout(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('OCR analysis timed out.')), ms);
  });
}

export function shouldAnalyzeInline(sizeBytes: number) {
  return sizeBytes <= INLINE_MAX_BYTES;
}

export async function analyzeDrawingUploadSafely(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  folderName = ''
): Promise<OcrOutcome> {
  const pending = basicDrawingAnalysis(filename, contentType, folderName, 'pending');
  if (pending.ocrStatus === 'skipped') return { analysis: pending, completed: true };

  if (!shouldAnalyzeInline(bytes.byteLength)) {
    return { analysis: pending, completed: false, reason: 'deferred_size' };
  }

  try {
    const analysis = await Promise.race([
      analyzeDrawingUpload(bytes, filename, contentType, folderName),
      timeout(OCR_TIMEOUT_MS)
    ]);
    return { analysis, completed: true };
  } catch (error) {
    const failed = basicDrawingAnalysis(filename, contentType, folderName, 'failed');
    return {
      analysis: error instanceof Error && error.message.includes('timed out') ? pending : failed,
      completed: false,
      reason: error instanceof Error && error.message.includes('timed out') ? 'timeout' : 'failed'
    };
  }
}
