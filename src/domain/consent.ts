import { FieldKey, getField, Vault } from './fields';

export type RequestedField = { key: FieldKey; required: boolean; selected: boolean };
export type ConsentCheck = { ok: true; shared: FieldKey[] } | { ok: false; missing: FieldKey[] };

export function checkConsent(fields: readonly RequestedField[], vault: Vault): ConsentCheck {
  const missing = fields.filter(({ key, required, selected }) => required && (!selected || !vault[key])).map(({ key }) => key);
  if (missing.length) return { ok: false, missing };
  return { ok: true, shared: fields.filter(({ key, selected }) => selected && Boolean(vault[key]) && Boolean(getField(key))).map(({ key }) => key) };
}

export function toggleRequestedField(fields: readonly RequestedField[], key: FieldKey): RequestedField[] {
  return fields.map((field) => field.key === key && !field.required ? { ...field, selected: !field.selected } : field);
}

export function approvedSnapshot(keys: readonly FieldKey[], vault: Vault): Partial<Record<FieldKey, string>> {
  return Object.fromEntries(keys.filter((key) => getField(key) && vault[key]).map((key) => [key, vault[key]])) as Partial<Record<FieldKey, string>>;
}
