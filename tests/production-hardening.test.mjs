import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('production auth fails closed and protects file APIs', () => {
  const hooks = file('src/hooks.server.ts');
  const protectedPathBody = hooks.match(/function isProtectedPath[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(hooks, /isProductionRuntime\(\)/);
  assert.match(hooks, /Portal authentication is not configured/);
  assert.match(hooks, /requiresAuthConfig\(pathname\)/);
  assert.match(hooks, /pathname === '\/login'/);
  assert.doesNotMatch(protectedPathBody, /pathname === '\/login'/);
  assert.match(hooks, /pathname\.startsWith\('\/api\/files'\)/);
});

test('local superadmin fallback is explicitly gated outside production', () => {
  const env = file('src/lib/server/env.ts');
  const localAuth = file('src/lib/server/local-auth.ts');
  const superadmin = file('src/lib/server/superadmin.ts');
  assert.match(env, /PORTAL_ENABLE_LOCAL_SUPERADMIN/);
  assert.match(env, /!isProductionRuntime\(\)/);
  assert.match(env, /process\.env\.VERCEL_ENV/);
  assert.doesNotMatch(env, /serverEnv\('VERCEL_ENV'\)/);
  assert.match(localAuth, /isLocalSuperadminEnabled\(\)/);
  assert.doesNotMatch(superadmin, /auth\.admin\.(createUser|updateUserById)/);
});

test('RFI and submittal writes are bound to project access and project id', () => {
  for (const path of [
    'src/routes/projects/[slug]/rfis/+page.server.ts',
    'src/routes/projects/[slug]/submittals/+page.server.ts'
  ]) {
    const source = file(path);
    assert.match(source, /requireProjectAccess/);
    assert.match(source, /\.eq\('project_id', access\.project\.id\)/);
  }
});

test('admin access email does not include plaintext temporary passwords', () => {
  const users = file('src/routes/admin/users/+page.server.ts');
  const usersUi = file('src/routes/admin/users/+page.svelte');
  assert.doesNotMatch(users, /temporary password is/i);
  assert.doesNotMatch(users, /createUser\(\{[\s\S]*password/);
  assert.doesNotMatch(users, /tempPassword/);
  assert.doesNotMatch(usersUi, /name="password"/);
  assert.match(users, /escapeHtml/);
});

test('admin page loads enforce superadmin access directly', () => {
  for (const path of [
    'src/routes/admin/+page.server.ts',
    'src/routes/admin/projects/+page.server.ts',
    'src/routes/admin/users/+page.server.ts'
  ]) {
    const source = file(path);
    assert.match(source, /requireSuperadmin\(event\)/);
  }
});

test('OCR reindex preserves existing metadata when work is deferred', () => {
  const source = file('src/routes/api/files/[id]/reindex/+server.ts');
  assert.match(source, /if \(!ocr\.completed\)/);
  assert.match(source, /ocrDeferred: true/);
  assert.match(source, /drawing_pages/);
});

test('production hardening migration adds review RLS and audit log', () => {
  const migration = file('supabase/migrations/0006_production_hardening.sql');
  assert.match(migration, /can_project_write/);
  assert.match(migration, /can_project_review/);
  assert.match(migration, /Project reviewers can update RFIs/);
  assert.match(migration, /Project reviewers can update submittals/);
  assert.match(migration, /create table if not exists admin_audit_log/);
});
