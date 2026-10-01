import { describe, expect, it } from 'vitest';
import { canRetryPeerShare, canRetryRequestLink } from './linkRetry';

const token = 'a'.repeat(64);

describe('link recovery actions', () => {
  it('does not offer a retry for malformed or permanently unavailable share links', () => {
    expect(canRetryPeerShare('', 'This Tap Card link is invalid.')).toBe(false);
    expect(canRetryPeerShare('abc', 'This Tap Card could not be opened. Check your connection and try again.')).toBe(false);
    expect(canRetryPeerShare(token, 'This Tap Card is no longer available. It may have expired, already been used, or been withdrawn. Nothing was shared. Ask the owner for a new card.')).toBe(false);
  });

  it('offers a retry for recoverable share-link failures', () => {
    expect(canRetryPeerShare(token, 'This Tap Card could not be opened. Check your connection and try again.')).toBe(true);
    expect(canRetryPeerShare(token, 'This one-time Tap Card is already being reviewed.')).toBe(true);
  });

  it('does not offer a retry for malformed or expired request links', () => {
    expect(canRetryRequestLink('', 'This TapForm request link is invalid.')).toBe(false);
    expect(canRetryRequestLink(token, 'This request link has expired, was revoked, or has already been used.')).toBe(false);
  });

  it('offers a retry for recoverable request-link failures', () => {
    expect(canRetryRequestLink(token, 'This request could not be opened. Check your connection and try again.')).toBe(true);
    expect(canRetryRequestLink(token, 'This one-time request is already being reviewed. Try again if its current session expires.')).toBe(true);
  });
});
