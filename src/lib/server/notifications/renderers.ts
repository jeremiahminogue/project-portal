import { escapeHtml, textToHtml } from '$lib/server/email';
import { serverEnv } from '$lib/server/env';
import { notificationEventLabel, type NotificationRecipient, type PersistedNotificationEvent } from './types';
import { eventImpliesActionRequired } from './recipients';

type PhotoDigestItem = {
  fileId?: string | null;
  fileName: string;
  folderName?: string | null;
  uploadedBy?: string | null;
  createdAt?: string | null;
};

function metadataString(event: PersistedNotificationEvent, key: string, fallback = '') {
  const value = event.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function siteUrl() {
  return (serverEnv('PUBLIC_SITE_URL') ?? 'https://portal.puebloelectrics.com').replace(/\/+$/, '');
}

function projectPath(event: PersistedNotificationEvent) {
  const slug = metadataString(event, 'projectSlug');
  if (!slug) return siteUrl();
  if (event.entityType === 'rfi') return `${siteUrl()}/projects/${encodeURIComponent(slug)}/rfis`;
  if (event.entityType === 'submittal') return `${siteUrl()}/projects/${encodeURIComponent(slug)}/submittals`;
  return `${siteUrl()}/projects/${encodeURIComponent(slug)}/files?tool=documents`;
}

function subjectFor(event: PersistedNotificationEvent) {
  const number = metadataString(event, 'number');
  const title = metadataString(event, 'title') || metadataString(event, 'fileName') || metadataString(event, 'subject');
  const prefix = notificationEventLabel(event.type);
  return [prefix, number, title].filter(Boolean).join(': ');
}

function bodyFor(event: PersistedNotificationEvent, recipient: NotificationRecipient) {
  const projectName = metadataString(event, 'projectName', 'Project');
  const number = metadataString(event, 'number');
  const title = metadataString(event, 'title') || metadataString(event, 'fileName') || metadataString(event, 'subject');
  const actor = metadataString(event, 'actorName') || metadataString(event, 'actorEmail') || 'A project team member';
  const dueDate = metadataString(event, 'dueDate');
  const status = metadataString(event, 'status');
  const decision = metadataString(event, 'decision');
  const question = metadataString(event, 'question');
  const answer = metadataString(event, 'answer');
  const folder = metadataString(event, 'folderName');

  const details = [
    number ? `<li><strong>Number:</strong> ${escapeHtml(number)}</li>` : '',
    title ? `<li><strong>Title:</strong> ${escapeHtml(title)}</li>` : '',
    status ? `<li><strong>Status:</strong> ${escapeHtml(status)}</li>` : '',
    decision ? `<li><strong>Decision:</strong> ${escapeHtml(decision)}</li>` : '',
    dueDate ? `<li><strong>Due:</strong> ${escapeHtml(dueDate)}</li>` : '',
    folder ? `<li><strong>Folder:</strong> ${escapeHtml(folder)}</li>` : ''
  ]
    .filter(Boolean)
    .join('');

  const actionRequired = eventImpliesActionRequired(event.type) || recipient.required;
  const intro = actionRequired
    ? `${actor} assigned an action to you in ${projectName}.`
    : `${actor} updated ${projectName}.`;

  return `
    <p>${escapeHtml(intro)}</p>
    ${actionRequired ? '<p><strong>Action required.</strong></p>' : ''}
    ${details ? `<ul>${details}</ul>` : ''}
    ${question ? `<h3>Question</h3>${textToHtml(question)}` : ''}
    ${answer ? `<h3>Response</h3>${textToHtml(answer)}` : ''}
  `;
}

function emailShell(title: string, body: string, actionUrl: string, actionLabel = 'View in portal') {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#191b19;line-height:1.5">
      <h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h2>
      ${body}
      <p style="margin-top:20px">
        <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#191b19;color:#fff;text-decoration:none;border-radius:6px;padding:10px 14px;font-weight:700">
          ${escapeHtml(actionLabel)}
        </a>
      </p>
      <p style="margin-top:20px;color:#667066;font-size:12px">
        Pueblo Electric Project Portal notification. Mandatory action-required emails are sent even when optional notifications are disabled.
      </p>
    </div>
  `;
}

export function renderNotificationEmail(event: PersistedNotificationEvent, recipient: NotificationRecipient) {
  const subject = subjectFor(event);
  return {
    subject,
    html: emailShell(subject, bodyFor(event, recipient), projectPath(event))
  };
}

export function renderPhotoDigestEmail(input: {
  projectName: string;
  projectSlug: string;
  recipientName: string;
  photos: PhotoDigestItem[];
}) {
  const count = input.photos.length;
  const title = `${count} new project photo${count === 1 ? '' : 's'} uploaded`;
  const rows = input.photos
    .map((photo) => {
      const when = photo.createdAt ? new Date(photo.createdAt).toLocaleString('en-US', { timeZone: 'America/Denver' }) : '';
      const downloadLink = photo.fileId
        ? ` - <a href="${escapeHtml(`${siteUrl()}/api/files/${encodeURIComponent(photo.fileId)}/download`)}">Download</a>`
        : '';
      return `<li><strong>${escapeHtml(photo.fileName)}</strong>${photo.folderName ? ` in ${escapeHtml(photo.folderName)}` : ''}${photo.uploadedBy ? ` by ${escapeHtml(photo.uploadedBy)}` : ''}${when ? ` (${escapeHtml(when)})` : ''}${downloadLink}</li>`;
    })
    .join('');
  const html = emailShell(
    title,
    `<p>Hi ${escapeHtml(input.recipientName)}, here are the photos uploaded to ${escapeHtml(input.projectName)} since the last digest.</p><ul>${rows}</ul>`,
    `${siteUrl()}/projects/${encodeURIComponent(input.projectSlug)}/files?tool=documents`,
    'View project photos'
  );

  return {
    subject: `${input.projectName}: ${title}`,
    html
  };
}
