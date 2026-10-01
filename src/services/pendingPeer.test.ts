import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllPendingPeers, getPendingPeer, savePendingPeer } from './pendingPeer';

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

const ownerA = '123e4567-e89b-42d3-a456-426614174030';
const ownerB = '123e4567-e89b-42d3-a456-426614174031';
const token = 'a'.repeat(64);
const request = {
  exchangeId: '123e4567-e89b-42d3-a456-426614174040',
  nonce: '0123456789abcdef0123456789abcdef',
  expiresAt: '2030-01-01T00:00:00.000Z',
  senderName: 'TapForm member',
  cardName: 'Personal',
  fields: [{ key: 'full_name', displayOrder: 0 }],
};

describe('account-scoped pending peer exchanges', () => {
  beforeEach(() => {
    secureStore.values.clear();
    secureStore.auth.userId = ownerA;
    vi.clearAllMocks();
  });

  it('restores the interrupted exchange only for the account that joined it', async () => {
    await savePendingPeer(token, '123e4567-e89b-42d3-a456-426614174050', request);
    expect(await getPendingPeer(token)).toMatchObject({ ownerUserId: ownerA, request: { exchangeId: request.exchangeId } });

    secureStore.auth.userId = ownerB;
    expect(await getPendingPeer(token)).toBeNull();
    expect(secureStore.values.has('tapform.pending-peer.v1')).toBe(false);
  });

  it('discards unowned legacy exchange metadata', async () => {
    secureStore.values.set('tapform.pending-peer.v1', JSON.stringify({
      token,
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174050',
      request,
    }));

    expect(await getPendingPeer(token)).toBeNull();
    expect(secureStore.values.has('tapform.pending-peer.v1')).toBe(false);
  });

  it('deletes malformed interrupted exchange storage instead of retrying it on every launch', async () => {
    secureStore.values.set('tapform.pending-peer.v1', '{broken');

    expect(await getPendingPeer(token)).toBeNull();
    expect(secureStore.values.has('tapform.pending-peer.v1')).toBe(false);
  });

  it('clears pending exchange metadata when no user session exists', async () => {
    await savePendingPeer(token, '123e4567-e89b-42d3-a456-426614174050', request);
    secureStore.auth.userId = null;

    expect(await getPendingPeer(token)).toBeNull();
    expect(secureStore.values.has('tapform.pending-peer.v1')).toBe(false);
  });

  it('clears interrupted peer context on deliberate sign-out', async () => {
    await savePendingPeer(token, '123e4567-e89b-42d3-a456-426614174050', request);

    await clearAllPendingPeers();

    expect(secureStore.values.has('tapform.pending-peer.v1')).toBe(false);
  });
});
