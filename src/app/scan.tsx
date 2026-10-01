import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Camera, Nfc, QrCode, ShieldCheck } from 'lucide-react-native';
import { Body, Button } from '@/components/ui';
import { QrScanCorners } from '@/components/graphics/QrScanCorners';
import { colors, radius, space } from '@/constants/theme';
import { requestFound, error as errorHaptic } from '@/services/haptics';
import { QrTransport } from '@/services/qrTransport';
import { parseTapFormLink } from '@/services/tapLinks';
import { nfcCapabilities, onNfcState, startPeerReader, stopReader } from '@/services/nfcPeer';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [nfcMode, setNfcMode] = useState(false);
  const canScanWithNfc = useMemo(() => nfcCapabilities('personal').adapterPresent === true, []);
  const handled = useRef(false);
  const nfcModeRef = useRef(false);

  useEffect(() => {
    const remove = onNfcState((event) => {
      if (event.state === 'peer_share_found' && event.token && !handled.current) {
        handled.current = true;
        nfcModeRef.current = false;
        void stopReader();
        router.replace({ pathname: '/share' as never, params: { token: event.token } });
      } else if (event.state === 'error' && nfcModeRef.current) {
        nfcModeRef.current = false;
        void stopReader(); setNfcMode(false); setMessage(event.reason === 'expired' ? 'That Tap Card has expired. Ask for a new Tap Card.' : 'TapForm could not read that Tap Card. Try again or scan its QR code.');
      }
    });
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && nfcModeRef.current) {
        nfcModeRef.current = false;
        setNfcMode(false);
        setBusy(false);
        setMessage('NFC scanning paused when TapForm moved to the background. Start NFC again or scan the QR code.');
        void stopReader();
      }
    });
    return () => { nfcModeRef.current = false; appState.remove(); remove(); void stopReader(); };
  }, []);

  const beginNfcScan = async () => {
    setMessage(''); setBusy(true); nfcModeRef.current = true; setNfcMode(true); handled.current = false;
    try { await startPeerReader(); setBusy(false); }
    catch (cause) { nfcModeRef.current = false; setBusy(false); setNfcMode(false); setMessage(cause instanceof Error && /turned off/i.test(cause.message) ? 'NFC is turned off. Enable it in Android settings or scan the Tap Card QR.' : 'NFC could not start. Check NFC settings or scan the Tap Card QR.'); }
  };

  const onCode = async (data: string) => {
    if (handled.current || busy) return;
    handled.current = true;
    setBusy(true);
    setMessage('');
    try {
      const link = parseTapFormLink(data);
      if (link?.kind === 'share') {
        requestFound();
        router.replace({ pathname: '/share' as never, params: { token: link.token } });
        return;
      }
      const transport = new QrTransport(data);
      const payload = await transport.discoverSession();
      const request = await transport.joinSession(payload);
      requestFound();
      await import('@/services/pendingReview').then(({ savePendingReview }) => savePendingReview(request));
      router.replace({ pathname: '/review', params: {
        sessionId: request.sessionId, orgName: request.organizationName,
        purpose: request.purpose, templateName: request.templateName,
        retention: request.retentionDescription, fields: JSON.stringify(request.fields),
        questions: JSON.stringify(request.questions), expiresAt: request.expiresAt, verification: request.organizationStatus,
      } });
    } catch (cause) {
      const rawMessage = cause instanceof Error ? cause.message : '';
      const safeMessage = /expired|already being reviewed|already been used|no longer available/i.test(rawMessage)
        ? rawMessage
        : 'This TapForm code could not be verified. Check your connection or ask for a new code.';
      setMessage(safeMessage);
      setBusy(false);
      errorHaptic();
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;
  if (!permission.granted) return <View style={styles.center}>
    <View style={styles.icon}><Camera size={22} color={colors.ink} /></View>
    <Text style={styles.title}>Camera access</Text>
    <Body style={styles.centerText}>TapForm uses the camera to scan secure QR codes. The camera does not collect Vault information.</Body>
    {permission.canAskAgain ? <Button title="Allow camera" onPress={() => void requestPermission()} /> : <Body style={styles.centerText}>Camera access is off. Turn it on in TapForm&apos;s Android app settings to scan a code.</Body>}
    {canScanWithNfc ? <Button title="Tap a TapForm phone instead" variant="secondary" onPress={() => void beginNfcScan()}><Nfc size={17} color={colors.ink} /></Button> : null}
    {nfcMode || busy ? <Body style={styles.centerText}>Hold this phone near the Tap Card owner&apos;s phone.</Body> : null}
    <Button title="Go back" variant="quiet" onPress={() => router.back()} />
  </View>;

  return <View style={styles.screen}>
    {!busy && !message && !nfcMode ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => void onCode(data)} /> : null}
    <View style={styles.overlay}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft color={colors.ink} size={21} /></Pressable>
      <View style={styles.scanArea}><View style={styles.scanFrame}><QrScanCorners color={colors.ink} cornerLength={42} strokeWidth={2} /><QrCode color={colors.muted} size={30} /></View></View>
      <View style={styles.instruction}>
        <Text style={styles.title}>{message ? 'Code not available' : busy ? 'Checking code' : nfcMode ? 'Ready to tap' : 'Scan TapForm code'}</Text>
        <Text style={styles.text}>{message || (busy ? 'Verifying the secure reference with TapForm.' : nfcMode ? "Hold this phone near a Tap Card owner's phone." : 'Point your camera at a TapForm request or Tap Card QR.')}</Text>
        {busy ? <ActivityIndicator color={colors.ink} style={styles.loader} /> : null}
        {message ? <Button title="Scan another code" variant="secondary" onPress={() => { handled.current = false; setMessage(''); }} /> : null}
        {!nfcMode && !busy && canScanWithNfc ? <Button title="Tap a TapForm phone" variant="secondary" onPress={() => void beginNfcScan()}><Nfc size={17} color={colors.ink} /></Button> : null}
        {nfcMode && !busy ? <Button title="Use QR scanner" variant="quiet" onPress={() => { nfcModeRef.current = false; void stopReader(); setNfcMode(false); }}><QrCode size={16} color={colors.muted} /></Button> : null}
        <View style={styles.privacy}><ShieldCheck size={15} color={colors.muted} /><Text style={styles.privacyText}>The code carries a secure reference only. Nothing is shared until you review and approve.</Text></View>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, justifyContent: 'center', padding: space.xl, alignItems: 'center', gap: 17, backgroundColor: colors.canvas },
  icon: { width: 54, height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  title: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(9,10,10,0.72)', alignItems: 'center', padding: space.lg, paddingTop: 42 },
  back: { alignSelf: 'flex-start', width: 44, height: 44, justifyContent: 'center' },
  scanArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  scanFrame: { width: 272, height: 272, alignItems: 'center', justifyContent: 'center' },
  instruction: { width: '100%', gap: 10, paddingBottom: 16 },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loader: { marginTop: 5 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, marginTop: 8 },
  privacyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});


