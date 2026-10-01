import { parsePendingPostAuthReturn, resolvePostAuthReturnTo } from '@/domain/authRoutes';

const STORAGE_KEY = 'tapform.post-auth-return.v1';
let inMemoryRecord: { path: string; storedAt: number } | null = null;

async function secureStore() {
  return import('expo-secure-store');
}

/** Keep only allowlisted TapForm destinations in encrypted device storage. */
export async function rememberPostAuthReturnTo(value: string): Promise<void> {
  const path = resolvePostAuthReturnTo(value);
  if (!path) return;
  inMemoryRecord = { path, storedAt: Date.now() };
  try {
    const store = await secureStore();
    await store.setItemAsync(STORAGE_KEY, JSON.stringify(inMemoryRecord));
  } catch {
    // The validated URL parameter remains a fallback if secure storage is unavailable.
  }
}

/** Read and validate a route snapshot without consuming it. */
export async function readPostAuthReturnTo(): Promise<string | null> {
  const inMemoryPath = parsePendingPostAuthReturn(JSON.stringify(inMemoryRecord));
  if (inMemoryPath) return inMemoryPath;
  inMemoryRecord = null;
  try {
    const store = await secureStore();
    const raw = await store.getItemAsync(STORAGE_KEY);
    const path = parsePendingPostAuthReturn(raw);
    if (raw && !path) await store.deleteItemAsync(STORAGE_KEY);
    return path;
  } catch {
    return null;
  }
}

export async function clearPostAuthReturnTo(): Promise<void> {
  inMemoryRecord = null;
  try {
    const store = await secureStore();
    await store.deleteItemAsync(STORAGE_KEY);
  } catch {
    // A stale value expires automatically and remains constrained to a TapForm route.
  }
}
