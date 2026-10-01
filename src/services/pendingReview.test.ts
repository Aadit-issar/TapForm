import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllPendingReviews, clearPendingReview, getPendingReview, savePendingReview } from './pendingReview';
import type { JoinedRequest } from './requests';

const secureStore = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    auth: { userId: '123e4567-e89b-42d3-a456-426614174030' as string | null },
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
  };
});

vi.mock('expo-secure-store', () => secureStore);
vi.mock('./authIdentity', () => ({ getAuthenticatedUserId: vi.fn(async () => secureStore.auth.userId) }));

const firstId = '123e4567-e89b-42d3-a456-426614174000';
const secondId = '123e4567-e89b-42d3-a456-426614174001';
const request = (sessionId: string): JoinedRequest => ({
  sessionId,
  organizationId: '123e4567-e89b-42d3-a456-426614174010',
  organizationName: 'Northfield Event',
  organizationStatus: 'unverified',
  purpose: 'Event registration',
  templateName: 'Registration',
  retentionDescription: '30 days',
  expiresAt: '2030-01-01T00:00:00.000Z',
  fields: [{ key: 'full_name', required: true, displayOrder: 0 }],
  questions: [],
});

describe('pending request restoration metadata', () => {
  beforeEach(() => {
    secureStore.values.clear();
    secureStore.auth.userId = '123e4567-e89b-42d3-a456-426614174030';
    vi.clearAllMocks();
  });

  it('persists verified request metadata and retrieves the requested session', async () => {
    await savePendingReview(request(firstId), '123e4567-e89b-42d3-a456-426614174020');

    expect(await getPendingReview(firstId)).toMatchObject({
      sessionId: firstId,
      pendingId: '123e4567-e89b-42d3-a456-426614174020',
      request: { organizationName: 'Northfield Event', fields: [{ key: 'full_name', required: true }] },
    });
    expect(JSON.stringify([...secureStore.values.values()])).not.toMatch(/vault|access.?token|answer/i);
  });

  it('keeps multiple interrupted requests and clears only the completed session', async () => {
    await savePendingReview(request(firstId));
    await savePendingReview(request(secondId));
    await clearPendingReview(firstId);

    expect(await getPendingReview(firstId)).toBeNull();
    expect(await getPendingReview(secondId)).toMatchObject({ sessionId: secondId });
  });

  it('discards request metadata written without an account owner and deletes corrupt storage', async () => {
    secureStore.values.set('tapform.pending-review.v1', JSON.stringify({ sessionId: firstId, request: request(firstId) }));
    expect(await getPendingReview(firstId)).toBeNull();
    expect(secureStore.values.has('tapform.pending-review.v1')).toBe(false);
    expect(secureStore.values.has('tapform.pending-review.v2')).toBe(false);

    secureStore.values.set('tapform.pending-review.v2', '{broken');
    expect(await getPendingReview()).toBeNull();
    expect(secureStore.values.has('tapform.pending-review.v2')).toBe(false);

    secureStore.values.set('tapform.pending-review.v1', '{broken');
    expect(await getPendingReview()).toBeNull();
    expect(secureStore.values.has('tapform.pending-review.v1')).toBe(false);
  });

  it('never restores one account’s request after the device signs into another account', async () => {
    await savePendingReview(request(firstId));
    secureStore.auth.userId = '123e4567-e89b-42d3-a456-426614174031';

    expect(await getPendingReview(firstId)).toBeNull();
    expect(secureStore.values.has('tapform.pending-review.v2')).toBe(false);
  });

  it('does not retain account-private request context while signed out', async () => {
    await savePendingReview(request(firstId));
    secureStore.auth.userId = null;

    expect(await getPendingReview()).toBeNull();
    expect(secureStore.values.has('tapform.pending-review.v2')).toBe(false);
  });

  it('clears all interrupted review state on deliberate sign-out', async () => {
    await savePendingReview(request(firstId));
    secureStore.values.set('tapform.pending-review.v1', JSON.stringify({ sessionId: secondId, request: request(secondId) }));

    await clearAllPendingReviews();

    expect(secureStore.values.size).toBe(0);
  });
});
