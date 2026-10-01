import type { FieldKey, Vault } from '../domain/fields';
import { FIELD_BY_KEY, FIELD_REGISTRY } from '../domain/fields';

const FIELD_REGISTRY_KEYS = new Set<string>(FIELD_REGISTRY.map((field) => field.key));

export type IncomingAction = 'review' | 'decline' | 'share_required' | 'share_selection' | 'retry_decline';
export type NotificationField = { key: string; required: boolean };
export type NotificationFieldSummary = { key: FieldKey; label: string };
export type PendingNotificationSummary = {
  organization: string;
  purpose: string;
  template: string;
  retention: string;
  required: NotificationFieldSummary[];
  optional: NotificationFieldSummary[];
  missingRequired: number;
};

export function parseIncomingAction(value: unknown): IncomingAction {
  return value === 'decline' || value === 'share_required' || value === 'share_selection' || value === 'retry_decline' ? value : 'review';
}

export function requiredShareSummary(
  fields: readonly NotificationField[],
  vault: Vault,
  expiresAt: string,
  responseStatus?: string | null,
) {
  const required = fields.filter((field) => field.required);
  const missing = required.filter((field) => !vault[field.key as FieldKey]?.trim());
  const active = Date.parse(expiresAt) > Date.now() && !responseStatus;
  return {
    requiredKeys: required.map((field) => field.key as FieldKey),
    requiredCount: required.length,
    missingCount: missing.length,
    canShare: active && required.length > 0 && missing.length === 0,
  };
}

export function incomingActionUrl(pendingId: string, action: IncomingAction): string {
  const params = new URLSearchParams({ pendingId, notificationAction: action });
  return `tapform:///incoming?${params.toString()}`;
}

export function notificationSummary(
  request: { organizationName: string; purpose: string; templateName: string; retentionDescription: string; fields: readonly NotificationField[] },
  vault: Vault,
): PendingNotificationSummary {
  const required = request.fields.filter((field) => field.required);
  const missingRequired = required.filter((field) => !vault[field.key as FieldKey]?.trim()).length;
  const label = (field: NotificationField) => (FIELD_BY_KEY[field.key as FieldKey]?.label ?? 'Requested information').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return {
    organization: request.organizationName,
    purpose: request.purpose,
    template: request.templateName,
    retention: request.retentionDescription || 'Not specified',
    required: required.map((field) => ({ key: field.key as FieldKey, label: label(field) })),
    optional: request.fields.filter((field) => !field.required).map((field) => ({ key: field.key as FieldKey, label: label(field) })),
    missingRequired,
  };
}

export function selectedNotificationKeys(
  summary: PendingNotificationSummary,
  excludedKeys: readonly string[],
): FieldKey[] {
  const excluded = new Set(excludedKeys);
  return [...summary.required, ...summary.optional]
    .filter((field) => !excluded.has(field.key))
    .map((field) => field.key);
}

export function notificationSharePlan(
  fields: readonly NotificationField[],
  selectedKeys: readonly string[],
  vault: Vault,
): { kind: 'review' } | { kind: 'share'; keys: FieldKey[] } {
  const requested = fields.filter((field) => FIELD_REGISTRY_KEYS.has(field.key));
  const selected = new Set(selectedKeys);
  const required = requested.filter((field) => field.required);
  if (required.length === 0 || required.some((field) => !selected.has(field.key) || !vault[field.key as FieldKey]?.trim())) {
    return { kind: 'review' };
  }
  const keys = requested.filter((field) => selected.has(field.key)).map((field) => field.key as FieldKey);
  if (keys.length === 0 || keys.some((key) => !vault[key]?.trim())) return { kind: 'review' };
  return { kind: 'share', keys };
}

export function toggleExcludedNotificationField(excludedKeys: readonly string[], fieldKey: FieldKey): FieldKey[] {
  const next = new Set<FieldKey>(excludedKeys.filter((key): key is FieldKey => FIELD_REGISTRY_KEYS.has(key)));
  if (next.has(fieldKey)) next.delete(fieldKey);
  else next.add(fieldKey);
  return [...next].sort();
}

/** Per-Activity guard; the database remains the authoritative duplicate-action check. */
export function createActionGate<T>(action: () => Promise<T>) {
  let running = false;
  return async (): Promise<T | undefined> => {
    if (running) return undefined;
    running = true;
    try { return await action(); }
    finally { running = false; }
  };
}
