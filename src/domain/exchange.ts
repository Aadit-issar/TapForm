import type { FieldKey, Vault } from './fields';
import { FIELD_BY_KEY } from './fields';

export type RequestQuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'yes_no' | 'number' | 'date';
export type RequestQuestion = {
  id: string;
  prompt: string;
  type: RequestQuestionType;
  required: boolean;
  options: string[];
  minLength: number;
  maxLength: number;
  minValue: number | null;
  maxValue: number | null;
  displayOrder: number;
};
export type QuestionAnswer = string | number | boolean | string[] | null;

export function activeTapCard(card: { archivedAt?: string | null; expiresAt?: string | null }, now = Date.now()): boolean {
  return !card.archivedAt && (!card.expiresAt || Date.parse(card.expiresAt) > now);
}

export function valuesForTapCard(keys: readonly FieldKey[], vault: Vault): Partial<Record<FieldKey, string>> {
  return Object.fromEntries(keys.filter((key) => Boolean(FIELD_BY_KEY[key]) && Boolean(vault[key]?.trim())).map((key) => [key, vault[key]!.trim()]));
}

export function missingTapCardFields(keys: readonly FieldKey[], vault: Vault): FieldKey[] {
  return keys.filter((key) => !vault[key]?.trim());
}

export function validateQuestionAnswers(questions: readonly RequestQuestion[], answers: Record<string, QuestionAnswer>): string[] {
  const errors: string[] = [];
  const questionIds = new Set(questions.map(({ id }) => id));
  if (Object.keys(answers).some((id) => !questionIds.has(id))) return ['unknown'];

  for (const question of questions) {
    const answer = answers[question.id];
    const blank = answer == null
      || typeof answer === 'string' && answer.trim() === ''
      || question.type === 'multiple_choice' && Array.isArray(answer) && answer.length === 0;
    if (blank) {
      if (question.required) errors.push(question.id);
      continue;
    }
    let valid = true;
    switch (question.type) {
      case 'short_text':
      case 'long_text':
        valid = typeof answer === 'string' && answer.length >= question.minLength && answer.length <= question.maxLength && (!question.required || answer.trim().length > 0);
        break;
      case 'single_choice':
        valid = typeof answer === 'string' && question.options.includes(answer);
        break;
      case 'multiple_choice':
        valid = Array.isArray(answer) && new Set(answer).size === answer.length && answer.every((choice) => question.options.includes(choice)) && (!question.required || answer.length > 0);
        break;
      case 'yes_no':
        valid = typeof answer === 'boolean';
        break;
      case 'number':
        {
          const value = typeof answer === 'number' ? answer : typeof answer === 'string' && answer.trim() ? Number(answer) : Number.NaN;
          valid = Number.isFinite(value) && (question.minValue === null || value >= question.minValue) && (question.maxValue === null || value <= question.maxValue);
        }
        break;
      case 'date':
        valid = typeof answer === 'string' && isCalendarDate(answer);
        break;
    }
    if (!valid) errors.push(question.id);
  }
  return errors;
}

export function missingRequiredFields(fields: readonly { key: FieldKey; required: boolean }[], vault: Vault, entered: Partial<Record<FieldKey, string>> = {}): FieldKey[] {
  return fields.filter(({ key, required }) => required && !vault[key]?.trim() && !entered[key]?.trim()).map(({ key }) => key);
}

export function countAnsweredQuestions(questions: readonly RequestQuestion[], answers: Record<string, QuestionAnswer>): number {
  return questions.filter((question) => {
    const answer = answers[question.id];
    if (answer == null || typeof answer === 'string' && answer.trim() === '') return false;
    if (question.type === 'multiple_choice' && Array.isArray(answer)) return answer.length > 0;
    return true;
  }).length;
}

export type InboxRecord = { direction: 'incoming' | 'outgoing'; kind: 'request' | 'peer'; status: string; createdAt: string };
export type InboxBucket = 'requests' | 'received' | 'sent';
export function inboxBucket(record: InboxRecord): InboxBucket {
  if (record.kind === 'request' && record.direction === 'incoming' && ['created','awaiting_consent','pending','in_progress'].includes(record.status)) return 'requests';
  return record.direction === 'incoming' ? 'received' : 'sent';
}

const activeInboxStatuses = new Set(['created', 'awaiting_consent', 'pending', 'in_progress']);
export function inboxRequestStatus(status: string, expiresAt?: string | null, now = Date.now()): string {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return activeInboxStatuses.has(status) && Number.isFinite(expiry) && expiry <= now ? 'expired' : status;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
