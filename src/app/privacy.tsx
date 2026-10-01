import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { Body, Button, Eyebrow, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';

export default function PrivacyScreen() {
  return <Page><ScrollView contentContainerStyle={styles.content}>
    <Button title="Back" variant="quiet" accessibilityLabel="Go back" onPress={() => router.back()}><ArrowLeft size={20} color={colors.ink} /></Button>
    <View><Eyebrow>PRIVACY & DATA</Eyebrow><Title>Your Vault stays yours.</Title><Body>TapForm gives you a clear view of every request and every share.</Body></View>
    <Surface style={styles.item}><View style={styles.icon}><LockKeyhole size={18} color={colors.ink} /></View><View style={styles.copy}><Text style={styles.title}>Your Vault</Text><Body>Your details stay tied to your account. Organizations cannot browse your Vault; a request can receive only the fields you approve.</Body></View></Surface>
    <Surface style={styles.item}><View style={styles.icon}><ShieldCheck size={18} color={colors.ink} /></View><View style={styles.copy}><Text style={styles.title}>Tap Cards stay specific</Text><Body>A Tap Card includes only the Vault fields you select. A tap, QR code, or link carries a secure reference; you review a personal exchange before its values are transferred.</Body></View></Surface>
    <View><SectionTitle>What happens after approval</SectionTitle><Surface style={styles.copy}><Body>An organization receives an immutable snapshot of selected fields and any answers you submit for that request. One-time answers are not added to your Vault.</Body><Body>The organization sets a 7, 30, or 90 day retention period. The service is configured to remove expired field values and answers while preserving non-sensitive receipt counts and status.</Body></Surface></View>
    <View><SectionTitle>Device features</SectionTitle><Surface style={styles.copy}><Body>Camera access is used when you choose to scan a QR code. Contacts access is requested only if you choose to export a received card. Notification and share-sheet content is limited to the action you choose.</Body><Body>NFC, QR, and request links contain exchange or request context, not Vault values.</Body></Surface></View>
    <View><SectionTitle>Account and data controls</SectionTitle><Surface style={styles.copy}><Body>Profile includes data export and account deletion. Deletion requires deliberate confirmation and removes the account&apos;s TapForm data after the backend confirms it. A failed request does not sign you out or show a success state.</Body><Body>Archiving a received card hides it from the Inbox; it does not erase a completed transfer receipt.</Body></Surface></View>
    <Text style={styles.note}>TapForm uses Supabase for account, database, and live update services. Review the published Privacy Policy for retention details and publisher contact information. TapForm does not claim independent security certification or organization verification.</Text>
  </ScrollView></Page>;
}

const styles = StyleSheet.create({ content: { gap: 22, paddingBottom: space.xl }, item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, icon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, copy: { gap: 10, padding: 16 }, title: { color: colors.ink, fontSize: 14, fontWeight: '600' }, note: { color: colors.subtle, fontSize: 11, lineHeight: 17, textAlign: 'center' } });
