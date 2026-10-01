import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { ArrowLeft, Check, Clock3, QrCode, ShieldCheck, X } from 'lucide-react-native';
import { Body, Button, Eyebrow, Surface } from '@/components/ui';
import { NfcWaveVisual } from '@/components/graphics/NfcWaveVisual';
import { colors, radius, space } from '@/constants/theme';
import { FIELD_REGISTRY } from '@/domain/fields';
import { AndroidNfcTransport } from '@/services/androidNfcTransport';
import { nfcCapabilities, onNfcState, openNfcSettings } from '@/services/nfcPeer';
import { QrTransport } from '@/services/qrTransport';
import { error, success } from '@/services/haptics';
import { supabase } from '@/services/supabase';
import type { JoinPayload } from '@/services/requestTransport';

type Session = { payload: JoinPayload; organizationName: string; purpose: string; templateName: string; retentionDescription: string };
type SharedValue = { field_key: string; value_snapshot: string };
type ScreenState = 'idle' | 'starting' | 'ready' | 'detecting' | 'waiting' | 'received' | 'declined' | 'expired' | 'error';

export default function RequestScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const transport = useMemo(() => new AndroidNfcTransport(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<ScreenState>('idle');
  const [seconds, setSeconds] = useState(120);
  const [qrVisible, setQrVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [shared, setShared] = useState<SharedValue[]>([]);
  const [caps, setCaps] = useState(() => nfcCapabilities('organization'));

  const begin = useCallback(async () => {
    if (!templateId) { setState('error'); setMessage('Choose a request template before starting.'); return; }
    setState('starting'); setMessage('');
    try {
      const created = await transport.beginSession(templateId);
      const { data, error: metadataError } = await supabase!.from('request_templates').select('organization_id,organizations(name)').eq('id', templateId).maybeSingle();
      if (metadataError || !data) throw new Error('The organization request could not be loaded.');
      const org = data as unknown as { organization_id: string; organizations: { name: string } };
      const { data: template } = await supabase!.from('request_templates').select('purpose,name,retention_description').eq('id', templateId).single();
      const value: Session = { payload: created, organizationName: org.organizations?.name || 'Organization', purpose: template?.purpose || '', templateName: template?.name || 'Information request', retentionDescription: template?.retention_description || 'As described by the organization' };
      setSession(value); setSeconds(Math.max(0, Math.ceil((Date.parse(value.payload.expiresAt) - Date.now()) / 1000)));
      const capabilities = nfcCapabilities('organization'); setCaps(capabilities);
      if (capabilities.nativeModuleAvailable && capabilities.adapterPresent && capabilities.enabled) {
        await transport.advertiseSession(value.payload);
        setState('ready');
      } else {
        setState('ready'); setQrVisible(true);
      }
    } catch (cause) {
      setState('error'); setMessage(cause instanceof Error ? cause.message : 'The request could not be started. Try again.'); error();
    }
  }, [templateId, transport]);

  useEffect(() => {
    const stateListener = onNfcState((event) => {
      if (event.state === 'detecting') setState('detecting');
      else if (event.state === 'delivered') { setState('waiting'); setMessage('Request delivered. Waiting for the person to review it.'); }
      else if (event.state === 'error') {
        setState('error'); error();
        setMessage(event.reason === 'application_not_found' ? 'TapForm was not available on the other phone. Keep both phones unlocked and try again.' : 'Couldn’t connect. Reposition the phones and try again.');
      }
    });
    const appState = AppState.addEventListener('change', (value) => { if (value === 'active') setCaps(nfcCapabilities('organization')); });
    return () => { stateListener(); appState.remove(); void transport.cancelSession(); };
  }, [transport]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((Date.parse(session.payload.expiresAt) - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) { setState('expired'); setMessage('This request expired. Start a new one to continue.'); void transport.cancelSession(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [session, transport]);

  useEffect(() => {
    if (!session || !supabase) return;
    const client = supabase;
    const channel = client.channel(`request-${session.payload.requestSessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'request_responses', filter: `session_id=eq.${session.payload.requestSessionId}` }, async (event) => {
        const responseId = String(event.new.id);
        const responseStatus = String(event.new.status);
        if (responseStatus === 'declined') { setState('declined'); setMessage('The person chose not to share information.'); await transport.cancelSession(); return; }
        if (responseStatus !== 'approved') return;
        const { data, error: valuesError } = await client.from('shared_values').select('field_key,value_snapshot').eq('response_id', responseId).order('created_at');
        if (valuesError || !data) {
          setState('error');
          setMessage('The share was approved, but its details could not be loaded. Check your connection and review Submissions.');
          await transport.cancelSession();
          return;
        }
        setShared(data as SharedValue[]); setState('received'); success(); await transport.cancelSession();
      });
    void channel.subscribe();
    return () => { void client.removeChannel(channel); };
  }, [session, transport]);

  const retryReader = async () => {
    if (!session) return;
    try { setState('ready'); await transport.advertiseSession(session.payload); }
    catch { setState('error'); setMessage('NFC could not start. Use the QR code or check NFC settings.'); error(); }
  };
  const showQr = async () => { await transport.cancelSession(); setQrVisible(true); if (state === 'error') setState('ready'); };
  const qrValue = session ? QrTransport.encode(session.payload) : '';

  return <SafeAreaView style={styles.screen} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.top}><Button title="Back" variant="quiet" accessibilityLabel="Go back" onPress={() => router.back()}><ArrowLeft size={20} color={colors.ink} /></Button><Eyebrow>REQUEST SESSION</Eyebrow><View style={{ width: 44 }} /></View>
      {state === 'idle' ? <>
        <View style={styles.heading}><Eyebrow>READY TO RECEIVE</Eyebrow><Text style={styles.title}>Start a request</Text><Body>Tap the person’s phone. They’ll review every field before sharing.</Body></View>
        <NfcWaveVisual state="ready" size={220} label="TapForm request ready" />
        <Button title="Start request" onPress={() => void begin()} />
      </> : null}
      {state === 'starting' ? <View style={styles.center}><NfcWaveVisual state="searching" size={208} /><Text style={styles.title}>Preparing request</Text><Body style={styles.centerText}>Creating a short-lived secure session.</Body></View> : null}
      {session && state !== 'received' && state !== 'declined' ? <>
        <View style={styles.heading}><Eyebrow>{session.organizationName.toUpperCase()}</Eyebrow><Text style={styles.title}>{session.templateName}</Text><Body>{session.purpose}</Body></View>
        <Surface style={styles.summary}>
          <View style={styles.summaryRow}><View style={{ flex: 1 }}><Eyebrow>REQUEST EXPIRES</Eyebrow><Text style={styles.timer}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text></View><Clock3 size={20} color={colors.muted} /></View>
          <View style={styles.rule} />
          <View style={styles.metaLine}><Text style={styles.metaLabel}>Retention</Text><Text style={styles.metaValue}>{session.retentionDescription}</Text></View>
          <Text style={styles.metaFoot}>Only the request reference travels over NFC or QR. Vault information stays on the personal phone until approval.</Text>
        </Surface>
        {(state === 'ready' || state === 'detecting') && !qrVisible ? <View style={styles.connection}>
          <NfcWaveVisual state={state === 'detecting' ? 'searching' : 'ready'} size={216} label={state === 'detecting' ? 'Connecting to a nearby TapForm phone' : 'TapForm ready to receive a phone tap'} />
          <Text style={styles.stateTitle}>{state === 'detecting' ? 'Connecting…' : 'Tap phone'}</Text>
          <Body style={styles.centerText}>{state === 'detecting' ? 'Hold both phones together.' : 'Bring the other phone near this device.'}</Body>
          {!caps.nativeModuleAvailable || !caps.adapterPresent || !caps.enabled ? <Button title={caps.adapterPresent === false ? 'NFC unavailable · Show QR' : caps.enabled ? 'NFC module unavailable · Show QR' : 'NFC off · Show QR'} variant="secondary" onPress={() => void showQr()} /> : null}
        </View> : null}
        {state === 'waiting' ? <View style={styles.connection}><NfcWaveVisual state="connected" size={178} /><View style={styles.statusIcon}><Clock3 size={18} color={colors.ink} /></View><Text style={styles.stateTitle}>Waiting for approval</Text><Body style={styles.centerText}>The person has the request. No information is shared until they approve.</Body></View> : null}
        {state === 'error' || state === 'expired' ? <Surface style={styles.message}><X size={20} color={colors.ink} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.stateTitle}>{state === 'expired' ? 'Request expired' : 'Couldn’t connect'}</Text><Body>{message}</Body></View></Surface> : null}
        {qrVisible ? <Surface style={styles.qrSurface}><QRCode value={qrValue} size={224} quietZone={12} color="#111212" backgroundColor="#F2F2F0" ecl="Q" /><Text style={styles.qrTitle}>Scan to review</Text><Text style={styles.qrDetail}>This code contains a short-lived request reference only.</Text><View style={styles.timerRow}><Clock3 size={14} color={colors.muted} /><Text style={styles.metaValue}>Expires in {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text></View></Surface> : null}
        <View style={styles.actions}>
          {state === 'error' && message.startsWith('The share was approved') ? <Button title="Open submissions" onPress={() => router.dismissTo('/(tabs)/submissions')} /> : null}
          {state === 'error' && !message.startsWith('The share was approved') || state === 'expired' ? <Button title="Start a new request" onPress={() => { setSession(null); setQrVisible(false); setState('idle'); void transport.cancelSession(); }} /> : null}
          {state !== 'waiting' && !qrVisible && seconds > 0 ? <Button title="Show QR code instead" variant="secondary" onPress={() => void showQr()}><QrCode size={18} color={colors.ink} /></Button> : null}
          {qrVisible && seconds > 0 ? <Button title="Use NFC" variant="secondary" onPress={() => { setQrVisible(false); void retryReader(); }} /> : null}
          {!qrVisible && (state === 'error' || state === 'ready') && caps.adapterPresent === true && !caps.enabled ? <Button title="NFC settings" variant="quiet" onPress={() => { openNfcSettings(); }} /> : null}
          <Button title="Close" variant="quiet" onPress={() => router.back()} />
        </View>
      </> : null}
      {session && (state === 'received' || state === 'declined') ? <View style={styles.result}>
        <View style={styles.resultMark}>{state === 'received' ? <Check size={26} color={colors.ink} strokeWidth={2.4} /> : <X size={24} color={colors.ink} />}</View>
        <Eyebrow>{state === 'received' ? 'APPROVED SHARE' : 'REQUEST DECLINED'}</Eyebrow>
        <Text style={styles.title}>{state === 'received' ? 'Information received' : 'No information shared'}</Text>
        <Body>{state === 'received' ? `${shared.length} fields shared by the person.` : message}</Body>
        {state === 'received' ? <Surface style={styles.values}>{shared.map((item) => <View key={item.field_key} style={styles.valueRow}><Text style={styles.valueLabel}>{FIELD_REGISTRY.find((field) => field.key === item.field_key)?.label || item.field_key}</Text><Text selectable style={styles.value}>{item.value_snapshot}</Text></View>)}</Surface> : null}
        <Button title="Done" onPress={() => router.dismissTo('/(tabs)/submissions')} />
      </View> : null}
      <View style={styles.privacy}><ShieldCheck size={16} color={colors.muted} /><Text style={styles.privacyText}>A phone tap starts a request. Only the person can approve a share.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { flexGrow: 1, padding: space.lg, paddingBottom: 28, gap: 22 },
  top: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heading: { gap: 9 }, title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '600', letterSpacing: -0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, centerText: { textAlign: 'center' }, summary: { gap: 15, padding: 17 }, summaryRow: { flexDirection: 'row', alignItems: 'center' }, timer: { color: colors.ink, fontSize: 25, fontVariant: ['tabular-nums'], fontWeight: '500', marginTop: 3 }, rule: { height: 1, backgroundColor: colors.line }, metaLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, metaLabel: { color: colors.muted, fontSize: 13 }, metaValue: { color: colors.ink, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' }, metaFoot: { color: colors.subtle, fontSize: 12, lineHeight: 18 },
  connection: { alignItems: 'center', gap: 8, paddingVertical: 5 }, stateTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600' }, statusIcon: { height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.line, marginTop: -12 },
  qrSurface: { alignItems: 'center', gap: 11, padding: 18 }, qrTitle: { color: colors.ink, fontSize: 17, fontWeight: '600' }, qrDetail: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }, timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }, actions: { gap: 8 }, message: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  result: { flex: 1, justifyContent: 'center', gap: 13 }, resultMark: { width: 58, height: 58, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, values: { gap: 13, marginTop: 3 }, valueRow: { gap: 4, borderTopWidth: 1, borderColor: colors.lineSubtle, paddingTop: 10 }, valueLabel: { color: colors.muted, fontSize: 11 }, value: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: colors.lineSubtle, paddingTop: 14 }, privacyText: { flex: 1, color: colors.subtle, fontSize: 11, lineHeight: 16 },
});
