import { z } from 'zod';

export const questionSchema = z.object({
  id: z.string().uuid(), prompt: z.string(),
  type: z.enum(['short_text','long_text','single_choice','multiple_choice','yes_no','number','date']),
  required: z.boolean(), options: z.array(z.string()).max(30), minLength: z.number().int().min(0).max(4000),
  maxLength: z.number().int().min(1).max(4000), minValue: z.number().nullable(), maxValue: z.number().nullable(), displayOrder: z.number().int(),
});

export const joinedRequestSchema = z.object({
  sessionId: z.string().uuid(), organizationId: z.string().uuid(), organizationName: z.string(), organizationStatus: z.string(),
  purpose: z.string(), templateName: z.string(), retentionDescription: z.string(), expiresAt: z.string(), templateVersionId: z.string().uuid().optional(),
  fields: z.array(z.object({ key: z.string(), required: z.boolean(), displayOrder: z.number() })),
  questions: z.array(questionSchema).default([]),
});
