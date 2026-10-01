import { describe, expect, it } from 'vitest';
import { activeTapCard, countAnsweredQuestions, inboxBucket, inboxRequestStatus, missingRequiredFields, missingTapCardFields, validateQuestionAnswers, valuesForTapCard } from './exchange';
import type { RequestQuestion } from './exchange';

const questions: RequestQuestion[] = [
  { id: 'q-text', prompt: 'Why?', type: 'short_text', required: true, options: [], minLength: 3, maxLength: 100, minValue: null, maxValue: null, displayOrder: 0 },
  { id: 'q-long', prompt: 'More?', type: 'long_text', required: false, options: [], minLength: 3, maxLength: 200, minValue: null, maxValue: null, displayOrder: 6 },
  { id: 'q-choice', prompt: 'Track', type: 'single_choice', required: true, options: ['A', 'B'], minLength: 0, maxLength: 500, minValue: null, maxValue: null, displayOrder: 1 },
  { id: 'q-multiple', prompt: 'Sessions', type: 'multiple_choice', required: false, options: ['Morning', 'Evening'], minLength: 0, maxLength: 500, minValue: null, maxValue: null, displayOrder: 2 },
  { id: 'q-bool', prompt: 'Agree?', type: 'yes_no', required: true, options: [], minLength: 0, maxLength: 500, minValue: null, maxValue: null, displayOrder: 3 },
  { id: 'q-number', prompt: 'Age?', type: 'number', required: false, options: [], minLength: 0, maxLength: 500, minValue: 0, maxValue: 120, displayOrder: 4 },
  { id: 'q-date', prompt: 'Date?', type: 'date', required: false, options: [], minLength: 0, maxLength: 500, minValue: null, maxValue: null, displayOrder: 5 },
];

describe('TapForm exchange rules', () => {
  it('keeps Tap Card snapshots to explicitly selected keys and current Vault values', () => {
    expect(valuesForTapCard(['full_name','email'], { full_name: ' Ada Lovelace ', phone: '555' })).toEqual({ full_name: 'Ada Lovelace' });
    expect(missingTapCardFields(['full_name','email'], { full_name: 'Ada' })).toEqual(['email']);
  });

  it('blocks archived and expired cards for new shares', () => {
    const now = Date.now();
    expect(activeTapCard({ expiresAt: new Date(now + 1000).toISOString() }, now)).toBe(true);
    expect(activeTapCard({ expiresAt: new Date(now - 1000).toISOString() }, now)).toBe(false);
    expect(activeTapCard({ archivedAt: new Date(now + 1000).toISOString() }, now)).toBe(false);
  });

  it('finds required data missing from both Vault and this request draft', () => {
    expect(missingRequiredFields([{ key: 'full_name', required: true }, { key: 'grade', required: true }, { key: 'email', required: false }], { full_name: 'Ada' }, { grade: '11' })).toEqual([]);
    expect(missingRequiredFields([{ key: 'grade', required: true }], {})).toEqual(['grade']);
  });

  it('validates question IDs, types, bounds, and allowed choices', () => {
    expect(validateQuestionAnswers(questions, { 'q-text': 'Interested', 'q-choice': 'A', 'q-bool': false, 'q-multiple': ['Morning'], 'q-number': 19, 'q-date': '2026-02-28' })).toEqual([]);
    expect(validateQuestionAnswers(questions, { 'q-text': 'x', 'q-choice': 'C', 'q-bool': 'yes', 'q-number': 121, 'q-date': '2026-02-30' })).toEqual(['q-text','q-choice','q-bool','q-number','q-date']);
    expect(validateQuestionAnswers(questions, { surprise: 'value' })).toEqual(['unknown']);
  });

  it('treats whitespace and empty optional answers as unanswered', () => {
    expect(validateQuestionAnswers(questions, { 'q-text': 'Interested', 'q-choice': 'A', 'q-bool': false, 'q-long': '   ', 'q-multiple': [] })).toEqual([]);
    expect(validateQuestionAnswers(questions, { 'q-text': '   ', 'q-choice': 'A', 'q-bool': false })).toEqual(['q-text']);
    expect(validateQuestionAnswers([{ id: 'q-required-multi', prompt: 'Choose', type: 'multiple_choice', required: true, options: ['Morning'], minLength: 0, maxLength: 500, minValue: null, maxValue: null, displayOrder: 0 }], { 'q-required-multi': [] })).toEqual(['q-required-multi']);
    expect(countAnsweredQuestions(questions, { 'q-text': '   ', 'q-bool': false, 'q-number': 0, 'q-multiple': [] })).toBe(2);
  });

  it('counts answered questions separately from Vault fields', () => {
    expect(countAnsweredQuestions(questions, { 'q-text': 'hello', 'q-bool': false, 'q-choice': null })).toBe(2);
  });

  it('classifies the unified inbox by direction and request state', () => {
    expect(inboxBucket({ direction: 'incoming', kind: 'request', status: 'awaiting_consent', createdAt: '' })).toBe('requests');
    expect(inboxBucket({ direction: 'incoming', kind: 'peer', status: 'completed', createdAt: '' })).toBe('received');
    expect(inboxBucket({ direction: 'outgoing', kind: 'peer', status: 'completed', createdAt: '' })).toBe('sent');
  });

  it('shows expired deadlines for open Inbox entries without changing completed states', () => {
    const now = Date.parse('2026-10-01T12:00:00.000Z');
    const past = '2026-10-01T11:59:59.000Z';
    const future = '2026-10-01T12:00:01.000Z';
    expect(inboxRequestStatus('awaiting_consent', future, now)).toBe('awaiting_consent');
    expect(inboxRequestStatus('awaiting_consent', past, now)).toBe('expired');
    expect(inboxRequestStatus('pending', past, now)).toBe('expired');
    expect(inboxRequestStatus('approved', past, now)).toBe('approved');
    expect(inboxRequestStatus('pending', 'invalid', now)).toBe('pending');
  });
});
