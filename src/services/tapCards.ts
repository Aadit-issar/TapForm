import { z } from 'zod';
import type { FieldKey } from '@/domain/fields';
import { supabase } from './supabase';

const rawCardSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), name: z.string(), category: z.string(), expires_at: z.string().nullable(),
  archived_at: z.string().nullable(), display_order: z.number(), created_at: z.string(), updated_at: z.string(),
  tap_card_fields: z.array(z.object({ field_key: z.string(), display_order: z.number() })),
});
export type TapCard = z.infer<typeof rawCardSchema> & { isDefault: boolean };
const shareLinkSchema = z.object({ linkId: z.string().uuid(), token: z.string().regex(/^[0-9a-f]{64}$/), cardName: z.string(), oneTime: z.boolean(), expiresAt: z.string().nullable() });
export type CardShareLink = z.infer<typeof shareLinkSchema>;
const peerJoinSchema = z.object({
  exchangeId: z.string().uuid(), nonce: z.string().regex(/^[0-9a-f]{32}$/), expiresAt: z.string(), senderName: z.string(), cardName: z.string(),
  fields: z.array(z.object({ key: z.string(), displayOrder: z.number() })),
});
export type PeerJoin = z.infer<typeof peerJoinSchema>;

function requireBackend() {
  if (!supabase) throw new Error('Connect TapForm to your account before managing Tap Cards.');
  return supabase;
}

export async function listTapCards(): Promise<{ cards: TapCard[]; defaultId: string | null }> {
  const client = requireBackend();
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError || !userResult.user) throw new Error('Sign in again to open your Tap Cards.');
  const [cardsResult, profileResult] = await Promise.all([
    client.from('tap_cards').select('id,user_id,name,category,expires_at,archived_at,display_order,created_at,updated_at,tap_card_fields(field_key,display_order)').eq('user_id', userResult.user.id).order('display_order').order('created_at'),
    client.from('profiles').select('default_tap_card_id').eq('id', userResult.user.id).maybeSingle(),
  ]);
  if (cardsResult.error || profileResult.error) throw new Error('Your Tap Cards could not be loaded. Check your connection and retry.');
  const parsed = z.array(rawCardSchema).safeParse(cardsResult.data ?? []);
  if (!parsed.success) throw new Error('TapForm received invalid Tap Card data.');
  const defaultId = (profileResult.data as { default_tap_card_id?: string | null } | null)?.default_tap_card_id ?? null;
  return { cards: parsed.data.map((card) => ({ ...card, tap_card_fields: card.tap_card_fields.sort((a,b) => a.display_order-b.display_order), isDefault: card.id === defaultId })), defaultId };
}

export async function saveTapCard(input: { id?: string; name: string; category: string; fieldKeys: FieldKey[]; expiresAt?: string | null }): Promise<string> {
  const { data, error } = await requireBackend().rpc('save_tap_card', {
    p_card_id: input.id ?? null, p_name: input.name.trim(), p_category: input.category, p_field_keys: input.fieldKeys, p_expires_at: input.expiresAt ?? null,
  });
  if (error || typeof data !== 'string') throw new Error(error?.code === '23514' ? 'A default card cannot be expired. Update your default first.' : 'Tap Card changes could not be saved. Check the details and retry.');
  return data;
}

export async function setDefaultTapCard(cardId: string | null): Promise<void> {
  const { error } = await requireBackend().rpc('set_default_tap_card', { p_card_id: cardId });
  if (error) throw new Error('Your default Tap Card could not be updated. It may have expired.');
}

export async function deleteTapCard(cardId: string): Promise<void> {
  const { data, error } = await requireBackend().rpc('delete_tap_card', { p_card_id: cardId });
  if (error || data !== true) throw new Error('This Tap Card could not be deleted. Refresh the list and retry.');
}

export async function createCardShareLink(cardId: string, oneTime: boolean, expiresAt: string | null, shareBackTransferId?: string): Promise<CardShareLink> {
  const { data, error } = await requireBackend().rpc('create_card_share_link', {
    p_card_id: cardId, p_one_time: oneTime, p_expires_at: expiresAt, p_share_back_transfer_id: shareBackTransferId ?? null,
  });
  if (error) throw new Error(error.code === '23514' ? 'This Tap Card has missing Vault information. Edit it before sharing.' : 'A secure Tap Card link could not be created. Check your connection and retry.');
  const parsed = shareLinkSchema.safeParse(data);
  if (!parsed.success) throw new Error('The server returned an invalid Tap Card link.');
  return parsed.data;
}

export async function joinCardShare(token: string, idempotencyKey: string): Promise<PeerJoin> {
  const { data, error } = await requireBackend().rpc('join_card_share', { p_token: token, p_idempotency_key: idempotencyKey });
  if (error) {
    if (error.code === 'P0001') throw new Error('This Tap Card is no longer available. It may have expired, already been used, or been withdrawn. Nothing was shared. Ask the owner for a new card.');
    if (error.code === '23505') throw new Error('This one-time Tap Card is already being reviewed.');
    throw new Error('This Tap Card could not be opened. Check your connection and try again.');
  }
  const parsed = peerJoinSchema.safeParse(data);
  if (!parsed.success) throw new Error('TapForm could not verify this Tap Card exchange.');
  return parsed.data;
}

export async function answerPeerExchange(exchangeId: string, nonce: string, accept: boolean): Promise<{ transferId?: string; fieldCount?: number }> {
  const { data, error } = await requireBackend().rpc('respond_to_peer_exchange', { p_exchange_id: exchangeId, p_nonce: nonce, p_accept: accept });
  if (error) {
    if (accept && error.code === '23505') {
      const { data: confirmed } = await requireBackend().from('peer_transfers').select('id,field_count').eq('exchange_id', exchangeId).maybeSingle();
      if (confirmed) return { transferId: confirmed.id, fieldCount: confirmed.field_count };
    }
    if (error.code === 'P0001') throw new Error('This Tap Card exchange expired or was revoked. Nothing was shared.');
    if (error.code === '23505') throw new Error('This Tap Card exchange was already answered.');
    throw new Error('Your choice could not be sent. Check your connection and retry.');
  }
  const parsed = z.object({ status: z.enum(['completed','declined']), transferId: z.string().uuid().optional(), fieldCount: z.number().int().optional() }).safeParse(data);
  if (!parsed.success || parsed.data.status !== (accept ? 'completed' : 'declined')) throw new Error('TapForm could not confirm this exchange.');
  return parsed.data;
}

export async function setReceivedCardSaved(id: string, saved: boolean): Promise<void> {
  const { error } = await requireBackend().rpc('save_received_card', { p_received_card_id: id, p_saved: saved });
  if (error) throw new Error('This received card could not be updated.');
}

export async function archiveReceivedCard(id: string): Promise<void> {
  const { error } = await requireBackend().rpc('archive_received_card', { p_received_card_id: id });
  if (error) throw new Error('This received card could not be archived.');
}

export function tapCardShareUrl(token: string): string { return `tapform:///share?token=${encodeURIComponent(token)}`; }
