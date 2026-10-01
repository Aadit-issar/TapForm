import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { AnimatedCounter, AnimatedProgress, AnimatedToggleRow, FadeInSection, LoadingSkeleton, RequestTransition, SuccessMark } from '@/components/motion/MotionPrimitives';
import { EmptyVisual } from '@/components/graphics/EmptyVisual';
import { NfcWaveVisual, type NfcVisualState } from '@/components/graphics/NfcWaveVisual';
import { QrScanCorners } from '@/components/graphics/QrScanCorners';
import { TapFormMark } from '@/components/graphics/TapFormMark';
import { showDevelopmentRequestNotification } from '@/services/nfcPeer';
import { useAppState } from '@/state/AppState';

const background = '#090A0A';
const surface = '#151717';
const border = '#343737';
const primary = '#F2F2F0';
const secondary = '#B8BAB8';
const states: NfcVisualState[] = ['ready', 'searching', 'found', 'connected', 'error'];

export default function MotionGalleryScreen() {
  const { developerToolsUnlocked } = useAppState();
  const [nfcState, setNfcState] = useState<NfcVisualState>('ready');
  const [optional, setOptional] = useState(true);
  const [shared, setShared] = useState(false);
  const [progress, setProgress] = useState(0.62);
  const [requestState, setRequestState] = useState<'idle' | 'found' | 'consent' | 'error'>('idle');
  const [hapticResults, setHapticResults] = useState<Record<string, string>>({});
  const [notificationPreviewStatus, setNotificationPreviewStatus] = useState('not shown');

  const showNotificationPreview = async () => {
    setNotificationPreviewStatus('creating…');
    try {
      const shown = await showDevelopmentRequestNotification();
      setNotificationPreviewStatus(shown ? 'posted · backend response is not simulated' : 'unavailable');
    } catch (cause) {
      setNotificationPreviewStatus(cause instanceof Error ? cause.message : 'could not post preview');
    }
  };

  const testHaptic = async (id: string, method: string, call: () => Promise<void>) => {
    setHapticResults((current) => ({ ...current, [id]: 'calling…' }));
    console.info(`[TapForm haptics test] ${method}: calling`);
    try {
      await call();
      setHapticResults((current) => ({ ...current, [id]: 'resolved · trigger requested' }));
      console.info(`[TapForm haptics test] ${method}: resolved · trigger requested`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHapticResults((current) => ({ ...current, [id]: `rejected · ${message}` }));
      console.error(`[TapForm haptics test] ${method}: rejected`, error);
    }
  };

  if (!__DEV__ || !developerToolsUnlocked) return <Redirect href="/(tabs)/profile" />;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}><ArrowLeft color={primary} size={19} /><Text style={styles.body}>Back</Text></Pressable>
    <View style={styles.heading}><Text style={styles.eyebrow}>DEVELOPMENT ONLY · LOCAL FIXTURES</Text><Text style={styles.title}>Motion & graphics</Text><Text style={styles.body}>No request is joined, no information is sent, and no production screen is changed here.</Text></View>

    <Section title="Mark">
      <View style={styles.row}><View style={styles.markTile}><TapFormMark size={34} /></View><View style={styles.grow}><Text style={styles.itemTitle}>TapForm vector mark</Text><Text style={styles.meta}>T form + contact point · monochrome</Text></View></View>
    </Section>

    <Section title="NFC states">
      <View style={styles.stateRow}>{states.map((state) => <Pressable key={state} onPress={() => setNfcState(state)} accessibilityRole="button" accessibilityState={{ selected: state === nfcState }} style={[styles.chip, state === nfcState && styles.chipSelected]}><Text style={[styles.chipText, state === nfcState && styles.chipTextSelected]}>{state}</Text></Pressable>)}</View>
      <View style={styles.visualArea}><NfcWaveVisual state={nfcState} size={190} label="TapForm NFC" /><Text style={styles.visualLabel}>{nfcState.toUpperCase()}</Text></View>
    </Section>

    <Section title="Incoming notification · development only">
      <Text style={styles.meta}>Posts a 2-minute local preview through the same Android notification action and deep-link path. It uses a random non-backend session; TapForm will not fake approval or decline.</Text>
      <AnimatedPressable haptic="tap" style={styles.secondaryButton} onPress={() => void showNotificationPreview()}><Text style={styles.secondaryButtonText}>Show incoming request</Text></AnimatedPressable>
      <Text accessibilityRole="text" style={styles.meta}>{notificationPreviewStatus}</Text>
    </Section>

    <Section title="Tap behavior">
      <AnimatedPressable haptic="tap" style={styles.primaryButton} onPress={() => setShared((value) => !value)}><Text style={styles.primaryButtonText}>Primary action · light tap</Text></AnimatedPressable>
      <AnimatedToggleRow label="Optional phone number" detail={optional ? 'Selected for this preview' : 'Excluded from this preview'} value={optional} onValueChange={setOptional} />
    </Section>

    <Section title="Haptics diagnostics · development only">
      <Text style={styles.meta}>Each control calls Expo Haptics directly. “Resolved” means Android accepted the trigger request; it does not prove the motor was perceptible.</Text>
      <View style={styles.hapticGrid}>
        <HapticDiagnosticButton label="selectionAsync" result={hapticResults.selection} onPress={() => testHaptic('selection', 'Haptics.selectionAsync()', () => Haptics.selectionAsync())} />
        <HapticDiagnosticButton label="impact · light" result={hapticResults.light} onPress={() => testHaptic('light', 'Haptics.impactAsync(Light)', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))} />
        <HapticDiagnosticButton label="impact · medium" result={hapticResults.medium} onPress={() => testHaptic('medium', 'Haptics.impactAsync(Medium)', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))} />
        <HapticDiagnosticButton label="impact · heavy" result={hapticResults.heavy} onPress={() => testHaptic('heavy', 'Haptics.impactAsync(Heavy)', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy))} />
        <HapticDiagnosticButton label="notification · success" result={hapticResults.success} onPress={() => testHaptic('success', 'Haptics.notificationAsync(Success)', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))} />
        <HapticDiagnosticButton label="notification · warning" result={hapticResults.warning} onPress={() => testHaptic('warning', 'Haptics.notificationAsync(Warning)', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))} />
        <HapticDiagnosticButton label="notification · error" result={hapticResults.error} onPress={() => testHaptic('error', 'Haptics.notificationAsync(Error)', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))} />
        {Platform.OS === 'android' ? <>
          <HapticDiagnosticButton label="Android · context click" result={hapticResults.context} onPress={() => testHaptic('context', 'Haptics.performAndroidHapticsAsync(Context_Click)', () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click))} />
          <HapticDiagnosticButton label="Android · toggle on" result={hapticResults.toggle} onPress={() => testHaptic('toggle', 'Haptics.performAndroidHapticsAsync(Toggle_On)', () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On))} />
          <HapticDiagnosticButton label="Android · toggle off" result={hapticResults.toggleOff} onPress={() => testHaptic('toggleOff', 'Haptics.performAndroidHapticsAsync(Toggle_Off)', () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_Off))} />
          <HapticDiagnosticButton label="Android · confirm" result={hapticResults.confirm} onPress={() => testHaptic('confirm', 'Haptics.performAndroidHapticsAsync(Confirm)', () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm))} />
          <HapticDiagnosticButton label="Android · reject" result={hapticResults.reject} onPress={() => testHaptic('reject', 'Haptics.performAndroidHapticsAsync(Reject)', () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject))} />
        </> : null}
      </View>
    </Section>

    <Section title="Share confirmation">
      <View style={styles.row}><SuccessMark active={shared} size={48} /><View style={styles.grow}><Text style={styles.itemTitle}>{shared ? 'Confirmed preview' : 'Ready to preview success'}</Text><Text style={styles.meta}>Production success must wait for the server.</Text></View></View>
      <AnimatedPressable haptic="tap" style={styles.secondaryButton} onPress={() => setShared((value) => !value)}><Text style={styles.secondaryButtonText}>{shared ? 'Reset mark' : 'Reveal success mark'}</Text></AnimatedPressable>
    </Section>

    <Section title="Progress & loading">
      <View style={styles.row}><Text style={styles.itemTitle}>Completion</Text><AnimatedCounter value={`${Math.round(progress * 100)}%`} style={styles.counter} /></View>
      <AnimatedProgress value={progress} style={styles.progress} />
      <View style={styles.stateRow}>{[0.25, 0.62, 0.9].map((amount) => <Pressable key={amount} onPress={() => setProgress(amount)} style={styles.chip}><Text style={styles.chipText}>{Math.round(amount * 100)}%</Text></Pressable>)}</View>
      <LoadingSkeleton height={15} width="78%" /><LoadingSkeleton height={15} width="54%" /><LoadingSkeleton height={48} />
    </Section>

    <Section title="QR scanning frame">
      <View style={styles.scanWindow}><View style={styles.scanTarget}><Text style={styles.scanGlyph}>···</Text></View><QrScanCorners color="#B8BAB8" cornerLength={28} /></View>
      <Text style={styles.meta}>Corners stay outside the code quiet zone. This frame does not scan.</Text>
    </Section>

    <Section title="Request found transition">
      <View style={styles.stateRow}>{(['idle', 'found', 'consent', 'error'] as const).map((state) => <Pressable key={state} onPress={() => setRequestState(state)} style={[styles.chip, state === requestState && styles.chipSelected]}><Text style={[styles.chipText, state === requestState && styles.chipTextSelected]}>{state}</Text></Pressable>)}</View>
      <RequestTransition state={requestState}><View style={styles.transitionBox}><Text style={styles.eyebrow}>{requestState === 'found' ? 'REQUEST FOUND' : requestState.toUpperCase()}</Text><Text style={styles.itemTitle}>Event Registration</Text><Text style={styles.meta}>Preview fixture only · no session access</Text></View></RequestTransition>
    </Section>

    <Section title="Empty states">
      <View style={styles.emptyRow}>{(['activity', 'vault', 'submissions'] as const).map((kind) => <FadeInSection key={kind} style={styles.emptyItem}><EmptyVisual kind={kind} size={62} /><Text style={styles.meta}>{kind}</Text></FadeInSection>)}</View>
    </Section>
  </ScrollView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionBody}>{children}</View></View>;
}

