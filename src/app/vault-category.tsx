import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ChevronRight, CircleCheck, CirclePlus } from 'lucide-react-native';
import { Body, Button, Eyebrow, Page, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY, FieldCategory, vaultFromRows } from '@/domain/fields';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';

const descriptions: Record<FieldCategory, string> = { Identity: 'Your name and identity details.', Contact: 'Ways you can be reached.', Education: 'Your school and program details.', Emergency: 'Who to contact if you need help.' };
const validCategories: FieldCategory[] = ['Identity', 'Contact', 'Education', 'Emergency'];

export default function VaultCategoryScreen() {
  const { category: rawCategory } = useLocalSearchParams<{ category?: string }>();
  const { vault, replaceVault } = useAppState();
  const [errorMessage, setErrorMessage] = useState('');
  const category = validCategories.find((value) => value === rawCategory);
  const fields = useMemo(() => FIELD_REGISTRY.filter((field) => field.category === category), [category]);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!category || !supabase) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (active) setErrorMessage('Sign in again to open your Vault.'); return; }
      const { data, error: loadError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', auth.user.id);
      if (active && loadError) setErrorMessage('This section could not be loaded. Check your connection and retry.');
      if (active && data) replaceVault(vaultFromRows(data));
    })();
    return () => { active = false; };
  }, [category, replaceVault]);

  if (!category) return <Page><Body>This Vault category is unavailable.</Body><Button title="Back to Vault" onPress={() => router.dismissTo('/(tabs)/vault')} /></Page>;
  const complete = fields.filter((field) => Boolean(vault[field.key])).length;
  return <Page><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><ArrowLeft size={20} color={colors.ink} /><Text style={styles.backText}>My Vault</Text></Pressable>
    <View><Eyebrow>VAULT CATEGORY · {complete}/{fields.length} COMPLETE</Eyebrow><Title>{category}</Title><Body>{descriptions[category]}</Body></View>
    {errorMessage ? <Surface accessibilityRole="alert"><Body>{errorMessage}</Body><Button title="Try again" variant="secondary" onPress={() => setErrorMessage('')} /></Surface> : null}
    <Surface style={styles.group}>{fields.map((field, index) => <View key={field.key}>
      {index > 0 ? <View style={styles.rule} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${field.label}, ${vault[field.key] ? 'edit' : 'add'}`} onPress={() => router.push({ pathname: '/edit-field', params: { key: field.key } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.copy}><Text style={styles.label}>{field.label}{'optionalInVault' in field && field.optionalInVault ? <Text style={styles.optional}> · OPTIONAL</Text> : null}</Text><Text numberOfLines={2} style={[styles.value, !vault[field.key] && styles.placeholder]}>{vault[field.key] || 'Add information'}</Text></View>
        {vault[field.key] ? <CircleCheck size={18} color={colors.ink} /> : <CirclePlus size={19} color={colors.muted} />}
        <ChevronRight size={17} color={colors.subtle} />
      </Pressable>
    </View>)}</Surface>
    <Surface style={styles.note}><Body>These details stay in your Vault. You can review each requested field before anything is shared.</Body></Surface>
  </ScrollView></Page>;
}

const styles = StyleSheet.create({ content: { gap: 20, paddingBottom: space.xl }, back: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 }, backText: { color: colors.muted, fontSize: 13 }, group: { paddingVertical: 0, paddingHorizontal: 14 }, row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11 }, copy: { flex: 1, gap: 5 }, label: { color: colors.ink, fontSize: 13, fontWeight: '500' }, optional: { color: colors.subtle, fontSize: 8, fontWeight: '700', letterSpacing: 0.5 }, value: { color: colors.muted, fontSize: 12, lineHeight: 17 }, placeholder: { color: colors.subtle }, rule: { height: 1, backgroundColor: colors.lineSubtle }, pressed: { opacity: 0.72 }, note: { padding: 14 } });
