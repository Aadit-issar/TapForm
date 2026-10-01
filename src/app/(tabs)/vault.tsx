import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, CircleCheck, LockKeyhole } from 'lucide-react-native';
import { AnimatedProgress, LoadingSkeleton } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY, FieldCategory, vaultFromRows } from '@/domain/fields';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';

const categories: FieldCategory[] = ['Identity', 'Contact', 'Education', 'Emergency'];
const categorySub: Record<FieldCategory, string> = { Identity: 'Name and identity details', Contact: 'Ways to reach you', Education: 'School and program', Emergency: 'Who to contact if needed' };

export default function VaultScreen() {
  const { vault, replaceVault, demo, developerToolsUnlocked } = useAppState();
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const done = useMemo(() => FIELD_REGISTRY.filter((field) => Boolean(vault[field.key])).length, [vault]);
  const percent = Math.round((done / FIELD_REGISTRY.length) * 100);

  const loadVault = useCallback(async () => {
    setLoading(true); setErrorMessage('');
    if (supabase) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setErrorMessage('Sign in again to open your Vault.'); setLoading(false); return; }
      const { data, error: fetchError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', auth.user.id);
      if (fetchError) { setErrorMessage('Your Vault could not be loaded. Check your connection and try again.'); setLoading(false); return; }
      replaceVault(vaultFromRows(data || []));
    }
    setLoading(false);
  }, [replaceVault]);

  useEffect(() => { Promise.resolve().then(loadVault); }, [loadVault]);

  const seed = async () => {
    if (!__DEV__ || !developerToolsUnlocked || !supabase) return;
    setSeeding(true); setErrorMessage('');
    const { error: seedError } = await supabase.rpc('seed_demo_account', { p_mode: 'personal' });
    setSeeding(false);
    if (seedError) { setErrorMessage('Fictional demo details could not be added. Check the setup and retry.'); return; }
    await loadVault();
  };

  return <Page><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View><Eyebrow>PERSONAL DATA</Eyebrow><Title>My Vault</Title><Body>Review and update the details you may choose to share.</Body></View>
    <Surface style={styles.summary}>
      <View style={styles.summaryTop}><View><Eyebrow>PROFILE COMPLETION</Eyebrow><Text style={styles.summaryNumber}>{percent}<Text style={styles.percent}>%</Text></Text></View><View style={styles.lockIcon}><LockKeyhole color={colors.ink} size={19} /></View></View>
      <AnimatedProgress value={percent / 100} />
      <Text style={styles.summaryCaption}>{done} of {FIELD_REGISTRY.length} fields added</Text>
    </Surface>
    <View style={styles.privateNote}><LockKeyhole size={15} color={colors.muted} /><Text style={styles.privateText}>Organizations cannot browse your Vault.</Text></View>
    {errorMessage ? <Surface accessibilityRole="alert" style={styles.errorBox}><Body>{errorMessage}</Body><Button title="Try again" variant="secondary" onPress={() => void loadVault()} /></Surface> : null}
    {__DEV__ && demo && developerToolsUnlocked && done === 0 && !loading ? <Surface style={styles.seed}><Eyebrow>DEVELOPMENT DATA</Eyebrow><Text style={styles.seedTitle}>Use fictional sample details</Text><Body>Add Alex Morgan’s fictional sample information to this signed-in account.</Body><Button title="Add sample Vault" loading={seeding} onPress={() => void seed()} /></Surface> : null}
    <View><SectionTitle>Categories</SectionTitle>{loading ? <View style={{ gap: 10 }}><LoadingSkeleton height={76} /><LoadingSkeleton height={76} /><LoadingSkeleton height={76} /><LoadingSkeleton height={76} /></View> : categories.map((category) => {
      const fields = FIELD_REGISTRY.filter((field) => field.category === category);
      const filled = fields.filter((field) => Boolean(vault[field.key])).length;
      const sample = fields.filter((field) => vault[field.key]).slice(0, 2).map((field) => field.label).join(' · ');
      return <Pressable key={category} accessibilityRole="button" accessibilityLabel={`${category}, ${filled} of ${fields.length} fields complete`} onPress={() => router.push({ pathname: '/vault-category', params: { category } })} style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}>
        <View style={styles.categoryCopy}><View style={styles.categoryTop}><Text style={styles.categoryName}>{category}</Text><Text style={styles.categoryCount}>{filled}/{fields.length}</Text></View><Text style={styles.categoryDescription}>{sample || categorySub[category]}</Text><View style={styles.categoryProgress}><View style={[styles.categoryProgressValue, { width: `${Math.max(0, filled / fields.length * 100)}%` }]} /></View></View>
        {filled === fields.length ? <CircleCheck size={18} color={colors.ink} /> : <ChevronRight size={19} color={colors.muted} />}
      </Pressable>;
    })}</View>
    <Body style={styles.footerNote}>When you approve a request, only the fields you select are copied into its receipt.</Body>
  </ScrollView></Page>;
}

const styles = StyleSheet.create({ content: { gap: 20, paddingBottom: space.xl }, summary: { gap: 13, padding: 17 }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryNumber: { marginTop: 3, color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: '500', fontVariant: ['tabular-nums'] }, percent: { fontSize: 17, color: colors.muted }, summaryCaption: { color: colors.muted, fontSize: 11 }, lockIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, privateNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, privateText: { color: colors.muted, fontSize: 11 }, categoryRow: { minHeight: 83, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderColor: colors.lineSubtle, paddingVertical: 12 }, categoryCopy: { flex: 1, gap: 7 }, categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, categoryName: { color: colors.ink, fontSize: 15, fontWeight: '500' }, categoryCount: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'] }, categoryDescription: { color: colors.muted, fontSize: 11 }, categoryProgress: { height: 2, backgroundColor: colors.surfaceSecondary, borderRadius: 2 }, categoryProgressValue: { height: 2, backgroundColor: colors.ink }, pressed: { opacity: 0.75 }, seed: { gap: 11 }, seedTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, errorBox: { gap: 10 }, footerNote: { textAlign: 'center', fontSize: 11, lineHeight: 17, paddingTop: 2 } });
