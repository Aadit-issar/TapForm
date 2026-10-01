import { z } from 'zod';
import { JoinPayload } from './requestTransport';
import { supabase } from './supabase';
import { joinedRequestSchema } from './requestSchemas';
export { joinedRequestSchema } from './requestSchemas';

const payloadSchema = z.object({
  version: z.union([z.literal(1),z.literal(2)]), requestSessionId: z.string().uuid(), nonce: z.string().regex(/^[0-9a-f]{32}$/i),
  expiresAt: z.string(), organizationId: z.string().uuid(),
});
const responseResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('declined'), responseId: z.string().uuid(), sharedFieldCount: z.number().optional(), answerCount: z.number().optional() }),
  z.object({ status: z.literal('approved'), responseId: z.string().uuid(), shared: z.record(z.string(), z.string()), sharedFieldCount: z.number().optional(), answerCount: z.number().optional() }),
]);
export type JoinedRequest = z.infer<typeof joinedRequestSchema>;
export type ResponseResult = z.infer<typeof responseResultSchema>;

export async function createSession(templateId: string): Promise<{ payload: JoinPayload; metadata: { organizationName: string; purpose: string; templateName: string; retentionDescription: string } }> {
  if (!supabase) throw new Error('Connect a Supabase project before starting a request.');
  const { data, error } = await supabase.rpc('create_request_session', { p_template_id: templateId });
  if (error) throw new Error(error.message.includes('Authentication') ? 'Sign in again to start this request.' : 'This request could not be started. Check your template and connection.');
  const result = z.object({ version: z.union([z.literal(1),z.literal(2)]), requestSessionId: z.string().uuid(), nonce: z.string(), expiresAt: z.string(), organizationId: z.string().uuid(), organizationName: z.string(), purpose: z.string(), templateName: z.string(), retentionDescription: z.string() }).safeParse(data);
  if (!result.success) throw new Error('The server returned an invalid request session.');
  const parsed = payloadSchema.safeParse(result.data);
  if (!parsed.success) throw new Error('The server returned an invalid NFC session payload.');
  return { payload: parsed.data, metadata: { organizationName: result.data.organizationName, purpose: result.data.purpose, templateName: result.data.templateName, retentionDescription: result.data.retentionDescription } };
}

export async function joinSession(payload: JoinPayload): Promise<JoinedRequest> {
  if (!supabase) throw new Error('Connect a Supabase project before joining a request.');
  const validated = payloadSchema.safeParse(payload);
  if (!validated.success) throw new Error('This tap did not contain a valid TapForm request.');
  const { data, error } = await supabase.rpc('join_request_session', { p_session_id: validated.data.requestSessionId, p_nonce: validated.data.nonce });
  if (error) {
    if (error.code === 'P0001') throw new Error('This request has expired. Ask the organization to start again.');
    if (error.code === '23505') throw new Error('This request has already been used. Ask the organization to start a new one.');
    throw new Error('We could not verify this request. Check your connection and try again.');
  }
  const parsed = joinedRequestSchema.safeParse(data);
  if (!parsed.success) throw new Error('The server returned an incomplete request.');
  if (parsed.data.organizationId !== validated.data.organizationId) throw new Error('The request organization could not be verified.');
  return parsed.data;
}

