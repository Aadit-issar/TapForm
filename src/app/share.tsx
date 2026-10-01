import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CircleAlert, Clock3, ShieldCheck } from 'lucide-react-native';
import { Body, Button, Eyebrow, Surface } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_BY_KEY } from '@/domain/fields';
import { answerPeerExchange, joinCardShare } from '@/services/tapCards';
import { clearPendingPeer, getPendingPeer, savePendingPeer, type PendingPeer } from '@/services/pendingPeer';
import { clearPostAuthReturnTo, rememberPostAuthReturnTo } from '@/services/postAuthReturn';
import { parseTapFormToken } from '@/services/tapLinks';
import { useAppState } from '@/state/AppState';
import { error, success, warning } from '@/services/haptics';
import { canRetryPeerShare } from '@/domain/linkRetry';

function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (digit) => {
    const random = Math.floor(Math.random() * 16);
    return (digit === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export default function PeerShareScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = parseTapFormToken(params.token) ?? '';
  const { authReady, hasSession, userId } = useAppState();
  const [pending, setPending] = useState<PendingPeer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Checking this Tap Card…');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(0);
  const started = useRef('');

  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  useEffect(() => {
    if (!authReady) return;
    if (!token) { void Promise.resolve().then(() => setErrorMessage('This Tap Card link is invalid.')); return; }
    if (!hasSession) {
      const returnTo = `/share?token=${token}`;
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
    void (async () => {
      try {
        setErrorMessage('');
        const cached = await getPendingPeer(token);
        if (cached) { setPending(cached); setMessage('Review before receiving'); return; }
        setMessage('Checking this Tap Card…');
        const idempotencyKey = newIdempotencyKey();
        const request = await joinCardShare(token, idempotencyKey);
        if (!userId) throw new Error('Sign in again to review this Tap Card.');
        const next = { ownerUserId: userId, token, idempotencyKey, request };
        await savePendingPeer(token, idempotencyKey, request);
        setNow(Date.now()); setPending(next); setMessage('Review before receiving');
      } catch (cause) {
        setErrorMessage(cause instanceof Error ? cause.message : 'This Tap Card could not be opened.');
      }
    })();
  }, [attempt, authReady, hasSession, token, userId]);

  const secondsLeft = useMemo(() => pending ? Math.max(0, Math.ceil((Date.parse(pending.request.expiresAt)-now)/1000)) : 0, [now,pending]);
  const respond = async (accept: boolean) => {
    if (!pending || busy || secondsLeft === 0) return;
    setBusy(true); setErrorMessage('');
    try {
      const result = await answerPeerExchange(pending.request.exchangeId, pending.request.nonce, accept);
      await clearPendingPeer(token);
      if (!accept) { warning(); router.dismissTo('/(tabs)/activity'); return; }
      success();
      router.replace({ pathname: '/peer-done' as never, params: { transferId: result.transferId, sender: pending.request.senderName, cardName: pending.request.cardName, fieldCount: String(result.fieldCount ?? pending.request.fields.length) } });
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Your choice could not be sent.'); error();
    } finally { setBusy(false); }
  };

  return <View style={styles.screen}>
    {pending ? <>
      <View style={styles.icon}><ShieldCheck size={22} color={colors.ink} /></View><Eyebrow>PERSONAL TAP CARD</Eyebrow><Text style={styles.title}>{pending.request.senderName || 'TapForm member'}</Text>
      <Body style={styles.center}>wants to share a card with you. Review its contents before accepting.</Body>
      <Surface style={styles.summary}>
        <Text style={styles.cardName}>{pending.request.cardName}</Text><Text style={styles.meta}>{pending.request.fields.length} {pending.request.fields.length === 1 ? 'field' : 'fields'}</Text>
        {pending.request.fields.map(({ key, displayOrder }, index) => <View key={`${key}-${displayOrder}`} style={[styles.row,index>0&&styles.rule]}><Text style={styles.field}>{FIELD_BY_KEY[key as keyof typeof FIELD_BY_KEY]?.label ?? 'Shared detail'}</Text><Text style={styles.privacy}>SHARED ON APPROVAL</Text></View>)}
      </Surface>
      <View style={styles.expiry}><Clock3 size={15} color={colors.muted} /><Text style={styles.meta}>{secondsLeft > 0 ? `This exchange expires in ${Math.floor(secondsLeft/60)}:${String(secondsLeft%60).padStart(2,'0')}` : 'This exchange has expired.'}</Text></View>
      {errorMessage ? <Body style={styles.error}>{errorMessage}</Body> : null}
      {secondsLeft > 0 ? <><Button title="Accept and receive" loading={busy} disabled={busy} onPress={() => void respond(true)} /><Button title="Decline" variant="secondary" loading={busy} onPress={() => void respond(false)} /></> : <Button title="Close" onPress={() => router.dismissTo('/(tabs)/activity')} />}
      <Body style={styles.note}>Only the fields listed above are transferred. Scanning the code did not share anything.</Body>
    </> : errorMessage ? <>
      <View style={styles.icon}><CircleAlert size={22} color={colors.ink} /></View><Eyebrow>TAP CARD UNAVAILABLE</Eyebrow><Text style={styles.title}>This Tap Card is unavailable</Text><Body style={styles.center}>{errorMessage}</Body>
      {hasSession && canRetryPeerShare(token, errorMessage) ? <Button title="Try again" onPress={() => { started.current=''; setAttempt((value)=>value+1); }} /> : null}<Button title="Go to Home" variant="quiet" onPress={() => router.dismissTo((hasSession ? '/(tabs)' : '/sign-in') as never)} />
    </> : <><ActivityIndicator color={colors.ink} /><Text style={styles.title}>{message}</Text><Body style={styles.center}>{message}</Body></>}
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, justifyContent: 'center', padding: space.lg, gap: 13, backgroundColor: colors.canvas }, center: { textAlign: 'center' }, icon: { alignSelf: 'center', width: 54, height: 54, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '600', textAlign: 'center' }, summary: { padding: 15, gap: 10 }, cardName: { color: colors.ink, fontSize: 17, fontWeight: '600' }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 }, row: { minHeight: 40, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, field: { color: colors.ink, fontSize: 13, flex: 1 }, privacy: { color: colors.muted, fontSize: 8, letterSpacing: 0.4 }, rule: { borderTopWidth: 1, borderColor: colors.lineSubtle }, expiry: { flexDirection: 'row', justifyContent: 'center', gap: 7, alignItems: 'center' }, error: { textAlign: 'center', color: colors.ink, borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: 12 }, note: { textAlign: 'center', fontSize: 11 }, });
