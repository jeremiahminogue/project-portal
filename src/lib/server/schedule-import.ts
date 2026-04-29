import { XMLParser } from 'fast-xml-parser';

export type ImportedScheduleActivity = {
  phase: string;
  title: string;
  activityType: string;
  startDate: string;
  endDate: string;
  owner: string | null;
  status: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple';
  isBlackout: boolean;
  percentComplete: number;
  sourceOrder: number | null;
  sourceWbs: string | null;
  predecessorRefs: string | null;
};

const msDatePattern = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i;
const durationPattern = /^\d+(?:\.\d+)?\s+(?:day|days|hr|hrs|hour|hours|wk|wks|week|weeks)s?$/i;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = text.match(msDatePattern);
  if (ms) {
    const year = Number(ms[3].length === 2 ? `20${ms[3]}` : ms[3]);
    return `${year}-${pad(Number(ms[1]))}-${pad(Number(ms[2]))}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (compact) {
    const year = Number(compact[3].length === 2 ? `20${compact[3]}` : compact[3]);
    return `${year}-${pad(Number(compact[1]))}-${pad(Number(compact[2]))}`;
  }
  return null;
}

function stripWbs(taskName: string) {
  const match = taskName.trim().match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
  if (!match) return { wbs: null, title: taskName.trim(), level: 1 };
  return { wbs: match[1], title: match[2].trim(), level: match[1].split('.').length };
}

function activityTypeFor(title: string) {
  const lower = title.toLowerCase();
  if (/\bbcer\b/.test(lower)) return 'bcer';
  if (/\bahj\b|permit|review/.test(lower)) return 'ahj';
  if (/design|submittal|shop drawing/.test(lower)) return 'design';
  if (/install|rough|conduit|wire|panel|inspection|replace|testing|programming/.test(lower)) return 'field';
  if (/closeout|warranty|as built|o&m|blackout|complete|milestone/.test(lower)) return 'milestone';
  return 'internal';
}

function statusFor(type: string, isBlackout: boolean): ImportedScheduleActivity['status'] {
  if (isBlackout) return 'red';
  if (type === 'bcer') return 'purple';
  if (type === 'ahj') return 'blue';
  if (type === 'field') return 'amber';
  return 'green';
}

function buildActivities(
  rows: Array<{
    sourceOrder: number | null;
    taskName: string;
    startDate: string;
    endDate: string;
    predecessorRefs?: string | null;
    percentComplete?: number;
  }>
) {
  const parents = new Map<number, string>();
  const imported: ImportedScheduleActivity[] = [];

  for (const row of rows) {
    const { wbs, title, level } = stripWbs(row.taskName);
    for (const parentLevel of [...parents.keys()]) {
      if (parentLevel > level) parents.delete(parentLevel);
    }
    parents.set(level, title);
    const type = activityTypeFor(title);
    const isBlackout = /blackout/i.test(title);
    imported.push({
      phase: level <= 2 ? title : (parents.get(2) ?? parents.get(1) ?? 'Imported Schedule'),
      title,
      activityType: type,
      startDate: row.startDate,
      endDate: row.endDate,
      owner: null,
      status: statusFor(type, isBlackout),
      isBlackout,
      percentComplete: Math.min(100, Math.max(0, Math.round(row.percentComplete ?? 0))),
      sourceOrder: row.sourceOrder,
      sourceWbs: wbs,
      predecessorRefs: row.predecessorRefs?.trim() || null
    });
  }

  return imported;
}

function parsePdfTextItems(items: string[]) {
  const rows: Array<{ sourceOrder: number | null; taskName: string; startDate: string; endDate: string }> = [];
  for (let index = 0; index < items.length - 4; index += 1) {
    const id = items[index]?.trim();
    const taskName = items[index + 1]?.trim();
    const duration = items[index + 2]?.trim();
    const startDate = normalizeDate(items[index + 3]);
    const endDate = normalizeDate(items[index + 4]);
    if (!/^\d+$/.test(id) || !taskName) continue;
    if (durationPattern.test(duration) && startDate && endDate) {
      rows.push({ sourceOrder: Number(id), taskName, startDate, endDate });
      index += 4;
      continue;
    }

    const gluedDuration = taskName.match(/\s*(\d+(?:\.\d+)?\s*(?:day|days|hr|hrs|hour|hours|wk|wks|week|weeks)s?)$/i);
    const gluedStartDate = normalizeDate(items[index + 2]);
    const gluedEndDate = normalizeDate(items[index + 3]);
    if (gluedDuration && gluedStartDate && gluedEndDate) {
      rows.push({
        sourceOrder: Number(id),
        taskName: taskName.slice(0, gluedDuration.index).trim(),
        startDate: gluedStartDate,
        endDate: gluedEndDate
      });
      index += 3;
    }
  }
  return buildActivities(rows);
}

async function parsePdf(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const items: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    items.push(
      ...content.items
        .map((item) => ('str' in item ? item.str.trim() : ''))
        .filter(Boolean)
    );
  }
  return parsePdfTextItems(items);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseMsProjectXml(text: string) {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const document = parser.parse(text);
  const tasks = asArray(document?.Project?.Tasks?.Task);
  const rows = tasks
    .filter((task: Record<string, unknown>) => task?.Name && task?.Start && task?.Finish)
    .map((task: Record<string, unknown>, index: number) => {
      const predecessorRefs = asArray(task.PredecessorLink as Record<string, unknown> | Record<string, unknown>[] | undefined)
        .map((link) => String(link?.PredecessorUID ?? '').trim())
        .filter(Boolean)
        .join(', ');
      return {
        sourceOrder: Number(task.ID ?? index + 1),
        taskName: `${task.WBS ? `${task.WBS} ` : ''}${task.Name}`,
        startDate: normalizeDate(task.Start) ?? '',
        endDate: normalizeDate(task.Finish) ?? '',
        predecessorRefs,
        percentComplete: Number(task.PercentComplete ?? 0)
      };
    })
    .filter((row) => row.startDate && row.endDate);
  return buildActivities(rows);
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ''));
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = splitCsvLine(lines.shift() ?? '').map((cell) => cell.toLowerCase());
  const column = (...names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const idColumn = column('id', 'unique id');
  const nameColumn = column('task name', 'name');
  const startColumn = column('start');
  const finishColumn = column('finish', 'end');
  const predecessorColumn = column('predecessors', 'predecessor');
  const rows = lines.flatMap((line, index) => {
    const cells = splitCsvLine(line);
    const startDate = normalizeDate(cells[startColumn]);
    const endDate = normalizeDate(cells[finishColumn]);
    const taskName = cells[nameColumn]?.trim();
    if (!taskName || !startDate || !endDate) return [];
    return {
      sourceOrder: Number(cells[idColumn] || index + 1),
      taskName,
      startDate,
      endDate,
      predecessorRefs: predecessorColumn >= 0 ? cells[predecessorColumn] : null
    };
  });
  return buildActivities(rows);
}

export async function parseScheduleImport(file: File): Promise<ImportedScheduleActivity[]> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return parsePdf(bytes);

  const text = new TextDecoder().decode(bytes);
  if (name.endsWith('.xml') || /<Project[\s>]/.test(text)) return parseMsProjectXml(text);
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(text);

  throw new Error('Upload a PDF, XML, or CSV schedule export from Microsoft Project.');
}
