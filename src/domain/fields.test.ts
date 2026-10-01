import { describe, expect, it } from 'vitest';
import { validateVaultEdit, vaultFromRows } from './fields';

describe('vaultFromRows', () => {
  it('builds an exact snapshot and omits fields removed from the backend', () => {
    expect(vaultFromRows([
      { field_key: 'full_name', value: 'Alex Rivera' },
      { field_key: 'phone', value: '+1 555 0100' },
    ])).toEqual({ full_name: 'Alex Rivera', phone: '+1 555 0100' });
  });

  it('ignores unknown keys instead of adding them to the Vault', () => {
    expect(vaultFromRows([
      { field_key: '__proto__', value: 'ignored' },
      { field_key: 'unknown_field', value: 'ignored' },
      { field_key: 'grade', value: '11' },
    ])).toEqual({ grade: '11' });
  });
});

describe('validateVaultEdit', () => {
  it('allows clearing a required field so it can be removed from the Vault', () => {
    expect(validateVaultEdit('grade', '')).toBeNull();
    expect(validateVaultEdit('grade', '   ')).toBeNull();
  });

  it('still validates non-empty field values', () => {
    expect(validateVaultEdit('email', 'not-an-email')).toBe('Enter a valid email address.');
  });
});
