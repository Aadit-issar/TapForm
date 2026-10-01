import { z } from 'zod';
import type { PeerJoin } from './tapCards';
import { getAuthenticatedUserId } from './authIdentity';

const STORAGE_KEY = 'tapform.pending-peer.v1';
const recordSchema = z.object({ ownerUserId: z.string().uuid(), token: z.string().regex(/^[0-9a-f]{64}$/i), idempotencyKey: z.string().uuid(), request: z.object({
  exchangeId: z.string().uuid(), nonce: z.string().regex(/^[0-9a-f]{32}$/), expiresAt: z.string(), senderName: z.string(), cardName: z.string(), fields: z.array(z.object({ key: z.string(), displayOrder: z.number() })),
}) }).strict();
export type PendingPeer = z.infer<typeof recordSchema>;

async function secureStore() { return import('expo-secure-store'); }
async function readAllForUser(ownerUserId: string | null): Promise<PendingPeer[]> {
  try {
    const store = await secureStore();
    if (!ownerUserId) { await store.deleteItemAsync(STORAGE_KEY); return []; }
    const raw = await store.getItemAsync(STORAGE_KEY);
    if (!raw) return [];
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { await store.deleteItemAsync(STORAGE_KEY); return []; }
    const parsed = z.array(recordSchema).max(8).safeParse(value);
    if (!parsed.success) { await store.deleteItemAsync(STORAGE_KEY); return []; }
    const owned = parsed.data.filter((record) => record.ownerUserId === ownerUserId);
    if (owned.length !== parsed.data.length) {
      if (owned.length) await store.setItemAsync(STORAGE_KEY, JSON.stringify(owned));
      else await store.deleteItemAsync(STORAGE_KEY);
    }
    return owned;
  } catch { return []; }
}
export async function getPendingPeer(token: string): Promise<PendingPeer | null> {
  return (await readAllForUser(await getAuthenticatedUserId())).find((entry) => entry.token.toLowerCase() === token.toLowerCase()) ?? null;
}
export async function getPendingPeerForExchange(exchangeId: string): Promise<PendingPeer | null> {
  return (await readAllForUser(await getAuthenticatedUserId())).find((entry) => entry.request.exchangeId === exchangeId) ?? null;
}
export async function savePendingPeer(token: string, idempotencyKey: string, request: PeerJoin): Promise<void> {
  const ownerUserId = await getAuthenticatedUserId();
  if (!ownerUserId) return;
  try {
    const store = await secureStore();
    const entries = await readAllForUser(ownerUserId);
    const next = [{ ownerUserId, token: token.toLowerCase(), idempotencyKey, request }, ...entries.filter((entry) => entry.token.toLowerCase() !== token.toLowerCase())].slice(0,8);
    await store.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch { /* The backend remains authoritative; failed local resume just asks the person to scan again. */ }
}
export async function clearPendingPeer(token: string): Promise<void> {
  try {
    const store = await secureStore();
    const next = (await readAllForUser(await getAuthenticatedUserId())).filter((entry) => entry.token.toLowerCase() !== token.toLowerCase());
    if (next.length) await store.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    else await store.deleteItemAsync(STORAGE_KEY);
  } catch { /* The exchange state is confirmed by the backend. */ }
}

/** Remove an account's interrupted peer review during deliberate sign-out or deletion. */
export async function clearAllPendingPeers(): Promise<void> {
  try {
    const store = await secureStore();
    await store.deleteItemAsync(STORAGE_KEY);
  } catch { /* The exchange state is confirmed by the backend. */ }
}
