import { serverEnv } from './env';

type EmailMessage = {
  to: string | string[] | null | undefined;
  subject: string;
  html: string;
};

export function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function textToHtml(value: string | null | undefined) {
  return escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');
}

export async function sendPortalEmail(message: EmailMessage) {
  const apiKey = serverEnv('RESEND_API_KEY');
  const from = serverEnv('RESEND_FROM') ?? 'Pueblo Electric Portal <noreply@send.puebloelectrics.com>';
  const to = Array.isArray(message.to) ? message.to.filter(Boolean) : message.to ? [message.to] : [];

  if (!apiKey || to.length === 0) {
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject: message.subject,
      html: message.html
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[email] Resend failed:', result?.message ?? response.statusText);
    return { error: result?.message ?? response.statusText };
  }

  return result;
}
