import { describe, expect, it } from 'vitest';
import { accountCreationErrorMessage } from './authErrors';

describe('account creation errors', () => {
  it('explains when the account service cannot be reached', () => {
    expect(accountCreationErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }))
      .toMatch(/could not reach the account service/i);
  });

  it('directs an existing account to sign in', () => {
    expect(accountCreationErrorMessage({ code: 'user_already_exists' }))
      .toMatch(/already uses this email/i);
  });

  it('handles signup limits and disabled signup without exposing server details', () => {
    expect(accountCreationErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/wait/i);
    expect(accountCreationErrorMessage({ code: 'signup_disabled', message: 'internal detail' })).toMatch(/temporarily unavailable/i);
  });

  it('keeps unrecognized backend errors generic', () => {
    expect(accountCreationErrorMessage({ code: 'unexpected', message: 'database secret detail' }))
      .toBe('This account could not be created. Check the email and password, then try again.');
  });
});
