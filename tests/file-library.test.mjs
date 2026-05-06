import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

async function loadFileLibraryModule() {
  const source = readFileSync(new URL('../src/lib/file-library.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });
  mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true });
  const modulePath = new URL(`../tmp/file-library-test-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`, import.meta.url);
  writeFileSync(modulePath, outputText, 'utf8');
  try {
    return await import(modulePath.href);
  } finally {
    unlinkSync(modulePath);
  }
}

test('documents only include general files, not RFI or submittal attachments', async () => {
  const { fileMatchesTool } = await loadFileLibraryModule();

  assert.equal(
    fileMatchesTool(
      {
        name: 'OAC Minutes.docx',
        path: 'Meeting Notes/OAC Minutes.docx',
        type: 'docx',
        documentKind: 'file'
      },
      'documents'
    ),
    true
  );

  assert.equal(
    fileMatchesTool(
      {
        name: 'OAC Minutes.pdf',
        path: 'Meeting Minutes/OAC Minutes.pdf',
        type: 'pdf'
      },
      'documents'
    ),
    true
  );

  assert.equal(
    fileMatchesTool(
      {
        name: 'Simplex Data Sheet.pdf',
        path: 'Submittal S-002 Attachments/Simplex Data Sheet.pdf',
        type: 'pdf',
        documentKind: 'file',
        tags: ['attachment'],
        linkedItemKinds: ['submittal']
      },
      'documents'
    ),
    false
  );

  assert.equal(
    fileMatchesTool(
      {
        name: 'Response Sketch.pdf',
        path: 'RFI 001 Attachments/Response Sketch.pdf',
        type: 'pdf',
        documentKind: 'file',
        linkedItemKinds: ['rfi']
      },
      'drawings'
    ),
    false
  );
});

test('linked drawings and specifications keep their library category', async () => {
  const { fileMatchesTool } = await loadFileLibraryModule();

  assert.equal(
    fileMatchesTool(
      {
        name: 'E-101 Lighting Plan.pdf',
        path: 'Drawings/E-101 Lighting Plan.pdf',
        type: 'pdf',
        documentKind: 'drawing',
        linkedItemKinds: ['rfi']
      },
      'drawings'
    ),
    true
  );

  assert.equal(
    fileMatchesTool(
      {
        name: 'Project Manual.pdf',
        path: 'Specifications/Project Manual.pdf',
        type: 'pdf',
        documentKind: 'specification',
        linkedItemKinds: ['submittal']
      },
      'specifications'
    ),
    true
  );
});
