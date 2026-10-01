import { z } from 'zod';
import { joinedRequestSchema } from './requestSchemas';
import type { JoinedRequest } from './requests';
import { getAuthenticatedUserId } from './authIdentity';

const STORAGE_KEY = 'tapform.pending-review.v2';
const LEGACY_STORAGE_KEY = 'tapform.pending-review.v1';
const pendingReviewSchema = z.object({
  ownerUserId: z.string().uuid(),
  sessionId: z.string().uuid(),
  pendingId: z.string().uuid().optional(),
  request: joinedRequestSchema,
}).strict();
const pendingReviewsSchema = z.array(pendingReviewSchema).max(16);

export type PendingReview = z.infer<typeof pendingReviewSchema>;

async function store() { return import('expo-secure-store'); }

async function readAllForUser(ownerUserId: string | null): Promise<PendingReview[]> {
  try {
    const secureStore = await store();
    if (!ownerUserId) {
      await secureStore.deleteItemAsync(STORAGE_KEY);
      await secureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
      return [];
    }
    const raw = await secureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      let storedValue: unknown;
      try { storedValue = JSON.parse(raw); }
      catch { await secureStore.deleteItemAsync(STORAGE_KEY); return []; }
      const parsed = pendingReviewsSchema.safeParse(storedValue);
      if (parsed.success) {
        const owned = parsed.data.filter((record) => record.ownerUserId === ownerUserId);
        if (owned.length !== parsed.data.length) {
          if (owned.length) await secureStore.setItemAsync(STORAGE_KEY, JSON.stringify(owned));
          else await secureStore.deleteItemAsync(STORAGE_KEY);
        }
        return owned;
      }
      await secureStore.deleteItemAsync(STORAGE_KEY);
      return [];
    }

    // Older records have no owner identity. Discard them rather than showing
    // one account's interrupted request in another account's session.
    const legacy = await secureStore.getItemAsync(LEGACY_STORAGE_KEY);
    if (legacy) await secureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
    return [];
  } catch {
    return [];
  }
}

/** Persist only backend-verified request metadata so interrupted consent can resume. */
export async function savePendingReview(request: JoinedRequest, pendingId?: string): Promise<void> {
  const ownerUserId = await getAuthenticatedUserId();
  if (!ownerUserId) return;
  const record: PendingReview = { ownerUserId, sessionId: request.sessionId, ...(pendingId ? { pendingId } : {}), request };
  try {
    const secureStore = await store();
    const current = await readAllForUser(ownerUserId);
    const next = [record, ...current.filter((item) => item.sessionId !== request.sessionId)].slice(0, 16);
    await secureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch { /* The backend remains authoritative if local resume storage fails. */ }
}

export async function getPendingReview(sessionId?: string): Promise<PendingReview | null> {
  const records = await readAllForUser(await getAuthenticatedUserId());
  if (sessionId) return records.find((record) => record.sessionId === sessionId) ?? null;
  return records[0] ?? null;
}

export async function clearPendingReview(sessionId: string): Promise<void> {
  try {
    const secureStore = await store();
    const current = await readAllForUser(await getAuthenticatedUserId());
    const next = current.filter((record) => record.sessionId !== sessionId);
    if (next.length === current.length) return;
    if (next.length) await secureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    else await secureStore.deleteItemAsync(STORAGE_KEY);
  } catch { /* Clearing local metadata cannot undo a server-confirmed response. */ }
}

/** Remove interrupted request metadata during deliberate sign-out or account deletion. */
export async function clearAllPendingReviews(): Promise<void> {
  try {
    const secureStore = await store();
    await secureStore.deleteItemAsync(STORAGE_KEY);
    await secureStore.deleteItemAsync(LEGACY_STORAGE_KEY);
  } catch { /* The authenticated backend remains authoritative. */ }
}
