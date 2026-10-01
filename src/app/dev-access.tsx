import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Wrench } from 'lucide-react-native';
import { Body, Button, Eyebrow, Page, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAppState } from '@/state/AppState';

export default function DeveloperAccessScreen() {
  const { role, setRole, developerToolsUnlocked, setDeveloperToolsUnlocked } = useAppState();

  if (!__DEV__) return <Redirect href="/(tabs)/profile" />;

  const previewRole = (nextRole: 'personal' | 'organization') => {
    setRole(nextRole);
    router.replace('/(tabs)' as never);
  };

  return <Page><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to profile" style={styles.back}>
      <ArrowLeft size={19} color={colors.ink} /><Text style={styles.backText}>Back to profile</Text>
    </Pressable>
    <View style={styles.heading}>
      <View style={styles.icon}><Wrench size={19} color={colors.ink} /></View>
      <Eyebrow>DEVELOPMENT ONLY</Eyebrow>
      <Title>Developer access</Title>
      <Body>Local tools for previewing TapForm on this development build.</Body>
    </View>

    {!developerToolsUnlocked ? <Surface style={styles.panel}>
      <Text style={styles.panelTitle}>Enable local preview tools</Text>
      <Body>These tools exist only in development builds and do not change account permissions.</Body>
      <Button title="Enable preview tools" onPress={() => setDeveloperToolsUnlocked(true)} />
    </Surface> : <>
      <Surface style={styles.panel}>
        <Eyebrow>APP ROLE PREVIEW</Eyebrow>
        <Text style={styles.panelTitle}>Switch the local preview</Text>
        <Body>This changes which app interface is shown on this device. It does not change your account role or grant server access.</Body>
        <Button title="Preview Personal mode" variant={role === 'personal' ? 'primary' : 'secondary'} selected={role === 'personal'} onPress={() => previewRole('personal')} />
        <Button title="Preview Organization mode" variant={role === 'organization' ? 'primary' : 'secondary'} selected={role === 'organization'} onPress={() => previewRole('organization')} />
      </Surface>
      <Surface style={styles.panel}>
        <Eyebrow>DIAGNOSTICS & PREVIEWS</Eyebrow>
        <Button title="Motion & graphics gallery" variant="secondary" onPress={() => router.push('/motion-gallery' as never)} />
        <Button title="Request state preview" variant="secondary" onPress={() => router.push('/preview-states' as never)} />
        <Button title="NFC diagnostics" variant="secondary" onPress={() => router.push('/nfc-test' as never)} />
      </Surface>
      <Button title="Lock developer tools" variant="quiet" onPress={() => setDeveloperToolsUnlocked(false)} />
      <Text style={styles.note}>Development tools are unavailable in production builds.</Text>
    </>}
  </ScrollView></Page>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: space.lg, paddingBottom: space.xl },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  heading: { gap: 9 },
  icon: { width: 42, height: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  panel: { gap: 13 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 11, lineHeight: 17 },
});