function HapticDiagnosticButton({ label, result, onPress }: { label: string; result?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Test ${label}`} style={styles.hapticButton}>
    <Text style={styles.hapticButtonLabel}>{label}</Text>
    <Text style={styles.hapticResult}>{result ?? 'not tested'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: background },
  content: { padding: 20, paddingTop: 44, paddingBottom: 48, gap: 24 },
  locked: { flex: 1, backgroundColor: background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { gap: 9 },
  eyebrow: { color: secondary, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: primary, fontSize: 28, lineHeight: 34, fontWeight: '600' },
  body: { color: secondary, fontSize: 14, lineHeight: 20 },
  section: { gap: 12 },
  sectionTitle: { color: primary, fontSize: 17, fontWeight: '600' },
  sectionBody: { gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: surface },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 4 },
  markTile: { width: 52, height: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: '#1C1E1E' },
  itemTitle: { color: primary, fontSize: 15, fontWeight: '600' },
  meta: { color: secondary, fontSize: 12, lineHeight: 17 },
  stateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: '#101111' },
  chipSelected: { backgroundColor: '#292B2B', borderColor: '#858987' },
  chipText: { color: secondary, fontSize: 12 },
  chipTextSelected: { color: primary, fontWeight: '600' },
  visualArea: { minHeight: 218, alignItems: 'center', justifyContent: 'center', gap: 8 },
  visualLabel: { color: secondary, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  primaryButton: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: primary },
  primaryButtonText: { color: background, fontSize: 14, fontWeight: '600' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: primary, fontSize: 14, fontWeight: '500' },
  hapticGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hapticButton: { flexGrow: 1, flexBasis: '47%', minHeight: 64, paddingHorizontal: 11, paddingVertical: 10, justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 11, borderColor: border, backgroundColor: '#101111' },
  hapticButtonLabel: { color: primary, fontSize: 12, fontWeight: '600' },
  hapticResult: { color: secondary, fontSize: 10, lineHeight: 14 },
  counter: { color: primary, fontSize: 14, fontVariant: ['tabular-nums'] },
  progress: { height: 5 },
  scanWindow: { width: 210, height: 180, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: '#0E1010' },
  scanTarget: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#171919' },
  scanGlyph: { color: '#555957', fontSize: 32, letterSpacing: 8 },
  transitionBox: { minHeight: 82, justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: '#101111' },
  emptyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  emptyItem: { minWidth: 82, alignItems: 'center', gap: 6 },
});
