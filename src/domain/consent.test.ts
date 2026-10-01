import { describe, expect, it } from 'vitest';
import { approvedSnapshot, checkConsent, toggleRequestedField } from './consent';
import { demoVault } from './fields';

const fields = [
  { key: 'full_name', required: true, selected: true },
  { key: 'date_of_birth', required: true, selected: true },
  { key: 'phone', required: false, selected: true },
] as const;

describe('consent rules', () => {
  it('cannot deselect required fields', () => expect(toggleRequestedField(fields, 'full_name')[0]?.selected).toBe(true));
  it('allows optional fields to be deselected', () => expect(toggleRequestedField(fields, 'phone')[2]?.selected).toBe(false));
  it('blocks submission when required data is missing', () => expect(checkConsent(fields, { full_name: 'Alex' })).toMatchObject({ ok: false, missing: ['date_of_birth'] }));
  it('snapshots only explicitly approved requested fields', () => expect(approvedSnapshot(['full_name', 'phone'], demoVault)).toEqual({ full_name: 'Alex Morgan', phone: '+1 (555) 013-2846' }));
});
