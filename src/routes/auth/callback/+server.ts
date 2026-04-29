import { json, redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

const emailOtpTypes = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email'
]);

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = emailOtpType(url.searchParams.get('type'));
  const next = callbackNext(url);

  if (code && locals.supabase) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw redirect(303, errorPath(next, error.message));
    }

    throw redirect(303, next);
  }

  if (tokenHash && type && locals.supabase) {
    const { error } = await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      throw redirect(303, errorPath(next, error.message));
    }

    throw redirect(303, next);
  }

  return new Response(callbackHtml(next), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.supabase) {
    return json({ error: 'Supabase is not configured yet.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';

  if (!accessToken || !refreshToken) {
    return json({ error: 'The email link did not include a complete sign-in session.' }, { status: 400 });
  }

  const { error } = await locals.supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (error) {
    return json({ error: friendlyError(error.message) }, { status: 400 });
  }

  return json({ ok: true });
};

function safeNext(next: string) {
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  if (next.startsWith('/auth/callback')) return '/';
  return next;
}

function callbackNext(url: URL) {
  const next = url.searchParams.get('next');
  if (next) return safeNext(next);

  const redirectTo = url.searchParams.get('redirect_to');
  if (!redirectTo) return '/';

  try {
    const parsed = new URL(redirectTo, url.origin);
    if (parsed.origin !== url.origin) return '/';

    if (parsed.pathname === '/auth/callback') {
      return safeNext(parsed.searchParams.get('next') ?? '/');
    }

    return safeNext(`${parsed.pathname}${parsed.search}`);
  } catch {
    return '/';
  }
}

function emailOtpType(type: string | null): EmailOtpType | null {
  if (!type) return null;
  return emailOtpTypes.has(type as EmailOtpType) ? (type as EmailOtpType) : null;
}

function errorPath(next: string, raw: string) {
  const target = next === '/reset-password' ? '/reset-password' : '/login';
  return `${target}?error=${encodeURIComponent(friendlyError(raw))}`;
}

function friendlyError(raw: string) {
  const lower = raw.toLowerCase();
  if (lower.includes('expired') || lower.includes('invalid')) return 'That email link expired or was already used. Request a fresh link and try again.';
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  return raw;
}

function callbackHtml(next: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing in | Pueblo Electric Project Portal</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f7f5;
        color: #191b19;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        border: 1px solid rgba(25, 27, 25, 0.1);
        border-radius: 0.75rem;
        background: #fff;
        padding: 2rem;
        box-shadow: 0 18px 48px -36px rgba(0, 0, 0, 0.5);
      }
      h1 {
        margin: 0;
        font-size: 1.4rem;
        line-height: 1.2;
      }
      p {
        margin: 0.75rem 0 0;
        color: #59615a;
        line-height: 1.55;
      }
      a {
        color: #1d5fb8;
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Signing you in...</h1>
      <p id="status">Finishing the secure email sign-in.</p>
    </main>
    <script>
      const next = ${JSON.stringify(next)};
      const status = document.getElementById('status');
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const linkError = params.get('error_description') || params.get('error');

      function fail(message) {
        const login = '/login?error=' + encodeURIComponent(message);
        status.innerHTML = 'The email link could not be completed. <a href="' + login + '">Return to sign in</a>.';
      }

      async function finish() {
        if (linkError) {
          fail(linkError);
          return;
        }

        if (!accessToken || !refreshToken) {
          window.location.replace(next);
          return;
        }

        const response = await fetch('/auth/callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          fail(result.error || 'That email link expired or was already used. Request a fresh link and try again.');
          return;
        }

        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        window.location.replace(next);
      }

      finish().catch(() => fail('The email link could not be completed. Please try again.'));
    </script>
  </body>
</html>`;
}
