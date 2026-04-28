# Drawing OCR Handoff

This document describes the drawing/specification OCR pipeline used in the Pueblo Electric Project Portal so another agent can recreate it in a different application.

## Goal

When a user uploads a drawing PDF or image, the app should:

1. Store the file in object storage.
2. Detect whether it is a drawing, specification, or generic file.
3. For drawings, identify each sheet/page.
4. Extract and store:
   - `sheet_number`
   - `sheet_title`
   - `revision`
   - `page_count`
   - `ocr_status`
   - searchable `ocr_text`
5. Create child page rows for multi-page PDFs.
6. Allow manual page metadata correction.
7. Allow admin/member users to re-run OCR later without re-uploading.

The working source in this app is:

- `src/lib/server/drawing-ocr.ts`
- `src/lib/server/ocr-processing.ts`
- `src/routes/api/files/upload/+server.ts`
- `src/routes/api/files/[id]/reindex/+server.ts`
- `src/routes/api/files/[id]/pages/[pageId]/+server.ts`
- `supabase/migrations/0005_drawing_ocr_pages.sql`

## Dependencies

Install these packages server-side:

```bash
npm install pdfjs-dist@5.7.284 tesseract.js@7.0.0 @napi-rs/canvas@0.1.100
```

Why each exists:

- `pdfjs-dist`: reads PDF structure and extracts embedded text.
- `@napi-rs/canvas`: renders PDF pages to images in Node so scanned sheets can be OCR'd.
- `tesseract.js`: OCR engine for rendered PDF crops and uploaded images.

## Database Shape

Add metadata columns to the main `files` table:

```sql
alter table files
  add column if not exists document_kind text not null default 'file'
    check (document_kind in ('drawing', 'specification', 'file')),
  add column if not exists sheet_number text,
  add column if not exists sheet_title text,
  add column if not exists revision text,
  add column if not exists page_count integer not null default 1,
  add column if not exists ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'indexed', 'partial', 'failed', 'skipped')),
  add column if not exists ocr_text text;
```

Create one row per drawing page:

```sql
create table if not exists drawing_pages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  page_number integer not null,
  name text not null,
  sheet_number text,
  sheet_title text,
  revision text,
  ocr_text text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(file_id, page_number)
);
```

Recommended indexes:

```sql
create index if not exists files_project_id_document_kind_idx
  on files(project_id, document_kind);

create index if not exists files_project_id_sheet_number_idx
  on files(project_id, sheet_number)
  where sheet_number is not null;

create index if not exists drawing_pages_file_id_idx
  on drawing_pages(file_id);

create index if not exists drawing_pages_project_id_sheet_number_idx
  on drawing_pages(project_id, sheet_number)
  where sheet_number is not null;
```

Add RLS/policies appropriate for the target app. In this portal, project members can read pages, admins/members can insert/update, and admins can delete.

## Main API Contract

The analyzer should return:

```ts
type DocumentKind = 'drawing' | 'specification' | 'file';

type DrawingPageAnalysis = {
  pageNumber: number;
  name: string;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revision: string | null;
  text: string;
};

type DrawingAnalysis = {
  documentKind: DocumentKind;
  pageCount: number;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revision: string | null;
  ocrStatus: 'indexed' | 'partial' | 'failed' | 'skipped';
  ocrText: string;
  pages: DrawingPageAnalysis[];
};
```

Public entry point:

```ts
analyzeDrawingUpload(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  folderName = ''
): Promise<DrawingAnalysis>
```

## Upload Flow

1. Receive multipart upload.
2. Validate file, max size, project access.
3. Convert uploaded file to bytes:

```ts
const bytes = new Uint8Array(await rawFile.arrayBuffer());
```

4. Store the object, then run the guarded inline OCR helper:

```ts
const ocr = await analyzeDrawingUploadSafely(bytes, rawFile.name, contentType, folderName);
const analysis = ocr.analysis;
```

5. Store file in object storage.
6. Insert file row:

```ts
await db.files.insert({
  project_id,
  name: rawFile.name,
  storage_key,
  size_bytes: rawFile.size,
  mime_type: contentType,
  document_kind: analysis.documentKind,
  sheet_number: analysis.sheetNumber,
  sheet_title: analysis.sheetTitle,
  revision: analysis.revision,
  page_count: analysis.pageCount,
  ocr_status: analysis.ocrStatus,
  ocr_text: analysis.ocrText,
  uploaded_by: userId
});
```

7. Insert page rows:

