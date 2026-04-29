import { createHash, timingSafeEqual } from 'node:crypto';

export function secretEquals(value: string, expected: string) {
  const valueHash = createHash('sha256').update(value).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(valueHash, expectedHash);
}

export function bearerToken(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

export function requestHasSecret(request: Request, expected: string | undefined, headerName: string) {
  if (!expected) return false;
  const headerSecret = request.headers.get(headerName) ?? '';
  return secretEquals(bearerToken(request), expected) || secretEquals(headerSecret, expected);
}
