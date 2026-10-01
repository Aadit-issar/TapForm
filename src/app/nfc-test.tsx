import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, Radio, Smartphone } from 'lucide-react-native';
import { Body, Button, Eyebrow, Page, Surface, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { getLatestPendingRequest, nfcCapabilities, onNfcState, openNfcSettings, startReader, stopReader } from '@/services/nfcPeer';
import { JoinPayload } from '@/services/requestTransport';
import { useAppState } from '@/state/AppState';

const DIAGNOSTIC_SESSION = 'f8405878-796f-49dc-86f1-a3e98ce93cab';
const DIAGNOSTIC_ORGANIZATION = 'e04ea1c2-4174-495c-a16f-808e61b07a8a';

export default function NfcTestScreen() {
  const { role, developerToolsUnlocked } = useAppState();
  const [mode, setMode] = useState<'organization' | 'personal'>(role === 'organization' ? 'organization' : 'personal');
  const [status, setStatus] = useState('Idle');
  const [pending, setPending] = useState<Awaited<ReturnType<typeof getLatestPendingRequest>>>(null);
  const [caps, setCaps] = useState(() => nfcCapabilities(role));

  const refreshPending = async () => setPending(await getLatestPendingRequest());
  useEffect(() => {
    if (!__DEV__ || !developerToolsUnlocked) return;
    const stateSub = onNfcState((event) => setStatus(event.state === 'delivered' ? 'Request context delivered' : event.state === 'error' ? `Reader error: ${event.reason || 'unknown'}` : event.state));
    const appSub = AppState.addEventListener('change', (value) => { if (value === 'active') { setCaps(nfcCapabilities(role)); void refreshPending(); } });
    Promise.resolve().then(refreshPending);
    return () => { stateSub(); appSub.remove(); void stopReader(); };
  }, [developerToolsUnlocked, role]);

  const startDiagnostic = async () => {
    const payload: JoinPayload = {
      version: 1,
      requestSessionId: DIAGNOSTIC_SESSION,
      nonce: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
      organizationId: DIAGNOSTIC_ORGANIZATION,
    };
    try {
      setStatus('Waiting for a TapForm HCE phone…');
      await startReader(payload);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Reader could not start.'); }
  };

  if (!__DEV__ || !developerToolsUnlocked) return <Redirect href="/(tabs)/profile" />;

  return <Page><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><ArrowLeft size={20} color={colors.ink} /><Text style={styles.backText}>Back</Text></Pressable>
    <View><Eyebrow>DEVELOPMENT ONLY</Eyebrow><Title>NFC diagnostics</Title><Body>Protocol v2 · Organization Reader · Personal HCE</Body></View>
    <View style={styles.roleRow}>{(['organization', 'personal'] as const).map((item) => <Button key={item} title={item === 'organization' ? 'Organization · Reader' : 'Personal · HCE'} variant={mode === item ? 'primary' : 'secondary'} onPress={() => setMode(item)} />)}</View>
    <Surface style={styles.capabilities}><Eyebrow>THIS DEVICE</Eyebrow><Capability title="Native module" value={caps.nativeModuleAvailable ? 'Available' : 'Unavailable'} /><Capability title="NFC adapter" value={caps.adapterPresent === null ? 'Unknown' : caps.adapterPresent ? caps.enabled ? 'On' : 'Off' : 'Not present'} /><Capability title="Personal HCE" value={caps.hceSupported && caps.hceServiceRegistered ? 'Registered' : 'Unavailable'} /></Surface>
    {mode === 'organization' ? <Surface style={styles.panel}><View style={styles.heading}><View style={styles.icon}><Radio size={20} color={colors.ink} /></View><Text style={styles.panelTitle}>Organization phone</Text></View><Body>This device enters Reader Mode and sends only a test request locator to the nearby personal phone.</Body><Button title="Start diagnostic reader" onPress={() => void startDiagnostic()} /><Button title="NFC settings" variant="quiet" onPress={openNfcSettings} /><Text style={styles.status}>{status}</Text></Surface> : <Surface style={styles.panel}><View style={styles.heading}><View style={styles.icon}><Smartphone size={20} color={colors.ink} /></View><Text style={styles.panelTitle}>Personal phone</Text></View><Body>HCE is registered with Android and can receive a short request context while TapForm is backgrounded.</Body><Button title="Refresh pending context" variant="secondary" onPress={() => void refreshPending()} />{pending ? <View style={styles.received}><Check size={17} color={colors.ink} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.status}>Request context stored</Text><Text style={styles.detail}>Protocol {pending.payload.version} · Expires {new Date(pending.payload.expiresAt).toLocaleTimeString()}</Text></View></View> : <Text style={styles.status}>No pending request context</Text>}</Surface>}
    <Body>Development diagnostic values are fictional. The NFC envelope never contains personal information.</Body>
  </ScrollView></Page>;
}

function Capability({ title, value }: { title: string; value: string }) { return <View style={styles.capability}><Text style={styles.detail}>{title}</Text><Text style={styles.capabilityValue}>{value}</Text></View>; }

const styles = StyleSheet.create({ content: { gap: 18, paddingBottom: 30 }, back: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 }, backText: { color: colors.ink, fontSize: 14 }, roleRow: { gap: 8 }, capabilities: { gap: 12 }, capability: { flexDirection: 'row', justifyContent: 'space-between' }, capabilityValue: { color: colors.ink, fontSize: 12, fontWeight: '600' }, panel: { gap: 13 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, status: { color: colors.ink, fontSize: 12, fontWeight: '600' }, detail: { color: colors.muted, fontSize: 11 }, received: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 } });