```ts
await db.drawing_pages.insert(
  analysis.pages.map((page) => ({
    project_id,
    file_id,
    page_number: page.pageNumber,
    name: page.name,
    sheet_number: page.sheetNumber,
    sheet_title: page.sheetTitle,
    revision: page.revision,
    ocr_text: page.text
  }))
);
```

## Detection Strategy

### Document Kind

Classify from filename, MIME type, and upload folder:

- Contains `spec` -> `specification`
- Contains `drawing`, `sheet`, or `plan` -> `drawing`
- PDF/image defaults to `drawing`
- Everything else -> `file`

This is intentionally simple. In construction workflows, PDFs/images uploaded to the drawing/spec tools are usually construction documents.

### Sheet Number Pattern

Use a construction-discipline sheet regex and normalize OCR mistakes:

```ts
const DISCIPLINE_PREFIXES = new Set([
  'A', 'AD', 'AS',
  'C', 'CS',
  'E', 'EL',
  'FA', 'FP', 'FS',
  'G',
  'I', 'ID',
  'M',
  'P',
  'S',
  'T',
  'X'
]);

const SHEET_NUMBER_PATTERN =
  /\b(?:AD|AS|CS|EL|FA|FP|FS|ID|[ACEGIMPSTX])[-\s_.]?[0-9OILSZ]{1,4}(?:[.\-\s_]?[0-9OILSZ]{1,3})?[A-Z]?\b/gi;
```

Normalize common OCR substitutions:

- `O` -> `0`
- `I` -> `1`
- `L` -> `1`
- `S` -> `5`
- `Z` -> `2`

Examples:

- `FA-O01` -> `FA-001`
- `E I01` -> `E101`
- `FP-6O1` -> `FP-601`

### Candidate Scoring

Do not take the first regex match blindly. Score candidates:

- Add weight when line includes `sheet number`, `drawing no`, etc.
- Add weight for hyphenated/dotted numbers like `FA-101`.
- Add weight for multi-letter discipline prefixes like `FA`, `FP`, `EL`.
- Add slight weight for lines lower in the document because title blocks are often lower/right.
- Penalize sheet index/table-of-contents areas.
- Penalize obvious labels like `REV`, `NO`, `SHT`.

Then take the highest-scoring candidate.

## PDF Text Strategy

For each PDF page:

1. Use `pdfjs-dist/legacy/build/pdf.mjs`.
2. Load document from bytes:

```ts
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
```

3. Extract text content:

```ts
const page = await pdf.getPage(pageNumber);
const textContent = await page.getTextContent();
```

4. Build two line sets:
   - Full-page lines
   - Title-block-biased positioned lines

The title-block line extraction looks at item coordinates from `textContent.items`. It keeps text in likely title-block zones:

- Right side: `x > width * 0.68`
- Bottom: `y < height * 0.22`
- Lower-right: `x > width * 0.52 && y < height * 0.34`

Then sort by `y desc, x asc` and group nearby y-values into lines.

Use title-block lines first for sheet number/title/revision, then fall back to full-page lines, then filename parsing.

## OCR Fallback Strategy

Use OCR when:

- Extracted PDF text is tiny, or
- Few usable lines were found, or
- No sheet number was detected.

For OCR, render the PDF page to a high-resolution canvas:

```ts
const canvasKit = await import('@napi-rs/canvas');

globalThis.DOMMatrix ??= canvasKit.DOMMatrix as typeof DOMMatrix;
globalThis.DOMPoint ??= canvasKit.DOMPoint as typeof DOMPoint;
globalThis.DOMRect ??= canvasKit.DOMRect as typeof DOMRect;
globalThis.ImageData ??= canvasKit.ImageData as unknown as typeof ImageData;

const viewport = page.getViewport({ scale: 2.3 });
const canvas = canvasKit.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const canvasContext = canvas.getContext('2d');
await page.render({ canvasContext, viewport }).promise;
```

OCR three images, then concatenate results:

1. Right vertical title-block strip:
   - `x = canvas.width * 0.68`
   - `y = 0`
   - `w = canvas.width * 0.32`
   - `h = canvas.height`
2. Bottom-right title-block area:
   - `x = canvas.width * 0.54`
   - `y = canvas.height * 0.68`
   - `w = canvas.width * 0.46`
   - `h = canvas.height * 0.32`
3. Full page image.

Run Tesseract:

```ts
const tesseract = await import('tesseract.js');
const result = await tesseract.default.recognize(Buffer.from(bytes), 'eng');
const text = String(result.data.text ?? '');
```

