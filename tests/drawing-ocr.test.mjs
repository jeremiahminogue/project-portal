import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function loadDrawingOcrModule() {
  const source = readFileSync(new URL('../src/lib/server/drawing-ocr.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });
  mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true });
  const modulePath = new URL(`../tmp/drawing-ocr-test-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`, import.meta.url);
  writeFileSync(modulePath, outputText, 'utf8');
  try {
    return await import(modulePath.href);
  } finally {
    unlinkSync(modulePath);
  }
}

async function drawingPdf(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const [sheetNumber, sheetTitle] of pages) {
    const page = pdf.addPage([792, 612]);
    page.drawText('SHEET INDEX', { x: 50, y: 560, size: 14, font });
    page.drawText('C-0.1 GENERAL NOTES', { x: 50, y: 535, size: 10, font });
    page.drawText('C-0.2 LEGEND', { x: 50, y: 518, size: 10, font });
    page.drawText('PUEBLO ELECTRIC PROJECT', { x: 250, y: 300, size: 16, font });
    page.drawText('DRAWING NUMBER', { x: 565, y: 95, size: 8, font });
    page.drawText(sheetNumber, { x: 565, y: 80, size: 14, font });
    page.drawText('DRAWING TITLE', { x: 565, y: 60, size: 8, font });
    page.drawText(sheetTitle, { x: 565, y: 45, size: 10, font });
  }

  return new Uint8Array(await pdf.save());
}

async function drawingPdfWithUnlabeledTitleBlock({ sheetNumber, sheetTitle, noise }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([792, 612]);
  page.drawText('SHEET INDEX', { x: 50, y: 560, size: 14, font });
  page.drawText('FA-001 JCI CONTACTS', { x: 50, y: 535, size: 10, font });
  page.drawText(noise, { x: 565, y: 185, size: 10, font });
  page.drawText(sheetTitle, { x: 565, y: 90, size: 10, font });
  page.drawText('DRAWING NUMBER', { x: 565, y: 55, size: 8, font });
  page.drawText(sheetNumber, { x: 565, y: 40, size: 14, font });
  return new Uint8Array(await pdf.save());
}

async function drawingPdfWithSelectableTitleRegion() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([792, 612]);
  page.drawText('MAIN LOBBY DEVICE PLAN', { x: 80, y: 500, size: 12, font });
  page.drawText('PUEBLO ELECTRIC PROJECT', { x: 250, y: 300, size: 16, font });
  page.drawText('DRAWING NUMBER', { x: 565, y: 95, size: 8, font });
  page.drawText('FA-301', { x: 565, y: 80, size: 14, font });
  page.drawText('REV', { x: 565, y: 60, size: 8, font });
  page.drawText('0', { x: 565, y: 45, size: 10, font });
  return new Uint8Array(await pdf.save());
}

async function withoutPdfjsStandardFontWarning(callback) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0] ?? '').includes('standardFontDataUrl')) return;
    originalWarn(...args);
  };
  try {
    return await callback();
  } finally {
    console.warn = originalWarn;
  }
}

test('drawing OCR preserves dashed sheet numbers from names', async () => {
  const { parseSheetName } = await loadDrawingOcrModule();
  assert.equal(parseSheetName('C-1.0 OVERALL SITE PLAN.pdf').sheetNumber, 'C-1.0');
  assert.equal(parseSheetName('C_3.4 DRAINAGE PLAN.pdf').sheetNumber, 'C-3.4');
  assert.equal(parseSheetName('E101 LIGHTING PLAN.pdf').sheetNumber, 'E-101');
  assert.equal(parseSheetName('FA-001 JCI CONTACTS Rev. A.pdf').revision, 'A');
});

test('drawing OCR prefers title block metadata over sheet index entries', async () => {
  const { analyzeDrawingUpload } = await loadDrawingOcrModule();
  const bytes = await drawingPdf([
    ['C-1.0', 'OVERALL SITE PLAN'],
    ['C-1.1', 'OVERALL UTILITY PLAN']
  ]);

  const analysis = await withoutPdfjsStandardFontWarning(() =>
    analyzeDrawingUpload(bytes, 'Civil Drawing Updates 1-22-2026.pdf', 'application/pdf', 'Civil')
  );

  assert.equal(analysis.ocrStatus, 'indexed');
  assert.equal(analysis.pageCount, 2);
  assert.equal(analysis.sheetNumber, 'C-1.0');
  assert.equal(analysis.sheetTitle, 'OVERALL SITE PLAN');
  assert.deepEqual(
    analysis.pages.map((page) => [page.sheetNumber, page.sheetTitle]),
    [
      ['C-1.0', 'OVERALL SITE PLAN'],
      ['C-1.1', 'OVERALL UTILITY PLAN']
    ]
  );
});

