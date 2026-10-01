import { describe, expect, it } from 'vitest';
import { countLabel } from './countLabel';

describe('countLabel', () => {
  it('uses the singular label for one item', () => {
    expect(countLabel(1, 'field')).toBe('1 field');
  });

  it('uses the plural label for zero and multiple items', () => {
    expect(countLabel(0, 'field')).toBe('0 fields');
    expect(countLabel(2, 'field')).toBe('2 fields');
  });

  it('pluralizes compound labels without losing their prefix', () => {
    expect(countLabel(1, 'Vault field')).toBe('1 Vault field');
    expect(countLabel(3, 'Vault field')).toBe('3 Vault fields');
  });
});
