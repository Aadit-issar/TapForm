import { beforeEach, describe, expect, it, vi } from 'vitest';
import { joinCardShare } from './tapCards';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc } }));

describe('joinCardShare', () => {
  beforeEach(() => rpc.mockReset());

  it('uses transport-neutral copy when a share is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } });

    await expect(joinCardShare('a'.repeat(64), 'idempotency-key'))
      .rejects.toThrow('This Tap Card is no longer available. It may have expired, already been used, or been withdrawn. Nothing was shared. Ask the owner for a new card.');
  });
});
