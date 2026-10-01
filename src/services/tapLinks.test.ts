import { describe, expect, it } from 'vitest';
import { parseTapFormLink, parseTapFormToken } from './tapLinks';

const token = '0123456789abcdef'.repeat(4);
describe('safe TapForm links', () => {
  it('recognizes request and peer share links without decoding personal data', () => {
    expect(parseTapFormLink(`tapform:///request?token=${token}`)).toEqual({ kind: 'request', token });
    expect(parseTapFormLink(`tapform://share?token=${token}`)).toEqual({ kind: 'share', token });
  });
  it('rejects other schemes, malformed tokens, and unrelated routes', () => {
    expect(parseTapFormLink(`https://example.test/request?token=${token}`)).toBeNull();
    expect(parseTapFormLink('tapform:///request?token=hello')).toBeNull();
    expect(parseTapFormLink(`tapform:///incoming?token=${token}`)).toBeNull();
    expect(parseTapFormLink(`tapform://untrusted/request?token=${token}`)).toBeNull();
    expect(parseTapFormLink(`tapform:///request?token=${token}&token=${token}`)).toBeNull();
    expect(parseTapFormLink(`tapform:///request?token=${token}#fragment`)).toBeNull();
    expect(parseTapFormLink(`tapform://request@untrusted?token=${token}`)).toBeNull();
  });
  it('accepts exactly one scalar route token and rejects arrays', () => {
    expect(parseTapFormToken(token)).toBe(token);
    expect(parseTapFormToken([token, token])).toBeNull();
    expect(parseTapFormToken(undefined)).toBeNull();
  });
});
