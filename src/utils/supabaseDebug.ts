import type {Session} from '@supabase/supabase-js';

type HeadersInput = Headers | string[][] | Record<string, string> | undefined;

export function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem('grooves:debug_supabase') === '1';
  } catch {
    return false;
  }
}

function headerValue(headers: HeadersInput, key: string): string | null {
  if (!headers) {
    return null;
  }
  const needle = key.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(key);
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      if (k.toLowerCase() === needle) {
        return v;
      }
    }
    return null;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === needle) {
      return v;
    }
  }
  return null;
}

function tokenFingerprint(token: string | null | undefined): string {
  if (!token) {
    return 'none';
  }
  // FNV-1a 32-bit hash for a stable, non-reversible fingerprint.
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${hex}:${token.length}`;
}

function extractBearerToken(headers: HeadersInput): string | null {
  const auth = headerValue(headers, 'authorization');
  if (!auth) {
    return null;
  }
  const lower = auth.toLowerCase();
  if (!lower.startsWith('bearer ')) {
    return null;
  }
  return auth.slice(7).trim();
}

export function logAuthEvent(event: string, session: Session | null): void {
  if (!isDebugEnabled()) {
    return;
  }
  const token = session?.access_token ?? null;
  const fingerprint = tokenFingerprint(token);
  const userId = session?.user?.id ?? 'none';
  const expiresAt = session?.expires_at ?? null;
  console.log(
      `[supabaseDebug] auth_event=${event} user_id=${userId} expires_at=${expiresAt} token=${fingerprint}`);
}

export function logSupabaseRequest(
    input: RequestInfo|URL, init?: RequestInit): void {
  if (!isDebugEnabled()) {
    return;
  }
  const token = extractBearerToken(init?.headers as HeadersInput);
  const fingerprint = tokenFingerprint(token);
  const method = (init?.method ?? 'GET').toUpperCase();
  let url = '';
  try {
    url = typeof input === 'string' ? input : input.toString();
  } catch {
    url = '[unknown]';
  }
  console.log(
      `[supabaseDebug] request method=${method} url=${url} token=${fingerprint}`);
}
