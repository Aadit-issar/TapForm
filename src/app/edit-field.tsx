import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, LockKeyhole } from 'lucide-react-native';
import { Body, Button, Input, Page } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_BY_KEY, FieldKey, validateVaultEdit } from '@/domain/fields';
import { supabase } from '@/services/supabase';
import { error as errorHaptic, success } from '@/services/haptics';
import { useAppState } from '@/state/AppState';

export default function EditFieldScreen() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>(); const { vault, updateField } = useAppState();
  const field = useMemo(() => rawKey ? FIELD_BY_KEY[rawKey as FieldKey] : undefined, [rawKey]);
  const key = rawKey as FieldKey; const [value, setValue] = useState(vault[key] || ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!field) return; const validation = validateVaultEdit(key, value); if (validation) { setError(validation); return; }
    setError(''); setBusy(true);
    try {
      if (supabase) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) { setError('Your session expired. Sign in again to update your Vault.'); return; }
        const result = value.trim()
          ? await supabase.from('personal_fields').upsert({ user_id: userData.user.id, field_key: key, value: value.trim(), updated_at: new Date().toISOString() })
          : await supabase.from('personal_fields').delete().eq('user_id', userData.user.id).eq('field_key', key);
        if (result.error) { setError('This change could not be saved. Check your connection and retry.'); errorHaptic(); return; }
      }
      updateField(key, value.trim());
      success();
      router.back();
    } catch {
      setError('This change could not be saved. Check your connection and retry.');
      errorHaptic();
    } finally {
      setBusy(false);
    }
  };
  if (!field) return <Page><Body>This vault field is unavailable.</Body><Button title="Go back" onPress={() => router.back()} /></Page>;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.canvas}} edges={['top','left','right','bottom']}><KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={styles.header}><Button title="Back" variant="quiet" accessibilityLabel="Back to Vault" onPress={() => router.back()} style={styles.backButton}><ArrowLeft color={colors.ink} size={19} /></Button><Text style={styles.headerTitle}>Edit information</Text></View><View style={styles.intro}><Text style={styles.title}>{field.label}</Text><Body>{field.category} · saved only to your private vault</Body></View><Input label={field.label} value={value} onChangeText={(text) => { setValue(text); setError(''); }} keyboardType={field.kind === 'email' ? 'email-address' : field.kind === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={field.kind === 'email' ? 'none' : 'sentences'} autoComplete={field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : 'off'} placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : `Enter ${field.label.toLowerCase()}`} /><Text style={styles.removeHint}>Leave blank and save to remove it from your Vault.</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<View style={styles.secure}><LockKeyhole size={16} color={colors.green} /><Text style={styles.secureText}>This information is not shared until you approve a request.</Text></View><Button title="Save changes" loading={busy} onPress={save} /></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ scroll: { padding: space.lg, gap: 20 }, header: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 48 }, backButton: { minWidth: 48, minHeight: 48 }, headerTitle: { fontSize: 15, fontWeight: '600', color: colors.ink }, intro: { gap: 8, paddingTop: 12 }, title: { fontSize: 27, fontWeight: '700', color: colors.ink }, removeHint: { color: colors.subtle, fontSize: 11, lineHeight: 16 }, secure: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14, backgroundColor: colors.greenWash, borderRadius: 12 }, secureText: { flex: 1, color: colors.greenDark, fontSize: 12 }, error: { color: colors.red, fontSize: 13 }, });
