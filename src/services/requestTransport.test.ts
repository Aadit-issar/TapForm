import { describe, expect, it } from 'vitest';
import { parseJoinPayload } from './requestTransport';
import { QrTransport } from './qrTransport';

const payload = {
  version: 1 as const,
  requestSessionId: '123e4567-e89b-42d3-a456-426614174000',
  nonce: '0123456789abcdef0123456789abcdef',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  organizationId: '123e4567-e89b-42d3-a456-426614174001',
};

describe('request transport join payload', () => {
  it('accepts a valid short-lived payload', () => expect(parseJoinPayload(payload)).toEqual(payload));
  it('rejects malformed and extra data', () => {
    expect(() => parseJoinPayload({ ...payload, personalData: 'should never be here' })).toThrow();
    expect(() => parseJoinPayload({ ...payload, nonce: 'short' })).toThrow();
    expect(() => parseJoinPayload('{invalid')).toThrow();
  });
  it('rejects expired requests before backend joining', () => {
    expect(() => parseJoinPayload({ ...payload, expiresAt: new Date(Date.now() - 1_000).toISOString() })).toThrow(/expired/i);
  });
  it('uses the same validated workflow for QR discovery', async () => {
    const transport = new QrTransport(JSON.stringify(payload));
    expect(await transport.discoverSession()).toEqual(payload);
    await expect(new QrTransport('{}').discoverSession()).rejects.toThrow(/valid TapForm request/i);
  });
});
