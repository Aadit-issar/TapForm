import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Plus, QrCode, Star, Trash2 } from 'lucide-react-native';
import { FadeInSection } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Input, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { FIELD_REGISTRY, FieldKey } from '@/domain/fields';
import { isDemoMode, supabase } from '@/services/supabase';
import { error as errorHaptic, selection, success } from '@/services/haptics';
import { useAppState } from '@/state/AppState';

type Template = { id: string; name: string; purpose: string; retention_description: string; retention_days: number };
type Selected = { key: FieldKey; required: boolean };
type QuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'yes_no' | 'number' | 'date';
type QuestionDraft = { id: string; prompt: string; type: QuestionType; required: boolean; options: string; minLength: string; maxLength: string; minValue: string; maxValue: string };
type RequestLink = { id: string; template_id: string; one_time: boolean; expires_at: string | null; revoked_at: string | null; submission_count: number; created_at: string };
type ActiveLink = { id: string; token: string; templateName: string; oneTime: boolean; expiresAt: string | null };
const questionTypes: QuestionType[] = ['short_text','long_text','single_choice','multiple_choice','yes_no','number','date'];

export default function TemplatesScreen() {
  const { setRole, developerToolsUnlocked } = useAppState();
  const [orgId, setOrgId] = useState('');
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [retention, setRetention] = useState(30);
  const [fields, setFields] = useState<Selected[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [description, setDescription] = useState('');
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [links, setLinks] = useState<RequestLink[]>([]);
  const [activeLink, setActiveLink] = useState<ActiveLink | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('Event');
  const [contactEmail, setContactEmail] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) { setError('Sign in again to manage organization templates.'); return; }
      const { data: members, error: membersError } = await supabase.from('organization_members').select('organization_id').eq('user_id', auth.user.id).limit(1);
      if (membersError) throw new Error('organization_lookup_failed');
      const id = members?.[0]?.organization_id;
      if (id) {
        setOrgId(id);
        const [templateResult, prefResult, linksResult] = await Promise.all([
          supabase.from('request_templates').select('id,name,purpose,retention_description,retention_days').eq('organization_id', id).eq('is_archived', false).order('created_at', { ascending: false }),
          supabase.from('organization_preferences').select('default_template_id').eq('organization_id', id).maybeSingle(),
          supabase.from('organization_request_links').select('id,template_id,one_time,expires_at,revoked_at,submission_count,created_at').eq('organization_id', id).order('created_at', { ascending: false }).limit(50),
        ]);
        if (templateResult.error || prefResult.error || linksResult.error) throw new Error('templates_load_failed');
        setItems((templateResult.data || []) as Template[]);
        setDefaultTemplateId(prefResult.data?.default_template_id ?? null);
        setLinks((linksResult.data || []) as RequestLink[]);
      } else {
        setOrgId(''); setItems([]); setDefaultTemplateId(null); setLinks([]);
      }
    } catch {
      setError('Organization templates could not be refreshed. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);

  const startNew = () => { setEditId(null); setName('Event Registration'); setPurpose('Participant registration'); setDescription(''); setRetention(30); setFields([]); setQuestions([]); setError(''); setEditing(true); setActiveLink(null); };
  const openTemplate = async (item: Template, duplicate = false) => {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { data, error: loadError } = await supabase.from('request_template_fields').select('field_key,required').eq('template_id', item.id).order('display_order');
      const { data: version, error: versionError } = await supabase.from('request_template_versions').select('id,description').eq('template_id', item.id).order('revision', { ascending: false }).limit(1).maybeSingle();
      const { data: questionRows, error: questionError } = version ? await supabase.from('request_template_version_questions').select('id,prompt,question_type,required,options,min_length,max_length,min_value,max_value').eq('version_id', version.id).order('display_order') : { data: [], error: null };
      if (loadError || versionError || questionError) throw new Error('template_details_failed');
      setEditId(duplicate ? null : item.id); setName(duplicate ? `${item.name} copy` : item.name); setPurpose(item.purpose); setRetention(item.retention_days);
      setDescription(version?.description || '');
      setFields((data || []).map((field) => ({ key: field.field_key as FieldKey, required: field.required })));
      setQuestions((questionRows || []).map((question) => ({ id: question.id, prompt: question.prompt, type: question.question_type as QuestionType, required: question.required, options: (question.options as string[]).join('\n'), minLength: String(question.min_length), maxLength: String(question.max_length), minValue: question.min_value === null ? '' : String(question.min_value), maxValue: question.max_value === null ? '' : String(question.max_value) })));
      setEditing(true); setActiveLink(null);
    } catch { setError('Template details could not be loaded. Check your connection and retry.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (name.trim().length < 2 || purpose.trim().length < 2 || fields.length === 0) { setError('Add a name, a clear purpose, and at least one field.'); return; }
    if (!supabase || !orgId) { setError('Create an organization before saving templates.'); return; }
    const normalizedQuestions = questions.map((question) => ({
      prompt: question.prompt.trim(), type: question.type, required: question.required,
      options: ['single_choice','multiple_choice'].includes(question.type) ? question.options.split('\n').map((option) => option.trim()).filter(Boolean) : [],
      minLength: question.minLength ? Number(question.minLength) : 0, maxLength: question.maxLength ? Number(question.maxLength) : question.type === 'long_text' ? 4000 : 500,
      minValue: question.minValue ? Number(question.minValue) : null, maxValue: question.maxValue ? Number(question.maxValue) : null,
    }));
    if (normalizedQuestions.some((question) => !question.prompt || question.prompt.length > 240 || !Number.isInteger(question.minLength) || !Number.isInteger(question.maxLength) || question.minLength < 0 || question.maxLength < 1 || question.minLength > question.maxLength || (question.minValue !== null && !Number.isFinite(question.minValue)) || (question.maxValue !== null && !Number.isFinite(question.maxValue)) || (question.minValue !== null && question.maxValue !== null && question.minValue > question.maxValue) || (['single_choice','multiple_choice'].includes(question.type) && (!question.options.length || new Set(question.options).size !== question.options.length)))) { setError('Check question prompts, answer choices, and validation limits.'); return; }
    setBusy(true);
    try {
      const { error: saveError } = await supabase.rpc('save_request_template', { p_template_id: editId, p_name: name.trim(), p_purpose: purpose.trim(), p_retention_days: retention, p_fields: fields.map(({ key, required }) => ({ key, required })), p_questions: normalizedQuestions, p_description: description.trim() });
      if (saveError) throw new Error('template_save_failed');
      setEditing(false); setEditId(null); setLoading(true); success(); await reload();
    } catch { setError('Template could not be saved. Check the organization and selected fields.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const deleteTemplate = (item: Template) => Alert.alert('Archive request template?', `${item.name} will be unavailable for new requests. Existing submissions remain in history.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: () => { void (async () => {
      if (!supabase) return;
      setBusy(true);
      try {
        const { error: archiveError } = await supabase.rpc('archive_request_template', { p_template_id: item.id });
        if (archiveError) throw new Error('template_archive_failed');
        setItems((old) => old.filter((current) => current.id !== item.id));
        setLinks((old) => old.map((link) => link.template_id === item.id ? { ...link, revoked_at: new Date().toISOString() } : link));
        if (defaultTemplateId === item.id) setDefaultTemplateId(null);
        success();
      } catch { setError('Template could not be archived. Retry when you are online.'); errorHaptic(); }
      finally { setBusy(false); }
    })(); } },
  ]);  const createOrganization = async () => {
    if (!supabase || orgName.trim().length < 2 || !contactEmail.includes('@')) { setError('Add an organization name and a valid contact email.'); return; }
    setBusy(true);
    try {
      const { error: createError } = await supabase.rpc('create_organization', { p_name: orgName.trim(), p_type: orgType.trim() || 'Organization', p_contact_email: contactEmail.trim() });
      if (createError) throw new Error('organization_create_failed');
      setRole('organization'); setLoading(true); success(); await reload();
    } catch { setError('Organization could not be created. Check your connection and sign-in.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const demoSeed = async () => { if (!__DEV__ || !developerToolsUnlocked || !supabase) return; setBusy(true); const { error: seedError } = await supabase.rpc('seed_demo_account', { p_mode: 'organization' }); setBusy(false); if (seedError) { setError('Could not create the demo organization. Check Supabase setup.'); return; } setLoading(true); await reload(); };
  const toggleField = (key: FieldKey) => { selection(); setFields((old) => old.some((field) => field.key === key) ? old.filter((field) => field.key !== key) : [...old, { key, required: true }]); };
  const toggleRequired = (key: FieldKey) => { selection(); setFields((old) => old.map((field) => field.key === key ? { ...field, required: !field.required } : field)); };
  const addQuestion = () => { selection(); setQuestions((old) => [...old, { id: `new-${Date.now()}`, prompt: '', type: 'short_text', required: false, options: '', minLength: '0', maxLength: '500', minValue: '', maxValue: '' }]); };
  const editQuestion = (id: string, patch: Partial<QuestionDraft>) => setQuestions((old) => old.map((question) => question.id === id ? { ...question, ...patch } : question));
  const makeDefault = async (templateId: string) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const next = defaultTemplateId === templateId ? null : templateId;
      const { error: defaultError } = await supabase.rpc('set_default_request_template', { p_template_id: next });
      if (defaultError) throw new Error('template_default_failed');
      setDefaultTemplateId(next); success();
    } catch { setError('Default request template could not be updated.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const requestLink = (token: string) => `tapform:///request?token=${encodeURIComponent(token)}`;
  const createLink = async (template: Template, oneTime: boolean) => {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const expiry = oneTime ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
      const { data, error: linkError } = await supabase.rpc('create_request_link', { p_template_id: template.id, p_one_time: oneTime, p_expires_at: expiry });
      if (linkError || !data || typeof data !== 'object') throw new Error('request_link_create_failed');
      const value = data as { linkId?: string; token?: string; templateName?: string; oneTime?: boolean; expiresAt?: string | null };
      if (!value.linkId || !value.token || !/^[0-9a-f]{64}$/i.test(value.token)) throw new Error('request_link_invalid');
      setActiveLink({ id: value.linkId, token: value.token, templateName: value.templateName || template.name, oneTime: value.oneTime ?? oneTime, expiresAt: value.expiresAt ?? null });
      success();
      await reload();
    } catch { setError('A secure request QR could not be created. Check the template and retry.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const showLink = async (link: RequestLink) => {
    if (!supabase || link.revoked_at) return;
    setBusy(true);
    try {
      const { data, error: tokenError } = await supabase.from('organization_request_links').select('token').eq('id', link.id).maybeSingle();
      const template = items.find((item) => item.id === link.template_id);
      if (tokenError || !data?.token || !template) throw new Error('request_link_load_failed');
      setActiveLink({ id: link.id, token: data.token, templateName: template.name, oneTime: link.one_time, expiresAt: link.expires_at });
    } catch { setError('This request QR could not be opened. Create a replacement link.'); errorHaptic(); }
    finally { setBusy(false); }
  };
  const revokeLink = async (link: RequestLink) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error: revokeError } = await supabase.rpc('revoke_request_link', { p_link_id: link.id });
      if (revokeError) throw new Error('request_link_revoke_failed');
      setLinks((old) => old.map((item) => item.id === link.id ? { ...item, revoked_at: new Date().toISOString() } : item));
      if (activeLink?.id === link.id) setActiveLink(null);
      success();
    } catch { setError('This QR code could not be revoked. Retry when you are online.'); errorHaptic(); }
    finally { setBusy(false); }
  };

  return <Page><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.top}><View><Eyebrow>REUSABLE REQUESTS</Eyebrow><Title>Templates</Title><Body>Ask only for what this purpose needs.</Body></View>{!editing ? <Pressable onPress={startNew} style={styles.add} accessibilityRole="button" accessibilityLabel="Create request template"><Plus size={21} color={colors.primaryButtonText} /></Pressable> : null}</View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {activeLink ? <FadeInSection><Surface style={styles.qrPanel}>
      <View style={styles.linkHead}><View><Eyebrow>{activeLink.oneTime ? 'ONE-TIME REQUEST' : 'REUSABLE REQUEST'}</Eyebrow><Text style={styles.qrTitle}>{activeLink.templateName}</Text></View><Pressable accessibilityRole="button" onPress={() => setActiveLink(null)} style={styles.iconButton}><Text style={styles.cancel}>Close</Text></Pressable></View>
      <View style={styles.qrFrame}><QRCode value={requestLink(activeLink.token)} size={210} quietZone={12} color="#111212" backgroundColor="#F2F2F0" ecl="Q" /></View>
      <Body style={styles.center}>This QR opens the saved request. Each participant gets a separate session and must approve before sharing.</Body>
      {activeLink.expiresAt ? <Text style={styles.retention}>Expires {new Date(activeLink.expiresAt).toLocaleString()}</Text> : null}
      <Button title="Share request link" variant="secondary" onPress={() => void Share.share({ title: activeLink.templateName, message: `Open this TapForm request: ${requestLink(activeLink.token)}` })}><Copy size={16} color={colors.ink} /></Button>
    </Surface></FadeInSection> : null}
    {editing ? <FadeInSection><Surface style={styles.builder}>
      <View style={styles.builderHead}><Text style={styles.builderTitle}>{editId ? 'Edit request template' : 'New request template'}</Text><Pressable onPress={() => { setEditing(false); setEditId(null); }} accessibilityRole="button"><Text style={styles.cancel}>Cancel</Text></Pressable></View>
      <Input label="Template name" value={name} onChangeText={setName} placeholder="Event Registration" />
      <Input label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="Participant registration" />
      <Input label="What participants should know (optional)" value={description} onChangeText={setDescription} placeholder="How submitted information will be used" maxLength={500} multiline numberOfLines={3} />
      <View style={{ gap: 9 }}><Text style={styles.retentionLabel}>Remove shared values after</Text><View style={styles.retentionOptions}>{[7, 30, 90].map((days) => <Pressable key={days} onPress={() => setRetention(days)} accessibilityRole="radio" accessibilityState={{ checked: retention === days }} style={[styles.retentionOption, retention === days && styles.retentionActive]}><Text style={[styles.retentionOptionText, retention === days && styles.retentionActiveText]}>{days} days</Text></Pressable>)}</View></View>
      <SectionTitle trailing={`${fields.length} selected`}>Requested fields</SectionTitle>
      <View style={styles.fields}>{FIELD_REGISTRY.map((field, index) => { const selected = fields.find((entry) => entry.key === field.key); return <View key={field.key}><View style={styles.fieldRow}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(selected) }} onPress={() => toggleField(field.key)} style={styles.fieldSelect}><View style={[styles.checkbox, selected && styles.checkboxActive]}>{selected ? <Check size={13} color={colors.primaryButtonText} strokeWidth={3} /> : null}</View><View style={{ flex: 1 }}><Text style={styles.fieldName}>{field.label}</Text><Text style={styles.fieldCategory}>{field.category}</Text></View></Pressable>{selected ? <Pressable accessibilityRole="button" accessibilityLabel={`${selected.required ? 'Make optional' : 'Make required'}: ${field.label}`} onPress={() => toggleRequired(field.key)} style={styles.requiredToggle}><Text style={[styles.requiredText, selected.required && styles.requiredOn]}>{selected.required ? 'Required' : 'Optional'}</Text>{selected.required ? <ChevronDown size={14} color={colors.green} /> : <ChevronUp size={14} color={colors.muted} />}</Pressable> : null}</View>{index < FIELD_REGISTRY.length - 1 ? <View style={styles.rule} /> : null}</View>; })}</View>
      <View style={styles.questionSection}>
        <View style={styles.questionHeader}><SectionTitle>One-Time Questions</SectionTitle><Pressable accessibilityRole="button" onPress={addQuestion} style={styles.addQuestion}><Plus size={16} color={colors.ink} /><Text style={styles.addQuestionText}>Add</Text></Pressable></View>
        {questions.length === 0 ? <Body>Request-specific answers stay with that submission and are never added to the Vault.</Body> : questions.map((question, index) => <View key={question.id} style={styles.questionEditor}>
          <View style={styles.questionHeader}><Text style={styles.questionTitle}>Question {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove question ${index + 1}`} onPress={() => setQuestions((old) => old.filter((item) => item.id !== question.id))} style={styles.iconButton}><Trash2 size={16} color={colors.muted} /></Pressable></View>
          <Input label="Prompt" value={question.prompt} onChangeText={(value) => editQuestion(question.id, { prompt: value })} placeholder="What should we know?" maxLength={240} />
          <View style={styles.typeChoices}>{questionTypes.map((type) => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: question.type === type }} onPress={() => editQuestion(question.id, { type, options: ['single_choice','multiple_choice'].includes(type) ? question.options : '' })} style={[styles.choice, question.type === type && styles.choiceOn]}><Text style={[styles.choiceText, question.type === type && styles.choiceTextOn]}>{type.replaceAll('_', ' ')}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: question.required }} onPress={() => editQuestion(question.id, { required: !question.required })} style={styles.requiredToggle}><View style={[styles.checkbox, question.required && styles.checkboxActive]}>{question.required ? <Check size={13} color={colors.primaryButtonText} strokeWidth={3} /> : null}</View><Text style={styles.requiredText}>{question.required ? 'Required' : 'Optional'}</Text></Pressable>
          {['single_choice','multiple_choice'].includes(question.type) ? <Input label="Answer options (one per line)" value={question.options} onChangeText={(value) => editQuestion(question.id, { options: value })} placeholder={'On-site\nRemote'} multiline numberOfLines={4} /> : null}
          {['short_text','long_text','number'].includes(question.type) ? <View style={styles.validationRow}><Input label={question.type === 'number' ? 'Minimum value' : 'Minimum length'} value={question.type === 'number' ? question.minValue : question.minLength} onChangeText={(value) => editQuestion(question.id, question.type === 'number' ? { minValue: value } : { minLength: value })} keyboardType="numeric" placeholder="No minimum" /><Input label={question.type === 'number' ? 'Maximum value' : 'Maximum length'} value={question.type === 'number' ? question.maxValue : question.maxLength} onChangeText={(value) => editQuestion(question.id, question.type === 'number' ? { maxValue: value } : { maxLength: value })} keyboardType="numeric" placeholder="No maximum" /></View> : null}
        </View>)}
      </View>
      <Button title={editId ? 'Save changes' : 'Save template'} loading={busy} onPress={() => void save()} />
    </Surface></FadeInSection> : null}
    {loading ? <ActivityIndicator color={colors.ink} /> : null}
    {!editing && items.map((item, index) => <FadeInSection key={item.id} delay={Math.min(index, 5) * 20}><Surface style={styles.template}><View style={styles.templateHead}><View style={styles.templateIcon}><Copy size={18} color={colors.ink} /></View><View style={styles.actions}><Pressable onPress={() => void makeDefault(item.id)} disabled={busy} accessibilityRole="button" accessibilityLabel={defaultTemplateId === item.id ? 'Remove default request template' : 'Set as default request template'} style={styles.iconButton}><Star size={16} color={defaultTemplateId === item.id ? colors.ink : colors.muted} fill={defaultTemplateId === item.id ? colors.ink : 'transparent'} /></Pressable><Pressable onPress={() => void openTemplate(item, true)} accessibilityRole="button" accessibilityLabel={`Duplicate ${item.name}`} style={styles.iconButton}><Copy size={16} color={colors.muted} /></Pressable><Pressable onPress={() => void openTemplate(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} style={styles.iconButton}><Pencil size={16} color={colors.muted} /></Pressable><Pressable onPress={() => deleteTemplate(item)} accessibilityRole="button" accessibilityLabel={`Archive ${item.name}`} style={styles.iconButton}><Trash2 size={16} color={colors.subtle} /></Pressable></View></View><View style={styles.titleLine}><Text style={styles.templateName}>{item.name}</Text>{defaultTemplateId === item.id ? <Text style={styles.defaultLabel}>DEFAULT</Text> : null}</View><Text style={styles.templatePurpose}>{item.purpose}</Text><View style={styles.templateFoot}><Text style={styles.retention}>Retention · {item.retention_description}</Text></View>
      <View style={styles.templateActions}><Button title="Start NFC request" variant="secondary" onPress={() => router.push({ pathname: '/nfc', params: { mode: 'host', templateId: item.id } })} /><Button title="Create reusable QR" variant="secondary" loading={busy} onPress={() => void createLink(item, false)}><QrCode size={16} color={colors.ink} /></Button><Button title="Create one-time QR" variant="quiet" loading={busy} onPress={() => void createLink(item, true)} /></View>
      {links.filter((link) => link.template_id === item.id).map((link) => <View key={link.id} style={styles.linkRow}><View style={styles.linkCopy}><Text style={styles.linkLabel}>{link.revoked_at ? 'Revoked' : link.one_time ? 'One-time QR' : 'Reusable QR'} · {link.submission_count} {link.submission_count === 1 ? 'submission' : 'submissions'}</Text><Text style={styles.retention}>{new Date(link.created_at).toLocaleDateString()}{link.expires_at ? ` · expires ${new Date(link.expires_at).toLocaleDateString()}` : ''}</Text></View><Pressable disabled={Boolean(link.revoked_at) || busy} onPress={() => void showLink(link)} accessibilityRole="button" accessibilityLabel="View request QR" style={styles.iconButton}><QrCode size={17} color={colors.ink} /></Pressable>{!link.revoked_at ? <Pressable onPress={() => void revokeLink(link)} accessibilityRole="button" accessibilityLabel="Revoke request QR" style={styles.iconButton}><Trash2 size={16} color={colors.muted} /></Pressable> : null}</View>)}
    </Surface></FadeInSection>)}
    {!loading && items.length === 0 && !editing ? <Surface style={styles.empty}><Text style={styles.emptyTitle}>{orgId ? 'No saved requests yet' : 'Organization setup'}</Text><Body>{orgId ? 'Create a reusable request with exact required and optional fields.' : 'Create an organization to start requesting information.'}</Body>{__DEV__ && isDemoMode && developerToolsUnlocked && !orgId ? <Button title="Set up demo organization" loading={busy} onPress={() => void demoSeed()} /> : null}{!orgId && !isDemoMode ? <><Input label="Organization name" value={orgName} onChangeText={setOrgName} placeholder="Northfield Tech Fest" /><Input label="Organization type" value={orgType} onChangeText={setOrgType} placeholder="Education event" /><Input label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" placeholder="team@example.org" /><Text style={styles.unverified}>New organizations are labeled unverified until real verification is implemented.</Text><Button title="Create organization" loading={busy} onPress={() => void createOrganization()} /></> : null}<Button title="Build a request template" variant="secondary" onPress={startNew} disabled={!orgId} /></Surface> : null}
    {isDemoMode ? <Text style={styles.demo}>FICTIONAL DEMO DATA · ORGANIZATION IS UNVERIFIED</Text> : null}
  </ScrollView></Page>;
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 28 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, add: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primaryButton, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, templateActions: { gap: 8 },
  builder: { gap: 15, padding: 17 }, builderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, builderTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' }, cancel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  retentionLabel: { color: colors.ink, fontSize: 13, fontWeight: '600' }, retentionOptions: { flexDirection: 'row', gap: 8 }, retentionOption: { minHeight: 48, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface }, retentionActive: { borderColor: colors.subtle, backgroundColor: colors.surfaceActive }, retentionOptionText: { fontSize: 12, color: colors.muted, fontWeight: '600' }, retentionActiveText: { color: colors.ink },
  fields: { borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 12 }, fieldRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8 }, fieldSelect: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.subtle, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: colors.primaryButton, borderColor: colors.primaryButton }, fieldName: { color: colors.ink, fontSize: 12, fontWeight: '600' }, fieldCategory: { color: colors.muted, fontSize: 10, marginTop: 3 }, requiredToggle: { minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 7 }, requiredText: { color: colors.muted, fontSize: 10, fontWeight: '600' }, requiredOn: { color: colors.ink }, rule: { height: 1, backgroundColor: colors.line },
  template: { gap: 12 }, templateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, templateIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, actions: { flexDirection: 'row', gap: 4 }, iconButton: { padding: 9, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, templateName: { color: colors.ink, fontSize: 18, fontWeight: '700' }, templatePurpose: { color: colors.muted, fontSize: 13, lineHeight: 19 }, templateFoot: { paddingTop: 10, borderTopWidth: 1, borderColor: colors.line }, retention: { color: colors.muted, fontSize: 11 }, empty: { gap: 12, padding: 20 }, emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink }, demo: { fontSize: 9, color: colors.subtle, fontWeight: '700', letterSpacing: 1, textAlign: 'center' }, unverified: { color: colors.muted, fontSize: 11, lineHeight: 16 }, error: { color: colors.red, fontSize: 13 },
  questionSection: { gap: 12, paddingTop: 6 }, questionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, questionTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' }, addQuestion: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, paddingHorizontal: 8 }, addQuestionText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, questionEditor: { gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 12 }, typeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.line }, choiceOn: { backgroundColor: colors.ink, borderColor: colors.ink }, choiceText: { color: colors.muted, fontSize: 10, textTransform: 'capitalize' }, choiceTextOn: { color: colors.canvas }, validationRow: { flexDirection: 'row', gap: 8 }, qrPanel: { alignItems: 'center', gap: 13 }, linkHead: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, qrTitle: { color: colors.ink, fontSize: 16, fontWeight: '600', marginTop: 3 }, qrFrame: { padding: 12, backgroundColor: '#F2F2F0', borderRadius: 12, borderWidth: 1, borderColor: colors.line }, center: { textAlign: 'center' }, titleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, defaultLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 }, linkRow: { borderTopWidth: 1, borderColor: colors.line, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 4 }, linkCopy: { flex: 1, gap: 3 }, linkLabel: { color: colors.ink, fontSize: 11, fontWeight: '600' },
});

