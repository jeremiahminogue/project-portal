import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function file(path) {
  return readFileSync(path, 'utf8');
}

test('schedule supports MS Project import metadata and clean look-ahead views', () => {
  const migration = file('supabase/migrations/0014_schedule_import_metadata.sql');
  const parser = file('src/lib/server/schedule-import.ts');
  const route = file('src/routes/projects/[slug]/schedule/+page.server.ts');
  const page = file('src/routes/projects/[slug]/schedule/+page.svelte');
  const dashboard = file('src/routes/projects/[slug]/+page.svelte');

  assert.match(migration, /source_order/);
  assert.match(migration, /source_wbs/);
  assert.match(migration, /predecessor_refs/);
  assert.match(parser, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(parser, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/);
  assert.match(parser, /pdfjsWorker/);
  assert.match(parser, /parseMsProjectXml/);
  assert.match(parser, /parseCsv/);
  assert.match(route, /importSchedule/);
  assert.match(route, /parseScheduleImport/);
  assert.match(route, /replaceSchedule/);
  assert.match(route, /canDeleteSchedule/);
  assert.match(route, /missingScheduleMetadataColumn/);
  assert.match(page, /Import schedule/);
  assert.match(page, /disabled=\{!data\.scheduleAccess\?\.canDelete\}/);
  assert.match(page, /Full/);
  assert.match(page, /2 week/);
  assert.match(page, /3 week/);
  assert.match(page, /4 week/);
  assert.match(page, /predecessorLabel/);
  assert.doesNotMatch(dashboard, /Next milestone/);
  assert.doesNotMatch(dashboard, /StatusPill/);
  assert.match(dashboard, /Open schedule/);
});
