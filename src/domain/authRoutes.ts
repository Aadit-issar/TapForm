const PUBLIC_PATHS = new Set(['/', '/sign-in', '/privacy', '/request', '/share', '/scan', '/incoming']);
const INCOMING_RETURN_TO = /^\/incoming\?pendingId=([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:&notificationAction=(review|decline|share_required|share_selection|retry_decline))?$/i;
const LINK_RETURN_TO = /^\/(request|share)\?token=([0-9a-f]{64})$/i;
export const POST_AUTH_RETURN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function requiresSignIn(pathname: string, hasSession: boolean, demo: boolean): boolean {
  return !hasSession && !demo && !PUBLIC_PATHS.has(pathname);
}

/** Preserve only TapForm-owned, validated destinations across authentication. */
export function resolvePostAuthReturnTo(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  if (INCOMING_RETURN_TO.test(value) || LINK_RETURN_TO.test(value)) return value;
  return null;
}

/** Route authenticated users away from the sign-in entry while preserving an approved link. */
export function resolveAuthenticatedEntryDestination(
  pathname: string,
  hasSession: boolean,
  returnTo: string | string[] | undefined,
  storedReturnTo: string | null,
): string | null {
  if (!hasSession || (pathname !== '/' && pathname !== '/sign-in')) return null;
  return resolvePostAuthReturnTo(returnTo) ?? resolvePostAuthReturnTo(storedReturnTo ?? undefined) ?? '/(tabs)';
}

/** Validate the short-lived, encrypted route snapshot used across auth navigation resets. */
export function parsePendingPostAuthReturn(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const value = record as { path?: unknown; storedAt?: unknown };
    if (typeof value.path !== 'string' || !Number.isSafeInteger(value.storedAt)) return null;
    const storedAt = value.storedAt as number;
    if (storedAt > now || now - storedAt > POST_AUTH_RETURN_MAX_AGE_MS) return null;
    return resolvePostAuthReturnTo(value.path);
  } catch {
    return null;
  }
}
