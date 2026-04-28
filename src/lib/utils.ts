export function initialsFor(
  profile: { full_name: string | null; email: string | null } | null | undefined,
  fallbackEmail?: string | null
) {
  const source = profile?.full_name || profile?.email || fallbackEmail || 'PE';
  const parts = source
    .replace(/@.*/, '')
    .split(/\s+|[._-]/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function formatDate(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', options ?? { month: 'short', day: 'numeric' });
}

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return '-';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, { month: 'short', day: 'numeric' });
}

export function bytesToSize(bytes: number | null | undefined) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusTone(label: string) {
  const text = label.toLowerCase();
  if (text.includes('approved') || text.includes('green') || text.includes('answered')) return 'green';
  if (text.includes('revise') || text.includes('amber') || text.includes('review') || text.includes('partial') || text.includes('pending')) return 'amber';
  if (text.includes('reject') || text.includes('red') || text.includes('open') || text.includes('failed')) return 'red';
  if (text.includes('design') || text.includes('blue')) return 'blue';
  if (text.includes('draft') || text.includes('gray') || text.includes('closed')) return 'gray';
  return 'neutral';
}
