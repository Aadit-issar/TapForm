import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { Body, Button, Eyebrow } from '@/components/ui';
import { NfcWaveVisual } from '@/components/graphics/NfcWaveVisual';
import { colors, space } from '@/constants/theme';
import { AndroidNfcTransport } from '@/services/androidNfcTransport';
import { failPendingNotification, finishPendingNotification, getNotificationSelection, markPendingNotification, updatePendingNotification } from '@/services/nfcPeer';
import { requestFound, error } from '@/services/haptics';
import { clearPendingReview, getPendingReview } from '@/services/pendingReview';
import { parseIncomingAction, notificationSharePlan, notificationSummary } from '@/services/notificationActions';
import { submitConsent } from '@/services/requests';
import { supabase } from '@/services/supabase';
import { FIELD_REGISTRY, type FieldKey } from '@/domain/fields';
import { useAppState } from '@/state/AppState';
import { clearPostAuthReturnTo, rememberPostAuthReturnTo } from '@/services/postAuthReturn';

type ViewState = 'loading' | 'signed_out' | 'error';
const transport = new AndroidNfcTransport();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function IncomingRequestScreen() {
  const params = useLocalSearchParams<{ pendingId?: string; notificationAction?: string }>();
  const pendingId = Array.isArray(params.pendingId) ? params.pendingId[0] : params.pendingId;
  const actionValue = Array.isArray(params.notificationAction) ? params.notificationAction[0] : params.notificationAction;
  const notificationAction = parseIncomingAction(actionValue);
  const { hasSession, authReady, updateField } = useAppState();
  const [state, setState] = useState<ViewState>('loading');
  const [message, setMessage] = useState('Checking the request…');
  const startedKey = useRef('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    if (!pendingId || !UUID_PATTERN.test(pendingId)) {
      Promise.resolve().then(() => { setState('error'); setMessage('This request link is incomplete. Ask the organization to start again.'); });
      return;
    }
    if (!hasSession) { Promise.resolve().then(() => setState('signed_out')); return; }
    void clearPostAuthReturnTo();
    const runKey = `${pendingId}:${notificationAction}:${attempt}`;
    if (startedKey.current === runKey) return;
    startedKey.current = runKey;
    setState('loading');
    void (async () => {
      let resolvedSessionId: string | undefined;
      const terminal = async (result: 'expired' | 'unavailable' | 'processed', text: string) => {
        if (resolvedSessionId) await clearPendingReview(resolvedSessionId);
        await finishPendingNotification(pendingId, result, 0);
        setState('error');
        setMessage(text);
      };
      try {
        if (notificationAction === 'decline' || notificationAction === 'retry_decline') {
          await markPendingNotification(pendingId, 'decline');
          setMessage('Declining request…');
        } else if (notificationAction === 'share_required' || notificationAction === 'share_selection') {
          await markPendingNotification(pendingId, 'share');
          setMessage('Opening secure review…');
        }

        const payload = await transport.discoverSession(pendingId);
        if (startedKey.current !== runKey) return;
        resolvedSessionId = payload.requestSessionId;
        const cached = await getPendingReview(payload.requestSessionId);
        const request = cached?.request ?? await transport.joinSession(payload, pendingId);
        if (startedKey.current !== runKey) return;

        if (!supabase) throw new Error('Connect to TapForm to review this request.');
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('Sign in again to review this request.');
        const { data: vaultRows, error: vaultError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', auth.user.id);
        if (vaultError) throw new Error('Your Vault could not be checked. Check your connection and retry.');
        const vault: Partial<Record<FieldKey, string>> = {};
        for (const row of vaultRows ?? []) {
          if (FIELD_REGISTRY.some((field) => field.key === row.field_key) && typeof row.value === 'string') {
            vault[row.field_key as FieldKey] = row.value;
            updateField(row.field_key as FieldKey, row.value);
          }
        }

        await updatePendingNotification(pendingId, notificationSummary(request, vault));

        if (notificationAction === 'decline' || notificationAction === 'retry_decline') {
          if (startedKey.current !== runKey) return;
          try {
            await submitConsent(request.sessionId, false);
            await clearPendingReview(request.sessionId);
            await finishPendingNotification(pendingId, 'declined', 0);
            router.replace({ pathname: '/done', params: { status: 'declined', orgName: request.organizationName, purpose: request.purpose, timestamp: new Date().toISOString() } });
            return;
          } catch (cause) {
            const text = cause instanceof Error ? cause.message : '';
            if (/expired/i.test(text)) { await clearPendingReview(request.sessionId); await terminal('expired', 'This request expired before you could respond.'); return; }
            if (/already been answered/i.test(text)) { await clearPendingReview(request.sessionId); await terminal('processed', 'This request has already been answered.'); return; }
            throw cause;
          }
        }

        const requiredCount = request.fields.filter((field) => field.required).length;
        const missingCount = request.fields.filter((field) => field.required && !vault[field.key as FieldKey]?.trim()).length;
        const fromShareAction = notificationAction === 'share_required' || notificationAction === 'share_selection';
        const requiredOnly = notificationAction === 'share_required' && requiredCount > 0 && missingCount === 0 && request.questions.length === 0;
        const notificationSelection = fromShareAction ? await getNotificationSelection(pendingId) : null;
        if (startedKey.current !== runKey) return;

        const requiredKeys = request.fields.filter((field) => field.required).map((field) => field.key as FieldKey);
        const notificationSelectedKeys = notificationSelection?.selectedKeys ?? requiredKeys;
        const sharePlan = notificationSharePlan(request.fields, notificationSelectedKeys, vault);

        // A notification Share is explicit consent for the exact selection
        // made in the expanded notification. Required and Vault validation
        // are checked again here and authoritatively by the server RPC.
        if (notificationAction === 'share_selection' && notificationSelection && sharePlan.kind === 'share' && missingCount === 0 && request.questions.length === 0) {
            const approvedKeys = sharePlan.keys;
            const result = await submitConsent(request.sessionId, true, approvedKeys);
            if (result.status !== 'approved') throw new Error('TapForm could not confirm this share. Check Activity before trying again.');
            const receivedKeys = Object.keys(result.shared).sort();
            const expectedKeys = approvedKeys.slice().sort();
            if (receivedKeys.length !== expectedKeys.length || receivedKeys.some((key, index) => key !== expectedKeys[index])) {
              throw new Error('TapForm could not verify the shared fields. Check Activity before continuing.');
            }
            await clearPendingReview(request.sessionId);
            await finishPendingNotification(pendingId, 'approved', receivedKeys.length);
            requestFound();
            router.replace({ pathname: '/done', params: {
              status: 'approved', orgName: request.organizationName, purpose: request.purpose,
              responseId: result.responseId, answerCount: String(result.answerCount ?? 0), sharedFieldCount: String(result.sharedFieldCount ?? receivedKeys.length), timestamp: new Date().toISOString(),
            } });
            return;
        }

        router.replace({ pathname: '/review', params: {
          sessionId: request.sessionId, orgName: request.organizationName,
          purpose: request.purpose, templateName: request.templateName,
          retention: request.retentionDescription, fields: JSON.stringify(request.fields),
          questions: JSON.stringify(request.questions), expiresAt: request.expiresAt, verification: request.organizationStatus,
          pendingId,
          ...(requiredOnly ? { requiredOnly: '1' } : {}),
          ...(notificationAction === 'share_selection' ? {
            notificationSelected: JSON.stringify(notificationSelectedKeys),
            notificationExcludedRequired: JSON.stringify(notificationSelection?.excludedRequiredKeys ?? requiredKeys.filter((key) => !notificationSelectedKeys.includes(key))),
          } : {}),
        } });
        if (requiredOnly) requestFound();
      } catch (cause) {
        if (startedKey.current !== runKey) return;
        const friendly = cause instanceof Error ? cause.message : 'This request could not be opened.';
        if (/expired/i.test(friendly)) { await terminal('expired', 'This request expired before you could respond.'); return; }
        if (/already been used|already answered|already been answered/i.test(friendly)) { await terminal('processed', 'This request has already been answered.'); return; }
        if (/no longer available|not available/i.test(friendly)) { await terminal('unavailable', 'This request is no longer available.'); return; }
        await failPendingNotification(pendingId, notificationAction);
        setState('error'); setMessage(friendly); error();
      }
    })();
  }, [attempt, authReady, hasSession, notificationAction, pendingId, updateField]);

  const signIn = () => {
    if (!pendingId) return;
    const returnTo = `/incoming?pendingId=${encodeURIComponent(pendingId)}&notificationAction=${encodeURIComponent(notificationAction)}`;
    void rememberPostAuthReturnTo(returnTo).finally(() => {
      router.replace({ pathname: '/sign-in' as never, params: { returnTo } });
    });
  };

  return <View style={styles.screen}>
    {state === 'loading' ? <View style={styles.center}><NfcWaveVisual state="found" size={176} label="TapForm request received" /><Eyebrow>REQUEST RECEIVED</Eyebrow><Text style={styles.title}>{notificationAction === 'decline' || notificationAction === 'retry_decline' ? 'Responding securely' : 'Opening request'}</Text><Body style={styles.centerText}>{message}</Body></View> : null}
    {state === 'signed_out' ? <View style={styles.center}><View style={styles.icon}><LockKeyhole size={22} color={colors.ink} /></View><Eyebrow>REQUEST RECEIVED</Eyebrow><Text style={styles.title}>Sign in to continue</Text><Body style={styles.centerText}>Unlock TapForm to review this request. Your choice will be applied after you sign in.</Body><Button title="Sign in to continue" onPress={signIn} /><Button title="Not now" variant="quiet" onPress={() => router.dismissTo('/')} /></View> : null}
    {state === 'error' ? <View style={styles.center}><View style={styles.icon}><ShieldCheck size={22} color={colors.ink} /></View><Eyebrow>REQUEST NOT AVAILABLE</Eyebrow><Text style={styles.title}>Couldn’t complete request</Text><Body style={styles.centerText}>{message}</Body>{hasSession ? <Button title="Try again" onPress={() => { setState('loading'); setMessage('Checking the request…'); setAttempt((value) => value + 1); }} /> : <Button title="Sign in" onPress={signIn} />}<Button title="Go to Home" variant="quiet" onPress={() => router.dismissTo((hasSession ? '/(tabs)' : '/') as never)} /></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.canvas, padding: space.lg },
  center: { alignItems: 'center', gap: 12 }, centerText: { textAlign: 'center', marginBottom: 8 },
  icon: { width: 54, height: 54, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '600', letterSpacing: -0.4, textAlign: 'center' },
});