export async function getJoinedRequest(sessionId: string): Promise<JoinedRequest> {
  if (!supabase) throw new Error('Connect to TapForm to reopen this request.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in again to reopen this request.');
  const { data, error } = await supabase.from('request_sessions').select(`
    id,organization_id,status,expires_at,template_version_id,
    organizations(name,verification_status),
    request_template_versions(id,name,purpose,retention_description,
      request_template_version_fields(field_key,required,display_order),
      request_template_version_questions(id,prompt,question_type,required,options,min_length,max_length,min_value,max_value,display_order))
  `).eq('id', sessionId).eq('joined_user_id', auth.user.id).maybeSingle();
  if (error || !data) throw new Error('This request could not be reopened. Scan its QR code again if it is still available.');
  const row = data as unknown as {
    id: string; organization_id: string; expires_at: string; template_version_id: string;
    organizations: { name: string; verification_status: string } | null;
    request_template_versions: null | { id: string; name: string; purpose: string; retention_description: string;
      request_template_version_fields: { field_key: string; required: boolean; display_order: number }[];
      request_template_version_questions: { id: string; prompt: string; question_type: string; required: boolean; options: string[]; min_length: number; max_length: number; min_value: number | string | null; max_value: number | string | null; display_order: number }[];
    };
  };
  const version = row.request_template_versions;
  if (!version || !row.organizations) throw new Error('The saved request version is no longer available.');
  const parsed = joinedRequestSchema.safeParse({
    sessionId: row.id, organizationId: row.organization_id, organizationName: row.organizations.name,
    organizationStatus: row.organizations.verification_status, purpose: version.purpose, templateName: version.name,
    retentionDescription: version.retention_description, expiresAt: row.expires_at, templateVersionId: version.id,
    fields: version.request_template_version_fields.map((field) => ({ key: field.field_key, required: field.required, displayOrder: field.display_order })),
    questions: version.request_template_version_questions.map((question) => ({
      id: question.id, prompt: question.prompt, type: question.question_type, required: question.required,
      options: question.options, minLength: question.min_length, maxLength: question.max_length,
      minValue: question.min_value === null ? null : Number(question.min_value), maxValue: question.max_value === null ? null : Number(question.max_value), displayOrder: question.display_order,
    })),
  });
  if (!parsed.success) throw new Error('The saved request details could not be verified.');
  return parsed.data;
}

export async function resolveRequestLink(token: string): Promise<JoinPayload> {
  if (!supabase) throw new Error('Connect a Supabase project before opening this request link.');
  if (!/^[0-9a-f]{64}$/i.test(token)) throw new Error('This TapForm request link is invalid.');
  const { data, error } = await supabase.rpc('resolve_request_link', { p_token: token });
  if (error) {
    if (error.code === 'P0001') throw new Error('This request link has expired, was revoked, or has already been used.');
    if (error.code === '23505') throw new Error('This one-time request is already being reviewed. Try again if its current session expires.');
    throw new Error('This request could not be opened. Check your connection and try again.');
  }
  const parsed = payloadSchema.safeParse(data);
  if (!parsed.success) throw new Error('The server returned an invalid request session.');
  return parsed.data;
}

export type ConsentAnswers = Record<string, string | number | boolean | string[] | null>;
export async function submitConsent(
  sessionId: string,
  approved: boolean,
  keys: string[] = [],
  answers: ConsentAnswers = {},
  missingValues: Record<string, string> = {},
  saveMissingKeys: string[] = [],
) {
  if (!supabase) throw new Error('Connect a Supabase project before responding to a request.');
  const { data, error } = approved
    ? await supabase.rpc('respond_to_request', { p_session_id: sessionId, p_approved: true, p_approved_keys: keys, p_answers: answers, p_missing_values: missingValues, p_save_missing_keys: saveMissingKeys })
    : await supabase.rpc('respond_to_request', { p_session_id: sessionId, p_approved: false, p_approved_keys: [], p_answers: {}, p_missing_values: {}, p_save_missing_keys: [] });
  if (error) {
    if (error.code === 'P0001') throw new Error('This request expired before it could be submitted.');
    if (error.code === '23505') throw new Error('This request has already been answered.');
    if (error.code === '23514') throw new Error('A required detail is missing from your vault. Add it, then retry.');
    throw new Error('Your response could not be sent. Check your connection and try again.');
  }
  const parsed = responseResultSchema.safeParse(data);
  if (!parsed.success || parsed.data.status !== (approved ? 'approved' : 'declined')) throw new Error('TapForm could not confirm the response. Check Activity before trying again.');
  return parsed.data;
}
