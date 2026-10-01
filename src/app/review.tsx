import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, CircleAlert, Clock3, ShieldCheck } from 'lucide-react-native';
import { AnimatedCounter, AnimatedToggleRow, FadeInSection } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Input, Surface } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { checkConsent, RequestedField } from '@/domain/consent';
import { FIELD_BY_KEY, FieldKey, validateField, vaultFromRows } from '@/domain/fields';
import { countAnsweredQuestions, missingRequiredFields, validateQuestionAnswers, type QuestionAnswer, type RequestQuestion } from '@/domain/exchange';
import { questionSchema } from '@/services/requestSchemas';
import { z } from 'zod';
import { submitConsent } from '@/services/requests';
import { clearPendingReview } from '@/services/pendingReview';
import { failPendingNotification, finishPendingNotification } from '@/services/nfcPeer';
import { error, success, warning } from '@/services/haptics';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';

type RequestMeta = { key: string; required: boolean; displayOrder: number };

export default function ReviewScreen() {
  const params = useLocalSearchParams<{ sessionId: string; orgName: string; purpose: string; templateName: string; retention: string; fields: string; questions?: string; expiresAt: string; verification: string; requiredOnly?: string; pendingId?: string; notificationSelected?: string; notificationExcludedRequired?: string }>();
  const requiredOnly = params.requiredOnly === '1';
  const { vault, replaceVault } = useAppState();
  const [loading, setLoading] = useState(true);
  const [vaultReady, setVaultReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [responseBusy, setResponseBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [declined, setDeclined] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [entered, setEntered] = useState<Partial<Record<FieldKey,string>>>({});
  const [saveMissing, setSaveMissing] = useState<Partial<Record<FieldKey,boolean>>>({});
  const [answers, setAnswers] = useState<Record<string,QuestionAnswer>>({});
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const requested = useMemo<RequestMeta[]>(() => {
    try {
      const parsed = JSON.parse(params.fields || '[]') as RequestMeta[];
      return parsed.filter((field) => typeof field?.key === 'string' && Boolean(FIELD_BY_KEY[field.key as FieldKey]) && typeof field.required === 'boolean' && Number.isFinite(field.displayOrder)).slice(0, 20)
        .sort((a, b) => a.displayOrder - b.displayOrder);
    } catch { return []; }
  }, [params.fields]);
  const notificationSelected = useMemo<Set<string> | null>(() => {
    if (typeof params.notificationSelected !== 'string') return null;
    try { return new Set((JSON.parse(params.notificationSelected) as unknown[]).filter((key): key is string => typeof key === 'string')); }
    catch { return new Set(); }
  }, [params.notificationSelected]);
  const questions = useMemo<RequestQuestion[]>(() => {
    try {
      const parsed = z.array(questionSchema).max(50).safeParse(JSON.parse(params.questions || '[]'));
      return parsed.success ? parsed.data : [];
    } catch { return []; }
  }, [params.questions]);
  const excludedRequiredKeys = useMemo<Set<string>>(() => {
    try { return new Set((JSON.parse(params.notificationExcludedRequired || '[]') as unknown[]).filter((key): key is string => typeof key === 'string')); }
    catch { return new Set(); }
  }, [params.notificationExcludedRequired]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setErrorMessage(''); setVaultReady(false);
      if (!supabase) { if (active) { setErrorMessage('Connect to TapForm to review this request.'); setLoading(false); } return; }
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { if (active) setErrorMessage('Sign in again to review this request.'); return; }
        const { data, error: queryError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', auth.user.id);
        if (queryError) { if (active) setErrorMessage('Your Vault could not be loaded. Check your connection and retry.'); return; }
        if (active) { replaceVault(vaultFromRows(data || [])); setVaultReady(true); }
      } catch {
        if (active) setErrorMessage('Your Vault could not be loaded. Check your connection and retry.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadAttempt, replaceVault]);

  const isSelected = (field: RequestMeta) => {
    if (requiredOnly) return field.required;
    if (field.required) return excludedRequiredKeys.has(field.key) ? (selected[field.key] ?? false) : true;
    const defaultValue = notificationSelected ? notificationSelected.has(field.key) : Boolean(vault[field.key as FieldKey] || entered[field.key as FieldKey]);
    return selected[field.key] ?? defaultValue;
  };
  const effectiveVault = { ...vault, ...entered };
  const consentFields: RequestedField[] = requested.map((field) => ({ key: field.key as FieldKey, required: field.required, selected: isSelected(field) }));
  const checked = checkConsent(consentFields, effectiveVault);
  const sharedKeys = checked.ok ? checked.shared : requested.filter((field) => isSelected(field) && Boolean(effectiveVault[field.key as FieldKey]?.trim())).map((field) => field.key as FieldKey);
  const required = requested.filter((field) => field.required);
  const optional = requested.filter((field) => !field.required);
  const answeredCount = countAnsweredQuestions(questions, answers);
  const shareButtonTitle = requiredOnly
    ? `Share ${required.length} required ${required.length === 1 ? 'field' : 'fields'}`
    : checked.ok
      ? `Share ${sharedKeys.length} ${sharedKeys.length === 1 ? 'field' : 'fields'}${questions.length ? ` · ${answeredCount} ${answeredCount === 1 ? 'answer' : 'answers'}` : ''}`
      : 'Complete required information';
  const needsRequiredRestore = !requiredOnly && required.some((field) => excludedRequiredKeys.has(field.key) && !isSelected(field));
  const missingFromVault = requested.filter((field) => !vault[field.key as FieldKey]?.trim());
  const requiredMissing = missingRequiredFields(requested.map((field) => ({ key: field.key as FieldKey, required: field.required })), vault, entered);
  const invalidQuestions = validateQuestionAnswers(questions, answers);
  const expiresAt = Date.parse(params.expiresAt || '');
  const secondsRemaining = clockNow > 0 && Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - clockNow) / 1000)) : null;
  const expired = secondsRemaining === 0;

  const decline = async () => {
    setResponseBusy(true); setErrorMessage('');
    try {
      await submitConsent(params.sessionId, false);
      await clearPendingReview(params.sessionId);
      if (params.pendingId) await finishPendingNotification(params.pendingId, 'declined', 0);
      setDeclined(true); warning();
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Your response could not be sent.';
      if (params.pendingId) {
        if (/expired/i.test(message)) await finishPendingNotification(params.pendingId, 'expired', 0);
        else if (/already been answered/i.test(message)) await finishPendingNotification(params.pendingId, 'processed', 0);
        else await failPendingNotification(params.pendingId, requiredOnly ? 'share_required' : 'review');
      }
      setErrorMessage(message); error();
    }
    finally { setResponseBusy(false); }
  };

  const approve = async () => {
    if (!checked.ok || responseBusy) return;
    setResponseBusy(true); setErrorMessage('');
    try {
      const approvedKeys = requiredOnly ? required.map((field) => field.key as FieldKey) : checked.shared;
      if (requiredOnly && (required.length === 0 || approvedKeys.some((key) => !vault[key]?.trim()))) return;
      const invalidValue = requested.map((field) => field.key as FieldKey).find((key) => entered[key]?.trim() && validateField(key,entered[key]!) !== null);
      if (invalidValue) { setErrorMessage(validateField(invalidValue,entered[invalidValue]!) || 'Check the information entered.'); return; }
      if (invalidQuestions.length) { setErrorMessage('Complete each required question and check your answers.'); return; }
      const answerValues = Object.fromEntries(questions.flatMap((question) => {
        const value = answers[question.id];
        if (value == null || typeof value === 'string' && value.trim() === '' || Array.isArray(value) && value.length===0) return [];
        return [[question.id, question.type==='number' ? Number(value) : value]];
      }));
      const missingValues = Object.fromEntries(Object.entries(entered).filter(([key,value]) => requested.some((field) => field.key===key) && Boolean(value?.trim())));
      const saveKeys = Object.entries(saveMissing).filter(([key,value]) => value && Boolean(entered[key as FieldKey]?.trim())).map(([key]) => key);
      const result = await submitConsent(params.sessionId, true, approvedKeys, answerValues, missingValues, saveKeys);
      if (result.status !== 'approved') throw new Error('TapForm could not confirm this share. Check Activity before trying again.');
      if (requiredOnly) {
        const receivedKeys = Object.keys(result.shared).sort();
        const expectedKeys = approvedKeys.slice().sort();
        if (receivedKeys.length !== expectedKeys.length || receivedKeys.some((key, index) => key !== expectedKeys[index])) {
          throw new Error('TapForm could not verify the required-only share. Check Activity before continuing.');
        }
      }
      await clearPendingReview(params.sessionId);
      if (params.pendingId) await finishPendingNotification(params.pendingId, 'approved', Object.keys(result.shared).length);
      success();
      router.replace({ pathname: '/done', params: { status: 'approved', orgName: params.orgName, purpose: params.purpose, responseId: result.responseId, answerCount: String(result.answerCount ?? countAnsweredQuestions(questions,answerValues)), sharedFieldCount: String(result.sharedFieldCount ?? Object.keys(result.shared).length), timestamp: new Date().toISOString() } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Your response could not be sent.';
      if (params.pendingId) {
        if (/expired/i.test(message)) await finishPendingNotification(params.pendingId, 'expired', 0);
        else if (/already been answered/i.test(message)) await finishPendingNotification(params.pendingId, 'processed', 0);
        else await failPendingNotification(params.pendingId, requiredOnly ? 'share_required' : 'review');
      }
      setErrorMessage(message); error();
    }
    finally { setResponseBusy(false); }
  };

  if (declined) return <SafeAreaView style={styles.center} edges={['top','left','right','bottom']}><View style={styles.resultIcon}><Check size={25} color={colors.ink} /></View><Eyebrow>YOUR CHOICE IS RECORDED</Eyebrow><Text style={styles.resultTitle}>Request declined</Text><Body style={styles.centerText}>Nothing was shared with {params.orgName || 'the organization'}.</Body><Button title="Done" onPress={() => router.dismissTo('/(tabs)/activity')} /></SafeAreaView>;
  if (loading) return <SafeAreaView style={styles.center} edges={['top','left','right','bottom']}><ActivityIndicator color={colors.ink} /><Body>Loading your Vault securely…</Body></SafeAreaView>;
  if (!vaultReady) return <SafeAreaView style={styles.center} edges={['top','left','right','bottom']}><View style={styles.resultIcon}><CircleAlert size={22} color={colors.ink} /></View><Eyebrow>REQUEST NOT READY</Eyebrow><Text style={styles.resultTitle}>Your Vault could not be checked</Text><Body style={styles.centerText}>{errorMessage || 'Reconnect and retry before sharing any information.'}</Body><Button title="Try again" onPress={() => { setVaultReady(false); setLoadAttempt((attempt) => attempt + 1); }} /><Button title="Go back" variant="quiet" onPress={() => router.back()} /></SafeAreaView>;

  return <SafeAreaView style={styles.screen} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={20} color={colors.ink} /><Text style={styles.backText}>Request</Text></Pressable>

      <FadeInSection style={styles.orgIdentity}>
        <View style={styles.orgMark}><Text style={styles.orgInitial}>{(params.orgName || 'T').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.orgCopy}><Text numberOfLines={2} style={styles.orgName}>{params.orgName || 'Organization'}</Text><Text style={styles.orgStatus}>{params.verification === 'verified' ? 'Organization' : 'Unverified organization'}</Text></View>
        <View style={styles.statusMark}><ShieldCheck size={17} color={colors.muted} /></View>
      </FadeInSection>

      <View style={styles.heading}><Eyebrow>REQUEST FOR YOUR VAULT</Eyebrow><Text style={styles.pageTitle}>{params.templateName || 'Information request'}</Text><Body>{params.orgName || 'This organization'} wants information for {params.purpose || 'its stated purpose'}.</Body></View>

      <Surface style={styles.requestMeta}><View style={styles.metaIcon}><Clock3 size={16} color={colors.ink} /></View><View style={styles.metaCopy}><Text style={styles.metaTitle}>Retention</Text><Text style={styles.metaText}>{params.retention || 'Not specified by the organization'}</Text></View>{secondsRemaining !== null ? <Text style={styles.expiry}>{expired ? 'EXPIRED' : `EXPIRES ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`}</Text> : null}</Surface>

      {expired ? <Surface style={styles.errorPanel}><Clock3 size={18} color={colors.ink} /><Body>This request expired before you could respond. Nothing was shared, and your Vault details remain private. Ask the organization to start a new request.</Body></Surface> : <>
      <View style={styles.sectionHeading}><View><Eyebrow>ONLY THESE FIELDS</Eyebrow><Text style={styles.sectionTitle}>Requested information</Text></View><AnimatedCounter value={`${sharedKeys.length} selected`} style={styles.selectedCount} /></View>

      {requested.length === 0 ? <Surface style={styles.errorPanel}><CircleAlert size={18} color={colors.ink} /><Body>This request did not include any readable fields. Close it and ask the organization to start again.</Body></Surface> : null}
      {required.some((item) => vault[item.key as FieldKey]?.trim()) ? <FieldGroup title="From your Vault · Required" count={required.filter((item) => vault[item.key as FieldKey]?.trim()).length}>
        {required.filter((item) => vault[item.key as FieldKey]?.trim()).map((item, index) => <View key={item.key}>{index > 0 ? <View style={styles.fieldDivider} /> : null}<RequiredRow item={item} value={vault[item.key as FieldKey]} index={index} /></View>)}
      </FieldGroup> : null}
      {needsRequiredRestore ? <Surface style={styles.missingPanel}><CircleAlert size={18} color={colors.ink} /><View style={styles.missingCopy}><Text style={styles.missingTitle}>This organization marked these fields as required</Text><Text style={styles.missingText}>They cannot be excluded from a valid response. Restore the required fields or decline the request.</Text><Button title="Restore required fields" variant="secondary" onPress={() => setSelected((old) => ({ ...old, ...Object.fromEntries([...excludedRequiredKeys].map((key) => [key, true])) }))} /></View></Surface> : null}
      {optional.some((item) => vault[item.key as FieldKey]?.trim()) ? <FieldGroup title="From your Vault · Optional" count={optional.filter((item) => vault[item.key as FieldKey]?.trim()).length}>
        {optional.filter((item) => vault[item.key as FieldKey]?.trim()).map((item, index) => {
          const key = item.key as FieldKey;
          const definition = FIELD_BY_KEY[key];
          const value = effectiveVault[key];
          const included = isSelected(item) && Boolean(value);
          return <FadeInSection key={item.key} delay={index * 28}>
            <View style={[styles.optionalRow, !included && styles.rowMuted]}>
              {index > 0 ? <View style={styles.fieldDivider} /> : null}
              <AnimatedToggleRow label={definition?.label || item.key} detail={requiredOnly ? 'Not included in notification sharing' : presentValue(key, value!)} value={included} disabled={requiredOnly || responseBusy} onValueChange={(next) => setSelected((old) => ({ ...old, [item.key]: next }))} />
              <Text style={styles.optionalState}>{requiredOnly ? 'OPTIONAL · EXCLUDED' : included ? 'INCLUDED' : 'NOT SHARING'}</Text>
            </View>
          </FadeInSection>;
        })}
      </FieldGroup> : null}

      {missingFromVault.length > 0 ? <View style={styles.missingSection}>
        <View style={styles.sectionHeading}><View><Eyebrow>MISSING INFORMATION</Eyebrow><Text style={styles.sectionTitle}>Complete this request</Text></View><Text style={styles.groupCount}>{missingFromVault.length} {missingFromVault.length === 1 ? 'FIELD' : 'FIELDS'}</Text></View>
        <Body>These details are not in your Vault. Enter them for this request; decide separately if each should also be saved.</Body>
        {missingFromVault.map((item) => {
          const key = item.key as FieldKey;
          const definition = FIELD_BY_KEY[key];
          const included = isSelected(item);
          return <Surface key={key} style={styles.missingField}>
            <View style={styles.missingFieldHead}><Text style={styles.fieldName}>{definition.label}</Text><Text style={styles.requiredTag}>{item.required?'REQUIRED':'OPTIONAL'}</Text></View>
            <Input label={`Enter ${definition.label.toLowerCase()}`} value={entered[key] ?? ''} onChangeText={(value) => setEntered((old) => ({ ...old, [key]: value }))} placeholder={definition.kind==='date'?'YYYY-MM-DD':`Enter ${definition.label.toLowerCase()}`} keyboardType={definition.kind==='email'?'email-address':definition.kind==='phone'?'phone-pad':'default'} autoCapitalize={definition.kind==='email'?'none':'sentences'} />
            {!item.required ? <View style={styles.optionalMissing}><Text style={styles.fieldDetail}>{included?'Selected to share':'Not selected to share'}</Text><Switch accessibilityLabel={`Include ${definition.label} in this share`} value={included} disabled={requiredOnly||responseBusy} onValueChange={(value) => setSelected((old) => ({ ...old,[key]:value }))} trackColor={{ false: colors.line, true: colors.muted }} thumbColor={included?colors.ink:colors.surfaceSecondary}/></View>:null}
            <View style={styles.optionalMissing}><Text style={styles.fieldDetail}>Also save this new value to your Vault</Text><Switch accessibilityLabel={`Also save ${definition.label} to your Vault`} value={Boolean(saveMissing[key])} disabled={responseBusy} onValueChange={(value) => setSaveMissing((old) => ({ ...old,[key]:value }))} trackColor={{ false: colors.line, true: colors.muted }} thumbColor={saveMissing[key]?colors.ink:colors.surfaceSecondary}/></View>
          </Surface>;
        })}
      </View> : null}

      {questions.length > 0 ? <View style={styles.questionSection}>
        <View style={styles.sectionHeading}><View><Eyebrow>QUESTIONS TO ANSWER</Eyebrow><Text style={styles.sectionTitle}>One-time responses</Text></View><Text style={styles.groupCount}>{questions.length} {questions.length === 1 ? 'QUESTION' : 'QUESTIONS'}</Text></View>
        <Body>Answers apply only to this request and are not added to your Vault.</Body>
        {questions.map((question) => <QuestionInput key={question.id} question={question} value={answers[question.id]} invalid={invalidQuestions.includes(question.id)} disabled={responseBusy} onChange={(value) => setAnswers((old) => ({ ...old,[question.id]:value }))}/>) }
      </View> : null}

      {!checked.ok && requiredMissing.length > 0 && !needsRequiredRestore ? <Surface style={styles.missingPanel}><CircleAlert size={18} color={colors.ink} /><View style={styles.missingCopy}><Text style={styles.missingTitle}>{requiredMissing.length} required {requiredMissing.length === 1 ? 'field needs' : 'fields need'} attention</Text><Text style={styles.missingText}>{requiredMissing.map((key) => FIELD_BY_KEY[key].label).join(', ')} must be completed before sharing.</Text></View></Surface> : null}
      <View style={styles.privacy}><ShieldCheck size={17} color={colors.muted} /><Text style={styles.privacyText}>Only selected information will be shared. Turning off a field keeps it private.</Text></View>
      </>}
      {errorMessage ? <Surface accessibilityRole="alert" style={styles.errorPanel}><CircleAlert size={18} color={colors.ink} /><Body>{errorMessage}</Body></Surface> : null}
      <View style={styles.actions}>
        {expired ? <Button title="Close request" onPress={async () => { await clearPendingReview(params.sessionId); router.dismissTo('/(tabs)/activity'); }} /> : <>
          <Button title={shareButtonTitle} loading={responseBusy} disabled={!checked.ok || sharedKeys.length === 0 && !questions.length || requested.length === 0 || invalidQuestions.length>0} onPress={() => void approve()} />
          <Button title="Decline request" variant="danger" loading={responseBusy} onPress={() => void decline()} />
        </>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function FieldGroup({ title, count, children }: React.PropsWithChildren<{ title: string; count: number }>) {
  return <View style={styles.group}><View style={styles.groupHeader}><Text style={styles.groupTitle}>{title}</Text><Text style={styles.groupCount}>{count} {count === 1 ? 'FIELD' : 'FIELDS'}</Text></View><Surface style={styles.fields}>{children}</Surface></View>;
}

function RequiredRow({ item, value, index }: { item: RequestMeta; value?: string; index: number }) {
  const key = item.key as FieldKey;
  const definition = FIELD_BY_KEY[key];
  const missing = !value;
  return <FadeInSection delay={index * 28}>
    <View style={styles.requiredRow}>
      <View style={[styles.checkBox, missing && styles.checkMissing]}>{!missing ? <Check size={14} color={colors.primaryButtonText} strokeWidth={3} /> : null}</View>
      <View style={styles.fieldCopy}><Text style={styles.fieldName}>{definition?.label || item.key}</Text><Text style={[styles.fieldValue, missing && styles.missingValue]}>{missing ? 'Missing from your Vault' : presentValue(key, value)}</Text></View>
      <Text style={styles.requiredTag}>{missing ? 'NEEDED' : 'REQUIRED'}</Text>
    </View>
  </FadeInSection>;
}

function QuestionInput({ question, value, invalid, disabled, onChange }: { question: RequestQuestion; value: QuestionAnswer | undefined; invalid: boolean; disabled: boolean; onChange: (value: QuestionAnswer) => void }) {
  const textValue = typeof value === 'string' ? value : '';
  const options = question.type==='yes_no' ? ['Yes','No'] : question.options;
  const selected = (option: string) => question.type==='yes_no' ? value === (option==='Yes') : question.type==='multiple_choice' ? Array.isArray(value)&&value.includes(option) : value===option;
  const toggle = (option: string) => {
    if (question.type==='yes_no') onChange(option==='Yes');
    else if (question.type==='multiple_choice') {
      const current = Array.isArray(value) ? value : [];
      onChange(current.includes(option) ? current.filter((item)=>item!==option) : [...current,option]);
    } else onChange(option);
  };
  return <Surface style={[styles.question,invalid&&styles.questionInvalid]}>
    <View style={styles.questionHead}><Text style={styles.questionPrompt}>{question.prompt}</Text><Text style={styles.requiredTag}>{question.required?'REQUIRED':'OPTIONAL'}</Text></View>
    {question.type==='short_text'||question.type==='long_text'||question.type==='number'||question.type==='date' ? <Input
      label={question.type==='number'?'Number answer':question.type==='date'?'Date answer':'Your answer'}
      value={textValue}
      onChangeText={(text)=>onChange(text)}
      placeholder={question.type==='date'?'YYYY-MM-DD':question.type==='number'?'Enter a number':'Type your answer'}
      keyboardType={question.type==='number'?'decimal-pad':question.type==='date'?'numbers-and-punctuation':'default'}
      multiline={question.type==='long_text'}
      numberOfLines={question.type==='long_text'?4:1}
      maxLength={question.type==='short_text'||question.type==='long_text'?question.maxLength:undefined}
      style={question.type==='long_text'?styles.longInput:undefined}
      editable={!disabled}
    /> : <View style={styles.answerOptions}>{options.map((option)=>{
      const checked=selected(option);
      return <Pressable key={option} accessibilityRole={question.type==='multiple_choice'?'checkbox':'radio'} accessibilityState={{ checked }} disabled={disabled} onPress={()=>toggle(option)} style={[styles.answerOption,checked&&styles.answerOptionSelected]}><View style={[styles.answerMark,checked&&styles.answerMarkSelected]}>{checked?<Check size={12} color={colors.primaryButtonText} strokeWidth={3}/>:null}</View><Text style={[styles.answerOptionText,checked&&styles.answerOptionTextSelected]}>{option}</Text></Pressable>;
    })}</View>}
    {invalid?<Text accessibilityRole="alert" style={styles.questionError}>{question.required?'Answer this required question or correct the value.':'Check this answer.'}</Text>:null}
    {question.type==='number'&&(question.minValue!==null||question.maxValue!==null)?<Text style={styles.questionHint}>Allowed range {question.minValue??'any'} to {question.maxValue??'any'}.</Text>:null}
  </Surface>;
}

function presentValue(key: FieldKey, value: string) {
  if (['date_of_birth', 'phone', 'emergency_phone', 'emergency_email', 'student_id'].includes(key)) return '••••••••';
  if (key === 'email') { const [name, domain] = value.split('@'); return domain ? `${name?.slice(0, 1) || '•'}••••@${domain}` : '••••••••'; }
  if (key === 'emergency_name') return '••••••••';
  return value;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { gap: 21, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 30 },
  back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, backText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  orgIdentity: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 15, borderBottomWidth: 1, borderColor: colors.lineSubtle }, orgMark: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, orgInitial: { color: colors.ink, fontSize: 18, fontWeight: '500' }, orgCopy: { flex: 1, gap: 4 }, orgName: { color: colors.ink, fontSize: 15, fontWeight: '600' }, orgStatus: { color: colors.muted, fontSize: 11 }, statusMark: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 9 }, pageTitle: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '600', letterSpacing: -0.55 }, requestMeta: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 }, metaIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, metaCopy: { flex: 1, gap: 3 }, metaTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' }, metaText: { color: colors.muted, fontSize: 11 }, expiry: { maxWidth: 70, textAlign: 'right', color: colors.subtle, fontSize: 7, fontWeight: '700', letterSpacing: 0.6 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingTop: 3 }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '600', marginTop: 4 }, selectedCount: { color: colors.muted, fontSize: 12, paddingBottom: 2 }, group: { gap: 9 }, groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, groupTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' }, groupCount: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.9 }, fields: { paddingHorizontal: 13, paddingVertical: 0 }, fieldDivider: { height: 1, backgroundColor: colors.lineSubtle }, requiredRow: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 11 }, checkBox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, checkMissing: { borderColor: colors.muted, backgroundColor: 'transparent' }, fieldCopy: { flex: 1, gap: 4 }, fieldName: { color: colors.ink, fontSize: 13, fontWeight: '500' }, fieldValue: { color: colors.muted, fontSize: 11 }, missingValue: { color: colors.ink }, requiredTag: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 }, optionalRow: { minHeight: 72, justifyContent: 'center' }, rowMuted: { opacity: 0.76 }, optionalState: { alignSelf: 'flex-start', marginLeft: 1, marginTop: -7, marginBottom: 10, color: colors.subtle, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  missingPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderColor: colors.line }, missingCopy: { flex: 1, gap: 8 }, missingTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' }, missingText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, errorPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderColor: colors.line }, privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderColor: colors.lineSubtle, paddingTop: 13 }, privacyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 }, actions: { gap: 8 },
  missingSection: { gap: 11 }, missingField: { gap: 11, padding: 14 }, missingFieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, optionalMissing: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, fieldDetail: { color: colors.muted, fontSize: 11, flex: 1 }, questionSection: { gap: 11 }, question: { gap: 12, padding: 14 }, questionInvalid: { borderColor: colors.muted }, questionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, questionPrompt: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '500', flex: 1 }, answerOptions: { gap: 7 }, answerOption: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }, answerOptionSelected: { borderColor: colors.muted, backgroundColor: colors.surfaceActive }, answerMark: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.muted, borderRadius: 6 }, answerMarkSelected: { backgroundColor: colors.primaryButton, borderColor: colors.primaryButton }, answerOptionText: { color: colors.muted, fontSize: 13, flex: 1 }, answerOptionTextSelected: { color: colors.ink }, longInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, questionError: { color: colors.ink, fontSize: 11, lineHeight: 16 }, questionHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: colors.canvas }, centerText: { textAlign: 'center' }, resultIcon: { width: 58, height: 58, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, resultTitle: { color: colors.ink, fontSize: 27, fontWeight: '600', letterSpacing: -0.4 },
});
