import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'node_modules/vite/dist/node/chunks/node.js';

if (existsSync(file)) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('function optimizeSafeRealPathSync() {');
  const end = source.indexOf('\nfunction ensureWatchedFile', start);

  if (start !== -1 && end !== -1 && source.slice(start, end).includes('exec("net use"')) {
    const replacement = [
      'function optimizeSafeRealPathSync() {',
      '\tsafeRealpathSync = fs.realpathSync.native;',
      '}'
    ].join('\n');

    writeFileSync(file, `${source.slice(0, start)}${replacement}${source.slice(end)}`);
  }
}
