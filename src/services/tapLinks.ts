export type TapFormLink = { kind: 'request' | 'share'; token: string };

export function parseTapFormToken(input: unknown): string | null {
  return typeof input === 'string' && /^[0-9a-f]{64}$/i.test(input) ? input : null;
}

export function parseTapFormLink(raw: string): TapFormLink | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'tapform:' || parsed.username || parsed.password || parsed.port || parsed.hash) return null;
    const path = parsed.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();
    const host = parsed.hostname.toLowerCase();
    if ((host && host !== 'request' && host !== 'share') || (host && path)) return null;
    const route = path || host;
    if (route !== 'request' && route !== 'share') return null;
    if (parsed.searchParams.getAll('token').length !== 1) return null;
    const token = parseTapFormToken(parsed.searchParams.get('token'));
    if (!token) return null;
    return { kind: route, token };
  } catch { return null; }
}
