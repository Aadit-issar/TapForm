import { describe, expect, it } from 'vitest';
import { parsePendingPostAuthReturn, POST_AUTH_RETURN_MAX_AGE_MS, requiresSignIn, resolveAuthenticatedEntryDestination, resolvePostAuthReturnTo } from './authRoutes';

describe('signed-out route access', () => {
  it('allows only routes that resolve safe transport context or public privacy information', () => {
    for (const path of ['/', '/sign-in', '/privacy', '/request', '/share', '/scan', '/incoming']) {
      expect(requiresSignIn(path, false, false), `${path} remains available`).toBe(false);
    }
  });

  it('requires authentication for account and transfer detail screens', () => {
    for (const path of ['/profile', '/vault', '/activity', '/templates', '/submissions', '/tap-cards', '/review', '/nfc', '/peer-done']) {
      expect(requiresSignIn(path, false, false), `${path} is protected`).toBe(true);
    }
  });

  it('allows protected screens only after sign-in or in the development-only demo session', () => {
    expect(requiresSignIn('/profile', true, false)).toBe(false);
    expect(requiresSignIn('/profile', false, true)).toBe(false);
    expect(requiresSignIn('/unknown-route', false, false)).toBe(true);
  });
});

describe('post-auth route restoration', () => {
  const token = 'a'.repeat(64);
  const pendingId = '123e4567-e89b-42d3-a456-426614174000';

  it('restores supported request, share, and notification destinations exactly', () => {
    for (const path of [
      `/request?token=${token}`,
      `/share?token=${token}`,
      `/incoming?pendingId=${pendingId}`,
      `/incoming?pendingId=${pendingId}&notificationAction=share_required`,
      `/incoming?pendingId=${pendingId}&notificationAction=decline`,
    ]) expect(resolvePostAuthReturnTo(path)).toBe(path);
  });

  it('rejects malformed, duplicated, or externally controlled destinations', () => {
    for (const path of [
      'https://example.com',
      '//example.com/path',
      '/profile',
      `/share?token=${token}&returnTo=/profile`,
      `/share?token=${token}&token=${token}`,
      `/incoming?pendingId=${pendingId}&notificationAction=admin`,
      '/incoming?pendingId=not-a-uuid',
      `/request?token=${'g'.repeat(64)}`,
    ]) expect(resolvePostAuthReturnTo(path)).toBeNull();
    expect(resolvePostAuthReturnTo([`/share?token=${token}`, '/profile'])).toBeNull();
  });

  it('restores an authenticated entry route after the navigation tree resets', () => {
    const share = `/share?token=${token}`;
    const request = `/request?token=${token}`;
    expect(resolveAuthenticatedEntryDestination('/sign-in', true, share, null)).toBe(share);
    expect(resolveAuthenticatedEntryDestination('/sign-in', true, undefined, request)).toBe(request);
    expect(resolveAuthenticatedEntryDestination('/', true, undefined, null)).toBe('/(tabs)');
  });

  it('does not redirect signed-out users or replace an authenticated deep link', () => {
    const share = `/share?token=${token}`;
    expect(resolveAuthenticatedEntryDestination('/sign-in', false, share, share)).toBeNull();
    expect(resolveAuthenticatedEntryDestination('/share', true, share, null)).toBeNull();
    expect(resolveAuthenticatedEntryDestination('/sign-in', true, 'https://example.com', '/profile')).toBe('/(tabs)');
  });

  it('restores only recent, valid encrypted route snapshots', () => {
    const now = 1_800_000_000_000;
    const path = `/share?token=${token}`;
    expect(parsePendingPostAuthReturn(JSON.stringify({ path, storedAt: now }), now)).toBe(path);
    expect(parsePendingPostAuthReturn(JSON.stringify({ path, storedAt: now - POST_AUTH_RETURN_MAX_AGE_MS }), now)).toBe(path);
    expect(parsePendingPostAuthReturn(JSON.stringify({ path, storedAt: now - POST_AUTH_RETURN_MAX_AGE_MS - 1 }), now)).toBeNull();
    expect(parsePendingPostAuthReturn(JSON.stringify({ path, storedAt: now + 1 }), now)).toBeNull();
    expect(parsePendingPostAuthReturn(JSON.stringify({ path: '/profile', storedAt: now }), now)).toBeNull();
    expect(parsePendingPostAuthReturn('{malformed', now)).toBeNull();
  });
});
