import { describe, expect, it, vi } from 'vitest';
import { createActionGate, incomingActionUrl, notificationSharePlan, notificationSummary, parseIncomingAction, requiredShareSummary, selectedNotificationKeys, toggleExcludedNotificationField } from './notificationActions';
import type { Vault } from '@/domain/fields';

const fullVault: Vault = { full_name: 'Alex Morgan', institution: 'Northfield Academy', grade: '11' };
const required = [
  { key: 'full_name', required: true },
  { key: 'institution', required: true },
  { key: 'grade', required: true },
];
const expiresAt = new Date(Date.now() + 60_000).toISOString();

describe('notification request actions', () => {
  it('allows required-only sharing and ignores optional fields in the count', () => {
    const decision = requiredShareSummary([...required, { key: 'phone', required: false }], fullVault, expiresAt);
    expect(decision.canShare).toBe(true);
    expect(decision.requiredCount).toBe(3);
    expect(decision.requiredKeys).toEqual(['full_name', 'institution', 'grade']);
  });

  it('does not offer Share for an optional-only request', () => {
    expect(requiredShareSummary([{ key: 'phone', required: false }], fullVault, expiresAt).canShare).toBe(false);
  });

  it('does not offer Share when required Vault data is missing', () => {
    expect(requiredShareSummary(required, { full_name: 'Alex Morgan' }, expiresAt).canShare).toBe(false);
  });

  it('does not offer Share for an expired or already-processed request', () => {
    expect(requiredShareSummary(required, fullVault, new Date(Date.now() - 1000).toISOString()).canShare).toBe(false);
    expect(requiredShareSummary(required, fullVault, expiresAt, 'declined').canShare).toBe(false);
  });

  it('builds a notification summary from field names only and counts required separately', () => {
    const summary = notificationSummary({
      organizationName: 'Northfield Tech Fest', purpose: 'Participant registration', templateName: 'Event Registration', retentionDescription: '30 days',
      fields: [...required, { key: 'phone', required: false }],
    }, fullVault);
    expect(summary.required.map((field) => field.label)).toEqual(['Full Name', 'School', 'Grade / Year']);
    expect(summary.optional.map((field) => field.label)).toEqual(['Phone Number']);
    expect(summary.missingRequired).toBe(0);
    expect(JSON.stringify(summary)).not.toContain('Alex Morgan');
  });

  it('uses review as the safe default for unknown action values', () => {
    expect(parseIncomingAction('share_required')).toBe('share_required');
    expect(parseIncomingAction('delete_everything')).toBe('review');
  });

  it('uses stable field keys for exclusion state and omits excluded optional fields', () => {
    const summary = notificationSummary({
      organizationName: 'Northfield Tech Fest', purpose: 'Participant registration', templateName: 'Event Registration', retentionDescription: '30 days',
      fields: [...required, { key: 'phone', required: false }],
    }, fullVault);
    const excluded = toggleExcludedNotificationField(['phone'], 'phone');
    expect(excluded).toEqual([]);
    expect(selectedNotificationKeys(summary, ['phone'])).toEqual(['full_name', 'institution', 'grade']);
    expect(selectedNotificationKeys(summary, excluded)).toEqual(['full_name', 'institution', 'grade', 'phone']);
  });

  it('preserves excluded required keys so the app can require explicit restoration', () => {
    const summary = notificationSummary({
      organizationName: 'Northfield Tech Fest', purpose: 'Participant registration', templateName: 'Event Registration', retentionDescription: '30 days', fields: required,
    }, fullVault);
    expect(selectedNotificationKeys(summary, ['full_name'])).toEqual(['institution', 'grade']);
    expect(summary.required.map((field) => field.key)).toContain('full_name');
  });

  it('shares the required fields and only explicitly included optional fields', () => {
    const fields = [...required, { key: 'phone', required: false }];
    expect(notificationSharePlan(fields, ['full_name', 'institution', 'grade'], fullVault)).toEqual({
      kind: 'share', keys: ['full_name', 'institution', 'grade'],
    });
    expect(notificationSharePlan(fields, ['full_name', 'institution', 'grade', 'phone'], { ...fullVault, phone: '202-555-0100' })).toEqual({
      kind: 'share', keys: ['full_name', 'institution', 'grade', 'phone'],
    });
  });

  it('routes required-field exclusions and missing requested values into full review', () => {
    expect(notificationSharePlan(required, ['institution', 'grade'], fullVault)).toEqual({ kind: 'review' });
    expect(notificationSharePlan(required, ['full_name', 'institution', 'grade'], { full_name: 'Alex Morgan' })).toEqual({ kind: 'review' });
  });

  it('does not directly share optional-only requests or unrequested keys', () => {
    expect(notificationSharePlan([{ key: 'phone', required: false }], ['phone'], { phone: '202-555-0100' })).toEqual({ kind: 'review' });
    expect(notificationSharePlan(required, [...required.map((field) => field.key), 'phone'], fullVault)).toEqual({
      kind: 'share', keys: ['full_name', 'institution', 'grade'],
    });
  });

  it('routes each action to its own pending request', () => {
    const first = incomingActionUrl('11111111-1111-4111-8111-111111111111', 'share_required');
    const second = incomingActionUrl('22222222-2222-4222-8222-222222222222', 'decline');
    expect(first).toContain('notificationAction=share_required');
    expect(first).not.toBe(second);
    expect(new URL(first).searchParams.get('pendingId')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('runs only one concurrent copy of a repeated action', async () => {
    let complete: (() => void) | undefined;
    const action = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const gated = createActionGate(action);
    const first = gated();
    const duplicate = await gated();
    expect(action).toHaveBeenCalledTimes(1);
    expect(duplicate).toBeUndefined();
    complete?.();
    await first;
  });
});
