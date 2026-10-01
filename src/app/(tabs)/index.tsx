import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, ChevronRight, Clock3, LockKeyhole, Shield } from 'lucide-react-native';
import { AnimatedProgress } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Page, SectionTitle, Surface } from '@/components/ui';
import { NfcWaveVisual } from '@/components/graphics/NfcWaveVisual';
import { TapFormMark } from '@/components/graphics/TapFormMark';
import { colors, radius, space } from '@/constants/theme';
import { FIELD_REGISTRY, vaultFromRows } from '@/domain/fields';
import { getLatestPendingRequest, nfcCapabilities } from '@/services/nfcPeer';
import { getPendingReview } from '@/services/pendingReview';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';

type Recent = { id: string; organization: string; template: string; status: string; createdAt: string };

export default function HomeScreen() {
  const { role, setRole, vault, replaceVault, demo, developerToolsUnlocked, displayName, authReady, hasSession } = useAppState();
  const [switcher, setSwitcher] = useState(false);
  const [organizationName, setOrganizationName] = useState('Organization setup');
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('Create a request');
  const [templatePurpose, setTemplatePurpose] = useState('Set up your organization and choose the exact information to request.');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [defaultCardName, setDefaultCardName] = useState('Set up a Tap Card');
  const [defaultCardFields, setDefaultCardFields] = useState('Choose what you are ready to share');
  const [vaultSummaryState, setVaultSummaryState] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const personalNfcReady = useMemo(() => {
    const caps = nfcCapabilities(role);
    return Boolean(caps.adapterPresent && caps.enabled && caps.hceSupported && caps.hceServiceRegistered);
  }, [role]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!authReady) {
        if (role === 'personal') setVaultSummaryState('checking');
        return;
      }
      if (!supabase || !hasSession) {
        setVaultSummaryState('ready');
        return;
      }

      if (role === 'personal') setVaultSummaryState('checking');
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('session');
        if (role === 'organization') {
          const { data: members } = await supabase.from('organization_members').select('organization_id,organizations(name)').eq('user_id', auth.user.id).limit(1);
          const member = members?.[0] as unknown as { organization_id: string; organizations: { name: string } } | undefined;
          if (member?.organizations?.name && active) setOrganizationName(member.organizations.name);
          if (member?.organization_id) {
            const [{ data: preferences }, { data }] = await Promise.all([
              supabase.from('organization_preferences').select('default_template_id').eq('organization_id', member.organization_id).maybeSingle(),
              supabase.from('request_templates').select('id,name,purpose').eq('organization_id', member.organization_id).eq('is_archived', false).order('created_at').limit(50),
            ]);
            const selected = (data || []).find((item) => item.id === preferences?.default_template_id) || data?.[0];
            if (active && selected) { setTemplateId(selected.id); setTemplateName(selected.name); setTemplatePurpose(selected.purpose); }
          }
        } else {
          const { data: fields, error: vaultError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', auth.user.id);
          if (vaultError || !fields) throw new Error('vault');
          if (active) {
            replaceVault(vaultFromRows(fields));
            setVaultSummaryState('ready');
          }
          const { data } = await supabase.from('request_responses').select('id,status,created_at,request_sessions(organizations(name),request_templates(name))').order('created_at', { ascending: false }).limit(3);
          if (active && data) setRecent(data.map((item) => {
            const row = item as unknown as { id: string; status: string; created_at: string; request_sessions?: { organizations?: { name: string }; request_templates?: { name: string } } };
            return { id: row.id, organization: row.request_sessions?.organizations?.name || 'Organization', template: row.request_sessions?.request_templates?.name || 'Information request', status: row.status, createdAt: row.created_at };
          }));
        }
      } catch {
        if (active && role === 'personal') setVaultSummaryState('unavailable');
      }
    });
    return () => { active = false; };
  }, [authReady, hasSession, role, replaceVault]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (role !== 'personal' || !hasSession || !supabase) {
      if (role === 'personal') {
        setDefaultCardName('Set up a Tap Card');
        setDefaultCardFields('Choose what you are ready to share');
      }
      return () => { active = false; };
    }

    void (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) throw new Error('session');

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('default_tap_card_id')
          .eq('id', auth.user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        if (profile?.default_tap_card_id) {
          const { data: card, error: cardError } = await supabase
            .from('tap_cards')
            .select('name,expires_at,tap_card_fields(field_key)')
            .eq('id', profile.default_tap_card_id)
            .eq('user_id', auth.user.id)
            .is('archived_at', null)
            .maybeSingle();
          if (cardError) throw cardError;
          if (card && (!card.expires_at || new Date(card.expires_at).getTime() > Date.now())) {
            const value = card as unknown as { name: string; expires_at: string | null; tap_card_fields: { field_key: string }[] };
            if (active) {
              setDefaultCardName(value.name);
              setDefaultCardFields(value.tap_card_fields.map((item) => FIELD_REGISTRY.find((field) => field.key === item.field_key)?.label).filter(Boolean).join(' · ') || 'No shareable fields selected');
            }
            return;
          }
        }

        const { data: cards, error: cardsError } = await supabase
          .from('tap_cards')
          .select('expires_at')
          .eq('user_id', auth.user.id)
          .is('archived_at', null)
          .order('display_order')
          .order('created_at');
        if (cardsError) throw cardsError;
        const usableCards = (cards || []).filter((card) => !card.expires_at || new Date(card.expires_at).getTime() > Date.now());
        if (active && usableCards.length) {
          const count = usableCards.length;
          setDefaultCardName('Choose a default Tap Card');
          setDefaultCardFields(`${count} ${count === 1 ? 'Tap Card' : 'Tap Cards'} ready · Choose a default for quick sharing`);
        } else if (active) {
          setDefaultCardName('Set up a Tap Card');
          setDefaultCardFields('Choose what you are ready to share');
        }
      } catch {
        if (active) {
          setDefaultCardName('Tap Cards unavailable');
          setDefaultCardFields('Open Tap Cards to retry');
        }
      }
    })();

    return () => { active = false; };
  }, [hasSession, role]));

  useEffect(() => {
    if (role !== 'personal' || !hasSession) return;
    let active = true;
    Promise.resolve().then(async () => {
      const review = await getPendingReview();
      if (active && review) {
        const request = review.request;
        router.push({ pathname: '/review', params: { sessionId: request.sessionId, orgName: request.organizationName, purpose: request.purpose, templateName: request.templateName, retention: request.retentionDescription, fields: JSON.stringify(request.fields), questions: JSON.stringify(request.questions), expiresAt: request.expiresAt, verification: request.organizationStatus } });
        return;
      }
      const pending = await getLatestPendingRequest();
      if (active && pending) router.push({ pathname: '/incoming', params: { pendingId: pending.pendingId } });
    });
    return () => { active = false; };
  }, [hasSession, role]);

  const complete = FIELD_REGISTRY.filter((field) => Boolean(vault[field.key])).length;
  const percent = Math.round((complete / FIELD_REGISTRY.length) * 100);
  const firstName = displayName.trim().split(/\s+/)[0] || 'there';
  const greeting = new Date().getHours() < 12 ? 'GOOD MORNING' : new Date().getHours() < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const canSwitch = __DEV__ && developerToolsUnlocked;

  return <Page>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View style={styles.brand}><View style={styles.mark}><TapFormMark size={19} color={colors.ink} /></View><Text style={styles.brandName}>TapForm</Text></View>
        <Pressable onPress={() => canSwitch ? setSwitcher((value) => !value) : router.push('/(tabs)/profile')} accessibilityRole="button" accessibilityLabel={canSwitch ? 'Developer role preview' : 'Open profile'} style={styles.avatar}><Text style={styles.avatarText}>{role === 'personal' ? (displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || 'TF').toUpperCase() : organizationName.slice(0, 2).toUpperCase()}</Text></Pressable>
      </View>
      {canSwitch && switcher ? <Surface style={styles.switchSurface}><Eyebrow>DEVELOPMENT PREVIEW</Eyebrow><View style={styles.switchRow}><Button title="Personal" variant={role === 'personal' ? 'primary' : 'secondary'} onPress={() => { setRole('personal'); setSwitcher(false); }} /><Button title="Organization" variant={role === 'organization' ? 'primary' : 'secondary'} onPress={() => { setRole('organization'); setSwitcher(false); }} /></View></Surface> : null}

      {role === 'personal' ? <>
        <View style={styles.greetingBlock}><Eyebrow>{greeting}</Eyebrow><Text style={styles.greeting}>Hello, {firstName}</Text><Body>Your information. Your control.</Body></View>
        <Surface style={styles.tapHero} accessibilityRole="summary" accessibilityLabel={personalNfcReady ? 'Ready to receive TapForm requests over NFC' : 'Ready to receive TapForm requests by QR code'}>
          <View style={styles.tapCopy}><Eyebrow>{personalNfcReady ? 'NFC · READY' : 'READY FOR REQUESTS'}</Eyebrow><Text style={styles.tapTitle}>Requests come to you.</Text><Text style={styles.tapSub}>Nothing is shared until you approve.</Text></View>
          <NfcWaveVisual state="ready" size={126} label="TapForm request receiver ready" />
        </Surface>
        <View><SectionTitle>Ready to share</SectionTitle><Surface style={styles.workspace}>
          <QuickRow title={defaultCardName} detail={defaultCardFields} onPress={() => router.push('/tap-cards' as never)} />
          <View style={styles.rule} />
          <QuickRow title="Scan a TapForm QR" detail="Open an organization request or receive a Tap Card" onPress={() => router.push('/scan')} />
        </Surface></View>
        <Pressable onPress={() => router.push('/(tabs)/vault')} accessibilityRole="button" accessibilityLabel={vaultSummaryState === 'ready' ? `My Vault, ${complete} of ${FIELD_REGISTRY.length} fields saved` : vaultSummaryState === 'checking' ? 'My Vault, checking saved details' : 'My Vault could not be loaded, open to retry'} style={styles.vaultSummary}>
          <View style={styles.sectionTop}><View><Eyebrow>YOUR VAULT</Eyebrow><Text style={styles.vaultPercent}>{vaultSummaryState === 'ready' ? <>{percent}<Text style={styles.percentSuffix}>% complete</Text></> : vaultSummaryState === 'checking' ? 'Checking…' : 'Unavailable'}</Text></View><Shield size={21} color={colors.muted} /></View>
          {vaultSummaryState === 'ready' ? <AnimatedProgress value={percent / 100} style={styles.progressTrack} /> : null}
          <View style={styles.vaultFooter}><Text style={styles.vaultCaption}>{vaultSummaryState === 'ready' ? `${complete} of ${FIELD_REGISTRY.length} fields saved` : vaultSummaryState === 'checking' ? 'Loading your saved details' : 'Tap to open your Vault and retry'}</Text><ChevronRight size={18} color={colors.muted} /></View>
        </Pressable>
        <View><View style={styles.sectionHeader}><Text style={styles.recentTitle}>Recent activity</Text><Pressable onPress={() => router.push('/(tabs)/activity')} accessibilityRole="button" style={styles.seeAll}><Text style={styles.seeAllText}>See all</Text></Pressable></View>{recent.length ? <Surface style={styles.list}>{recent.map((item, index) => <View key={item.id}>{index > 0 ? <View style={styles.rule} /> : null}<Pressable onPress={() => router.push('/(tabs)/activity')} style={styles.activityRow}><View style={styles.activityMark}><Text style={styles.activityInitial}>{item.organization.slice(0, 1).toUpperCase()}</Text></View><View style={styles.activityText}><Text numberOfLines={1} style={styles.activityOrg}>{item.organization}</Text><Text style={styles.activityMeta}>{item.template} · {new Date(item.createdAt).toLocaleDateString()}</Text></View><Text style={styles.activityStatus}>{item.status === 'approved' ? 'SHARED' : item.status.toUpperCase()}</Text></Pressable></View>)}</Surface> : <Surface style={styles.empty}><Text style={styles.emptyTitle}>No activity yet</Text><Body>Requests you review will appear here.</Body></Surface>}</View>
        <View style={styles.privacy}><LockKeyhole size={15} color={colors.muted} /><Text style={styles.privacyText}>Your vault stays private until you choose to share.</Text></View>
      </> : <>
        <View style={styles.greetingBlock}><Eyebrow>ORGANIZATION</Eyebrow><Text style={styles.greetingOrg}>{organizationName}</Text><Text style={styles.unverified}>UNVERIFIED ORGANIZATION</Text></View>
        <Pressable onPress={() => templateId ? router.push({ pathname: '/nfc', params: { templateId } }) : router.push('/(tabs)/templates')} accessibilityRole="button" accessibilityLabel="Start an information request" style={({ pressed }) => [styles.requestHero, pressed && styles.pressed]}>
          <View style={styles.requestTop}><View style={styles.requestSymbol}><ArrowUpRight size={21} color={colors.primaryButtonText} /></View><Eyebrow>{templateId ? 'READY TO REQUEST' : 'SETUP REQUIRED'}</Eyebrow></View>
          <Text style={styles.requestTitle}>{templateName}</Text><Text style={styles.requestPurpose}>{templatePurpose}</Text>
          <View style={styles.requestAction}><Text style={styles.requestActionText}>{templateId ? 'Start request' : 'Create a template'}</Text><ArrowUpRight size={17} color={colors.primaryButtonText} /></View>
        </Pressable>
        <View><SectionTitle trailing="Manage">Workspace</SectionTitle><Surface style={styles.workspace}><QuickRow title="Request templates" detail="Create and manage requests" onPress={() => router.push('/(tabs)/templates')} /><View style={styles.rule} /><QuickRow title="Submissions" detail="Approved information only" onPress={() => router.push('/(tabs)/submissions')} /></Surface></View>
        <View style={styles.privacy}><Clock3 size={15} color={colors.muted} /><Text style={styles.privacyText}>Each request expires after two minutes.</Text></View>
      </>}
      {canSwitch && demo && role === 'personal' && Object.keys(vault).length ? <Text style={styles.demoLabel}>FICTIONAL DEVELOPMENT DATA</Text> : null}
    </ScrollView>
  </Page>;
}

function QuickRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`}><View style={{ flex: 1, gap: 4 }}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickDetail}>{detail}</Text></View><ChevronRight size={19} color={colors.subtle} /></Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 25, paddingBottom: space.xl }, top: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, mark: { width: 31, height: 31, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, brandName: { color: colors.ink, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 }, avatar: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  greetingBlock: { gap: 7, paddingTop: 3 }, greeting: { color: colors.ink, fontSize: 31, lineHeight: 37, letterSpacing: -0.8, fontWeight: '500' }, greetingOrg: { color: colors.ink, fontSize: 26, lineHeight: 33, fontWeight: '600', letterSpacing: -0.5 }, unverified: { color: colors.muted, fontSize: 9, letterSpacing: 1.3, fontWeight: '700', marginTop: 1 },
  tapHero: { minHeight: 158, borderRadius: radius.hero, padding: 17, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, tapCopy: { flex: 1, gap: 8 }, tapTitle: { color: colors.ink, fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3 }, tapSub: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  vaultSummary: { gap: 13, paddingVertical: 2 }, sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, vaultPercent: { marginTop: 3, color: colors.ink, fontSize: 24, fontWeight: '500', fontVariant: ['tabular-nums'] }, percentSuffix: { color: colors.muted, fontSize: 13, fontWeight: '400' }, progressTrack: { height: 4, borderRadius: 4, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' }, progressValue: { height: 4, backgroundColor: colors.ink, borderRadius: 4 }, vaultFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, vaultCaption: { color: colors.muted, fontSize: 12 },
  list: { paddingHorizontal: 14, paddingVertical: 2 }, sectionHeader: { minHeight: 40, marginBottom: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, recentTitle: { fontSize: 17, color: colors.ink, fontWeight: '600' }, seeAll: { minWidth: 44, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' }, seeAllText: { color: colors.muted, fontSize: 13, fontWeight: '600' }, activityRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11 }, activityMark: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, activityInitial: { color: colors.ink, fontSize: 12, fontWeight: '600' }, activityText: { flex: 1, gap: 4 }, activityOrg: { color: colors.ink, fontSize: 13, fontWeight: '500' }, activityMeta: { color: colors.muted, fontSize: 10 }, activityStatus: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }, empty: { padding: 16, gap: 6 }, emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' }, rule: { height: 1, backgroundColor: colors.lineSubtle }, privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, privacyText: { color: colors.muted, fontSize: 11 },
  requestHero: { padding: 20, minHeight: 226, borderRadius: radius.hero, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'space-between', gap: 13 }, requestTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, requestSymbol: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.primaryButton, alignItems: 'center', justifyContent: 'center', marginRight: 2 }, requestTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 }, requestPurpose: { color: colors.muted, fontSize: 13, lineHeight: 19 }, requestAction: { minHeight: 46, marginTop: 1, borderRadius: radius.pill, backgroundColor: colors.primaryButton, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, requestActionText: { color: colors.primaryButtonText, fontSize: 14, fontWeight: '600' }, pressed: { opacity: 0.88 }, workspace: { paddingHorizontal: 15, paddingVertical: 0 }, quickRow: { minHeight: 66, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, quickTitle: { color: colors.ink, fontSize: 13, fontWeight: '500' }, quickDetail: { color: colors.muted, fontSize: 11 }, switchSurface: { gap: 12 }, switchRow: { flexDirection: 'row', gap: 9 }, demoLabel: { color: colors.subtle, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center' },
});
