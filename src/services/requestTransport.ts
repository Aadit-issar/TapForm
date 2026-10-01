import { z } from 'zod';

export type JoinPayload = {
  version: 1 | 2;
  requestSessionId: string;
  nonce: string;
  expiresAt: string;
  organizationId: string;
};

const joinPayloadSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  requestSessionId: z.string().uuid(),
  nonce: z.string().regex(/^[0-9a-f]{32}$/i),
  expiresAt: z.string().datetime({ offset: true }),
  organizationId: z.string().uuid(),
}).strict();

export function parseJoinPayload(input: unknown): JoinPayload {
  const parsed = joinPayloadSchema.safeParse(input);
  if (!parsed.success) throw new Error('This is not a valid TapForm request code.');
  if (Date.parse(parsed.data.expiresAt) <= Date.now()) throw new Error('This request has expired. Ask the organization to start again.');
  return parsed.data;
}

export interface RequestTransport {
  beginSession(templateId: string): Promise<JoinPayload>;
  /** Organization-side: present an active request through NFC Reader Mode or a QR code. */
  advertiseSession(payload: JoinPayload): Promise<void>;
  /** Personal-side: recover a received NFC request or parse the scanned QR envelope. */
  discoverSession(input?: string): Promise<JoinPayload>;
  joinSession(payload: JoinPayload): Promise<unknown>;
  cancelSession(): Promise<void>;
}

export const SESSION_TTL_SECONDS = 120;
