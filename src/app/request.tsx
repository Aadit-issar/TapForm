import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CircleAlert, LockKeyhole } from 'lucide-react-native';
import { Body, Button, Eyebrow } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { parseTapFormLink, parseTapFormToken } from '@/services/tapLinks';
import { joinSession, resolveRequestLink } from '@/services/requests';
import { savePendingReview } from '@/services/pendingReview';
import { clearPostAuthReturnTo, rememberPostAuthReturnTo } from '@/services/postAuthReturn';
import { useAppState } from '@/state/AppState';
import { canRetryRequestLink } from '@/domain/linkRetry';

export default function RequestLinkScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = parseTapFormToken(params.token) ?? '';
  const { authReady, hasSession } = useAppState();
  const [message, setMessage] = useState('Verifying this request…');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const started = useRef('');

  useEffect(() => {
    if (!authReady) return;
    if (!token) { void Promise.resolve().then(() => { setMessage('Request unavailable'); setErrorMessage('This TapForm request link is incomplete or invalid.'); }); return; }
    if (!hasSession) {
      const returnTo = `/request?token=${token}`;
      let active = true;
      void rememberPostAuthReturnTo(returnTo).finally(() => {
        if (active) router.replace({ pathname: '/sign-in' as never, params: { returnTo } });
      });
      return () => { active = false; };
    }
    void clearPostAuthReturnTo();
    const key = `${token}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    setErrorMessage('');
    void (async () => {
      try {
        setMessage('Opening the organization request…');
        const payload = await resolveRequestLink(token);
        setMessage('Loading the request for your review…');
        const request = await joinSession(payload);
        await savePendingReview(request);
        router.replace({ pathname: '/review', params: {
          sessionId: request.sessionId, orgName: request.organizationName, purpose: request.purpose,
          templateName: request.templateName, retention: request.retentionDescription,
          fields: JSON.stringify(request.fields), questions: JSON.stringify(request.questions),
          expiresAt: request.expiresAt, verification: request.organizationStatus,
        } });
      } catch (cause) {
        const safe = cause instanceof Error ? cause.message : 'This request could not be opened.';
        setErrorMessage(safe); setMessage('Request unavailable');
      }
    })();
  }, [attempt, authReady, hasSession, token]);

  const tapLink = parseTapFormLink(`tapform:///request?token=${token}`);
  return <View style={styles.screen}>
    {errorMessage ? <>
      <View style={styles.icon}><CircleAlert size={22} color={colors.ink} /></View><Eyebrow>REQUEST LINK</Eyebrow><Text style={styles.title}>{message}</Text><Body style={styles.center}>{errorMessage}</Body>
      {hasSession && canRetryRequestLink(token, errorMessage) ? <Button title="Try again" onPress={() => { started.current=''; setAttempt((value) => value+1); }} /> : null}
      <Button title="Go to TapForm" variant="quiet" onPress={() => router.dismissTo((hasSession ? '/(tabs)' : '/sign-in') as never)} />
    </> : <>
      <View style={styles.icon}><LockKeyhole size={22} color={colors.ink} /></View><Eyebrow>{tapLink ? 'SECURE REQUEST' : 'TAPFORM'}</Eyebrow><Text style={styles.title}>{message}</Text><ActivityIndicator color={colors.ink} />
    </>}
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: space.xl, backgroundColor: colors.canvas }, icon: { width: 54, height: 54, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '600', textAlign: 'center' }, center: { textAlign: 'center' } });
