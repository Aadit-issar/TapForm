import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Bell, ChevronRight, Download, LockKeyhole, Radio, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react-native';
import { Body, Button, Eyebrow, Input, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';
import { getNotificationPermission, nfcCapabilities, openNfcSettings, openNotificationSettings, requestNotificationPermission } from '@/services/nfcPeer';
import { clearPostAuthReturnTo } from '@/services/postAuthReturn';
import { clearAllPendingReviews } from '@/services/pendingReview';
import { clearAllPendingPeers } from '@/services/pendingPeer';
import { error as hapticError, success as hapticSuccess } from '@/services/haptics';

export default function ProfileScreen() {
  const { role, displayName, setDisplayName, setDeveloperToolsUnlocked } = useAppState();
  const [email, setEmail] = useState('');
  const [sharingName, setSharingName] = useState(displayName);
  const [sharingNameBusy, setSharingNameBusy] = useState(false);
  const [sharingNameMessage, setSharingNameMessage] = useState('');
  const [dataMessage, setDataMessage] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [notificationCanAsk, setNotificationCanAsk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [nfcRefresh, setNfcRefresh] = useState(0);
  const nfc = useMemo(() => { void nfcRefresh; return nfcCapabilities(role); }, [nfcRefresh, role]);

  useEffect(() => {
    if (supabase) void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
    void getNotificationPermission().then((permission) => { setNotificationGranted(permission.granted); setNotificationCanAsk(permission.canAskAgain); });
  }, [role]);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { setNfcRefresh((value) => value + 1); setSharingName(displayName); } });
    return () => { active = false; };
  }, [displayName]));

  const enableNotifications = async () => {
    setBusy(true); setMessage('');
    try {
      const permission = await requestNotificationPermission();
      setNotificationGranted(permission.granted); setNotificationCanAsk(permission.canAskAgain);
      setMessage(permission.granted ? 'Request notifications are on.' : 'Notifications are off. You can still open TapForm to review a saved request.');
    } catch { setMessage('Notification settings could not be changed. You can update them in Android settings.'); }
    finally { setBusy(false); }
  };

  const saveSharingName = async () => {
    if (!supabase) { setSharingNameMessage('Sign in to update the name people see when you share.'); return; }
    setSharingNameBusy(true); setSharingNameMessage('');
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) throw new Error('session unavailable');
      const normalizedName = sharingName.trim();
      const { data, error } = await supabase.rpc('update_my_display_name', { p_display_name: normalizedName });
      if (error || typeof data !== 'string') throw new Error('profile update failed');
      const savedName = data;
      setDisplayName(savedName);
      setSharingName(savedName);
      setSharingNameMessage(savedName ? 'Your sharing name is updated.' : 'Other members will see “TapForm member”.');
      hapticSuccess();
    } catch {
      setSharingNameMessage('Your sharing name could not be saved. Check your connection and retry.');
      hapticError();
    } finally { setSharingNameBusy(false); }
  };

  const signOut = async () => {
    if (!supabase) { setDeveloperToolsUnlocked(false); router.replace('/'); return; }
    setAccountMessage('');
    setBusy(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    setBusy(false);
    if (signOutError) { setAccountMessage('You could not be signed out. Check your connection and try again.'); return; }
    await clearPostAuthReturnTo();
    await Promise.all([clearAllPendingReviews(), clearAllPendingPeers()]);
    setDeveloperToolsUnlocked(false);
    router.replace('/');
  };

  const exportData = async () => {
    if (!supabase) { setDataMessage('Connect to your account to export your TapForm data.'); return; }
    setExportBusy(true); setDataMessage('');
    try {
      const { data, error } = await supabase.rpc('export_my_data');
      if (error || !data || typeof data !== 'object') throw new Error('export failed');
      const content = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const result = await Share.share({ title: 'TapForm data export', message: content });
        setDataMessage(result.action === Share.dismissedAction ? 'Export was not shared.' : 'Your export is ready in the app you selected.');
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error('file sharing is unavailable');
      const file = new File(Paths.cache, `tapform-export-${Date.now()}.json`);
      file.create();
      try {
        file.write(content);
        await Sharing.shareAsync(file.uri, { dialogTitle: 'Export TapForm data', mimeType: 'application/json' });
        setDataMessage('The export was opened in your system share sheet.');
      } finally {
        if (file.exists) file.delete();
      }
    } catch { setDataMessage('Your data could not be exported. Check your connection and retry.'); }
    finally { setExportBusy(false); }
  };

  const deleteAccount = async () => {
    if (deleteText.trim() !== 'DELETE') { setDataMessage('Type DELETE to confirm account removal.'); return; }
    if (!supabase) { setDataMessage('Connect to your account to delete it.'); return; }
    setBusy(true); setDataMessage('');
    const { error: deleteError } = await supabase.rpc('delete_my_account');
    if (deleteError) {
      setBusy(false);
      setDataMessage('TapForm could not delete your account. Nothing was changed. Check your connection and retry.');
      return;
    }
    await clearPostAuthReturnTo();
    await Promise.all([clearAllPendingReviews(), clearAllPendingPeers()]);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setBusy(false);
    router.replace('/');
  };

  return <Page><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View><Eyebrow>ACCOUNT</Eyebrow><Title>Profile</Title><Body>Manage access and privacy preferences.</Body></View>
    <Surface style={styles.account}><View style={styles.accountIcon}><UserRound size={20} color={colors.ink} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.name}>{displayName || 'TapForm member'}</Text><Text style={styles.caption}>{email || (role === 'personal' ? 'Personal account' : 'Organization account')}</Text></View><ShieldCheck size={19} color={colors.muted} /></Surface>

    <View><SectionTitle>Sharing identity</SectionTitle><Surface style={styles.preferences}>
      <Body>Choose the name other TapForm members see before they approve a card share. It stays separate from your Vault.</Body>
      <Input label="Name shown to others" value={sharingName} onChangeText={setSharingName} placeholder="TapForm member by default" maxLength={100} autoCapitalize="words" autoCorrect={false} returnKeyType="done" />
      <Button title="Save sharing name" variant="secondary" loading={sharingNameBusy} disabled={sharingName.trim() === displayName} onPress={() => void saveSharingName()} />
      {sharingNameMessage ? <Text accessibilityRole="alert" style={styles.caption}>{sharingNameMessage}</Text> : null}
    </Surface></View>

    <View><SectionTitle>Preferences</SectionTitle><Surface style={styles.preferences}>
      <View style={styles.settingRow}><View style={styles.settingIcon}><Bell size={17} color={colors.ink} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>Request notifications</Text><Text style={styles.caption}>{notificationGranted ? 'Private alerts are enabled' : 'Off · review requests in TapForm'}</Text></View><Text style={styles.settingValue}>{notificationGranted ? 'ON' : 'OFF'}</Text></View>
      {!notificationGranted ? <Button title={notificationCanAsk ? 'Enable notifications' : 'Open notification settings'} variant="secondary" loading={busy} onPress={() => notificationCanAsk ? void enableNotifications() : openNotificationSettings()} /> : null}
      {notificationGranted ? <Button title="Notification settings" variant="quiet" onPress={openNotificationSettings} /> : null}
      {message ? <Text accessibilityRole="alert" style={styles.caption}>{message}</Text> : null}
      <View style={styles.rule} />
      <View style={styles.settingRow}><View style={styles.settingIcon}><Radio size={17} color={colors.ink} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>NFC requests</Text><Text style={styles.caption}>{nfc.adapterPresent ? nfc.enabled ? nfc.hceSupported && nfc.hceServiceRegistered ? 'Ready to receive on this phone' : 'QR requests are available' : 'NFC is turned off' : 'Use a request QR code'}</Text></View></View>
      {nfc.adapterPresent && !nfc.enabled ? <Button title="NFC settings" variant="quiet" onPress={openNfcSettings} /> : null}
    </Surface></View>

    <View><SectionTitle>Privacy & security</SectionTitle><Surface style={styles.preferences}>
      <Option icon={<LockKeyhole size={17} color={colors.ink} />} title="Privacy & data" detail="How your Vault and shares work" onPress={() => router.push('/privacy')} />
      <View style={styles.rule} />
      <Option icon={<ShieldCheck size={17} color={colors.ink} />} title="Approval is always required" detail="Tapping never sends Vault information" />
    </Surface></View>

    <View><SectionTitle>Sharing defaults</SectionTitle><Surface style={styles.preferences}>
      <Option icon={<UserRound size={17} color={colors.ink} />} title="Default Tap Card" detail="Choose what is ready when you share" onPress={() => router.push('/tap-cards' as never)} />
      {role === 'organization' ? <><View style={styles.rule} /><Option icon={<ShieldCheck size={17} color={colors.ink} />} title="Default request template" detail="Set the organization request used by default" onPress={() => router.push('/(tabs)/templates')} /></> : null}
    </Surface></View>

    <View><SectionTitle>Your data</SectionTitle><Surface style={styles.preferences}>
      <Body>Export your Vault, Tap Cards, receipts, request history, and received cards through your device’s share sheet.</Body>
      <Button title="Export my data" variant="secondary" loading={exportBusy} onPress={() => void exportData()}><Download size={16} color={colors.ink} /></Button>
      {!deleteOpen && dataMessage ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{dataMessage}</Text> : null}
      <View style={styles.rule} />
      <Option icon={<ShieldAlert size={17} color={colors.ink} />} title="Delete account" detail="Permanently remove your TapForm account and personal data" onPress={() => { setDeleteOpen((value) => !value); setDeleteText(''); setDataMessage(''); }} />
      {deleteOpen ? <View style={styles.deletePanel}>
        <Text style={styles.deleteTitle}>This removes your account</Text>
        <Body>Your Vault, Tap Cards, personal request history, and received cards will be deleted. Organization data you own and its submissions will also be removed. Copies a recipient separately exported are outside TapForm and may remain under that recipient’s policies.</Body>
        <Input label="Type DELETE to continue" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" autoCorrect={false} />
        <Button title="Permanently delete account" variant="secondary" loading={busy} disabled={deleteText.trim() !== 'DELETE'} onPress={() => void deleteAccount()} />
        {dataMessage ? <Text accessibilityRole="alert" style={styles.caption}>{dataMessage}</Text> : null}
        <Button title="Keep my account" variant="quiet" disabled={busy} onPress={() => { setDeleteOpen(false); setDeleteText(''); }} />
      </View> : null}
    </Surface></View>

    <View><SectionTitle>App</SectionTitle><Surface style={styles.preferences}>
      <View style={styles.settingRow}><View style={styles.settingIcon}><ShieldCheck size={17} color={colors.ink} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>TapForm</Text><Text style={styles.caption}>Version {Constants.expoConfig?.version || '1.0.0'} · {Constants.expoConfig?.android?.versionCode ? `Build ${Constants.expoConfig.android.versionCode}` : 'Android'}</Text></View></View>
    </Surface></View>

    {accountMessage ? <Text accessibilityRole="alert" style={styles.caption}>{accountMessage}</Text> : null}
    <Button title="Sign out" variant="secondary" loading={busy} onPress={() => void signOut()} />
    {__DEV__ ? <Pressable delayLongPress={5000} onLongPress={() => router.push('/dev-access' as never)} accessibilityRole="button" accessibilityLabel="Developer access" accessibilityHint="Press and hold for five seconds to open development tools" style={styles.footerPressable}><Text style={styles.footer}>TapForm · Your information. Your control.</Text></Pressable> : <Text style={styles.footer}>TapForm · Your information. Your control.</Text>}
  </ScrollView></Page>;
}

function Option({ icon, title, detail, onPress }: { icon: React.ReactNode; title: string; detail: string; onPress?: () => void }) {
  const content = <><View style={styles.settingIcon}>{icon}</View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.caption}>{detail}</Text></View>{onPress ? <ChevronRight size={17} color={colors.subtle} /> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingRow}>{content}</Pressable> : <View style={styles.settingRow}>{content}</View>;
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: space.xl }, account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 }, accountIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, name: { color: colors.ink, fontSize: 14, fontWeight: '600' }, caption: { color: colors.muted, fontSize: 11, lineHeight: 16 }, preferences: { gap: 13, padding: 15 }, settingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }, settingIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, settingCopy: { flex: 1, gap: 3 }, settingTitle: { color: colors.ink, fontSize: 13, fontWeight: '500' }, settingValue: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }, rule: { height: 1, backgroundColor: colors.lineSubtle }, deletePanel: { gap: 12, paddingTop: 8 }, deleteTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, footerPressable: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, footer: { color: colors.subtle, fontSize: 11, textAlign: 'center' },
});