Why this works: many construction drawings bury the useful sheet number/title in the right-side or bottom-right title block. Cropping those areas gives Tesseract a better chance than only reading the full sheet.

## Title Extraction

Title extraction should:

1. Prefer text on the same line after the sheet number.
2. Look near `sheet title` / `drawing title` labels.
3. Fall back to the first usable title-like line.

Reject poor title lines:

- Too short or too long.
- Starts with labels like `sheet`, `drawing`, `number`, `date`, `scale`, `revision`.
- Contains company/contact/copyright noise.
- Numeric-only lines.

Also reject likely project titles when looking for sheet titles. In this app, very long project/system names like `FIRE ALARM SYSTEM` often appear near the title block but are not sheet titles.

## Re-index Flow

Add a re-index endpoint/action for existing files.

Flow:

1. Load file row and storage key.
2. Verify user can modify project files.
3. Fetch object bytes from storage.
4. Mark the file `ocr_status = 'pending'`.
5. Run `analyzeDrawingUploadSafely`.
6. If OCR is deferred or times out, keep `ocr_status = 'pending'` and let the user retry re-index later.
7. Update the parent `files` metadata.
8. Delete old `drawing_pages` for the file.
9. Insert new `drawing_pages`.

Important: the UI should confirm before re-indexing because this replaces detected sheet/page metadata and could overwrite manual corrections.

## Manual Correction Flow

OCR will never be perfect. Add inline editing for page rows:

PATCH payload:

```json
{
  "sheetNumber": "FA-101",
  "sheetTitle": "Device Placement Plan"
}
```

Server behavior:

1. Verify page belongs to file.
2. Verify project access.
3. Clean/sanitize values.
4. Build page display name:
   - `FA-101 - Device Placement Plan`
5. Update `drawing_pages`.
6. If page 1 is changed, optionally update parent `files.sheet_number`, `files.sheet_title`, and `files.revision`.

## UI Integration

In the drawing log, display:

- Parent file row.
- Child page rows indented below the file.
- Page row link should include the page number:

```ts
function viewerHref(fileId: string, pageNumber = 1) {
  const params = pageNumber > 1 ? `?page=${pageNumber}` : '';
  return `/projects/${projectSlug}/files/${encodeURIComponent(fileId)}${params}`;
}
```

For the PDF viewer, read `?page=n` and jump to that page after the PDF layout is ready. With EmbedPDF this is done through the `scroll` plugin capability:

```ts
const registry = await viewer.registry;
await registry.pluginsReady();
const scroll = registry.getPlugin('scroll')?.provides();
scroll.scrollToPage({ pageNumber, behavior: 'instant', alignY: 0 });
```

If the PDF URL is protected, configure the viewer fetch to send cookies:

```ts
documentManager: {
  initialDocuments: [{
    url: pdfUrl,
    name: title,
    mode: 'full-fetch',
    autoActivate: true,
    requestOptions: {
      credentials: 'same-origin'
    }
  }]
}
```

## Tuning Knobs

Adjust these based on the target application's drawings:

- `DISCIPLINE_PREFIXES`: add local discipline prefixes.
- `SHEET_NUMBER_PATTERN`: broaden if you have unusual sheet formats.
- Title-block crop zones: change right/bottom percentages if your title blocks are elsewhere.
- Render scale: `2.3` is a good quality/performance balance.
- `MAX_PAGE_TEXT` and `MAX_FILE_TEXT`: keep stored OCR text bounded.
- Candidate scoring: tune penalties if sheet indexes are still winning over real title blocks.

## Testing Checklist

Use a drawing PDF with multiple pages and known sheet numbers.

Confirm:

- Upload completes.
- `files.document_kind = drawing`.
- Parent file has first sheet metadata.
- `drawing_pages` has one row per PDF page.
- Page rows have reasonable `sheet_number` and `sheet_title`.
- Drawing log page links include `?page=n`.
- Viewer opens the correct page, not always page 1.
- Manual correction saves.
- Re-index recreates page rows.
- Re-index prompts/communicates that it may overwrite corrections.

## Known Limitations

- Scanned drawings with rotated title blocks can still produce bad OCR.
- Sheet indexes can look like valid sheet data; candidate scoring reduces but does not eliminate this.
- OCR is CPU-heavy. For large uploads, move analysis into a background job if request timeouts become a problem.
- Current production hardening bounds inline OCR with `PORTAL_OCR_INLINE_MAX_BYTES` and `PORTAL_OCR_TIMEOUT_MS`; oversized or timed-out work stays pending for manual re-index.
- Manual correction is still required for edge cases, so keep that UI fast and visible.