test('drawing OCR does not read title words as revisions', async () => {
  const { analyzeDrawingUpload } = await loadDrawingOcrModule();
  const bytes = await drawingPdf([
    ['FA-201', 'FIRE ALARM RISER'],
    ['FA-702', 'REF. NOTES']
  ]);

  const analysis = await withoutPdfjsStandardFontWarning(() =>
    analyzeDrawingUpload(bytes, 'Ag Palace Fire Alarm.pdf', 'application/pdf', 'AG Palace')
  );

  assert.deepEqual(
    analysis.pages.map((page) => page.revision),
    [null, null]
  );
});

test('drawing OCR ignores title-block legend snippets when picking sheet titles', async () => {
  const { analyzeDrawingUpload } = await loadDrawingOcrModule();
  const bytes = await drawingPdfWithUnlabeledTitleBlock({
    sheetNumber: 'FA-501',
    sheetTitle: 'FIRE ALARM RISER DIAGRAM',
    noise: 'ORG BLU YEL'
  });

  const analysis = await withoutPdfjsStandardFontWarning(() =>
    analyzeDrawingUpload(bytes, 'Ag Palace Fire Alarm.pdf', 'application/pdf', 'AG Palace')
  );

  assert.equal(analysis.sheetTitle, 'FIRE ALARM RISER DIAGRAM');
  assert.equal(analysis.pages[0].sheetTitle, 'FIRE ALARM RISER DIAGRAM');
});

test('drawing OCR can use a saved title area when the title is outside the default block', async () => {
  const { analyzeDrawingUpload } = await loadDrawingOcrModule();
  const bytes = await drawingPdfWithSelectableTitleRegion();

  const analysis = await withoutPdfjsStandardFontWarning(() =>
    analyzeDrawingUpload(bytes, 'Ag Palace Fire Alarm.pdf', 'application/pdf', 'AG Palace', 'drawing', {
      titleBlockRegion: { x: 0.06, y: 0.12, width: 0.42, height: 0.18 }
    })
  );

  assert.equal(analysis.sheetNumber, 'FA-301');
  assert.equal(analysis.sheetTitle, 'MAIN LOBBY DEVICE PLAN');
  assert.equal(analysis.pages[0].sheetTitle, 'MAIN LOBBY DEVICE PLAN');
});

test('drawing OCR keeps full-page raster fallback for scanned title blocks', () => {
  const source = readFileSync(new URL('../src/lib/server/drawing-ocr.ts', import.meta.url), 'utf8');
  assert.match(source, /needsTitleBlockOcr/);
  assert.match(source, /recognizeImage\(new Uint8Array\(canvas\.toBuffer\('image\/png'\)\),/);
  assert.match(source, /needsOcr\(text, lines, sheetNumber, sheetTitle\) \|\| needsTitleBlockOcr/);
});

test('explicit spec and document uploads are not split into drawing pages', async () => {
  const { analyzeDrawingUpload, classifyDocument } = await loadDrawingOcrModule();
  const bytes = await drawingPdf([
    ['C-1.0', 'OVERALL SITE PLAN'],
    ['C-1.1', 'OVERALL UTILITY PLAN']
  ]);

  const spec = await analyzeDrawingUpload(bytes, 'Project Manual.pdf', 'application/pdf', 'Specifications', 'specification');
  assert.equal(spec.documentKind, 'specification');
  assert.equal(spec.pageCount, 1);
  assert.equal(spec.ocrStatus, 'skipped');
  assert.deepEqual(spec.pages, []);

  const document = await analyzeDrawingUpload(bytes, 'RFI-001 Response.pdf', 'application/pdf', 'RFIs', 'file');
  assert.equal(document.documentKind, 'file');
  assert.equal(document.pageCount, 1);
  assert.equal(document.ocrStatus, 'skipped');
  assert.deepEqual(document.pages, []);

  assert.equal(classifyDocument('Project Manual.pdf', 'application/pdf', 'Specifications'), 'specification');
  assert.equal(classifyDocument('RFI-001 Response.pdf', 'application/pdf', 'RFIs'), 'file');
  assert.equal(classifyDocument('Inspection Report.pdf', 'application/pdf', 'Documents'), 'file');
});
