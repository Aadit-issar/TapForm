import { describe, expect, it } from 'vitest';
import { shouldHideSplash } from './splashGate';

describe('startup splash gate', () => {
  it('keeps the splash until local auth restoration is ready', () => {
    expect(shouldHideSplash({ authReady: false, hasSession: false, isEntryRoute: true, mustSignIn: false })).toBe(false);
  });

  it('keeps the splash during a signed-in entry redirect', () => {
    expect(shouldHideSplash({ authReady: true, hasSession: true, isEntryRoute: true, mustSignIn: false })).toBe(false);
  });

  it('hides it once the tab-group route is active even when its URL is also root', () => {
    expect(shouldHideSplash({ authReady: true, hasSession: true, isEntryRoute: false, mustSignIn: false })).toBe(true);
  });

  it('waits for a signed-out protected route to redirect to sign-in', () => {
    expect(shouldHideSplash({ authReady: true, hasSession: false, isEntryRoute: false, mustSignIn: true })).toBe(false);
    expect(shouldHideSplash({ authReady: true, hasSession: false, isEntryRoute: false, mustSignIn: false })).toBe(true);
  });
});
