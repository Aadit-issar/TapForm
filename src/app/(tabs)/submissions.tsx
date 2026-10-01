import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, FileCheck2, Search, Shield, ShieldX, Clock3 } from 'lucide-react-native';
import { Body, Button, Eyebrow, Input, Page, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY } from '@/domain/fields';
import { supabase } from '@/services/supabase';
import { FadeInSection } from '@/components/motion/MotionPrimitives';
import { selection } from '@/services/haptics';

type StateFilter = 'all' | 'approved' | 'declined' | 'expired';
type QuestionInfo = { id: string; prompt: string; question_type: string; display_order: number };
type Entry = {
  id: string; responseId?: string; createdAt: string; status: string; requestName: string; purpose: string;
  fields: { field_key: string; value_snapshot: string }[]; answers: Record<string, unknown>; answerCount: number;
  versionId: string; questions: QuestionInfo[];
};
const PAGE_SIZE = 40;

function statusLabel(status: string): string {
  if (status === 'approved') return 'Completed';
  if (status === 'declined') return 'Declined';
  if (status === 'expired') return 'Expired';
  if (status === 'awaiting_consent') return 'Awaiting review';
  return 'Open';
}

export default function SubmissionsScreen() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<StateFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const focusEpoch = useRef(0);
  const orgIdRef = useRef('');

  const loadPage = useCallback(async (orgId: string, offset: number, append: boolean, epoch = focusEpoch.current) => {
    if (!supabase) throw new Error('Connect TapForm to your organization workspace.');
    const { data: sessions, error: queryError } = await supabase.from('request_sessions')
      .select('id,status,created_at,template_version_id,request_responses(id,status,created_at,answers,answer_count,shared_field_count,shared_values(field_key,value_snapshot))')
      .eq('organization_id', orgId).order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (focusEpoch.current !== epoch) return;
    if (queryError) throw new Error('Submissions could not be loaded. Check your connection and retry.');
    const sessionRows = sessions || [];
    const versionIds = [...new Set(sessionRows.map((row) => row.template_version_id).filter(Boolean))];
    const versions = versionIds.length ? await supabase.from('request_template_versions')
      .select('id,name,purpose,request_template_version_questions(id,prompt,question_type,display_order)')
      .in('id', versionIds) : { data: [], error: null };
    if (focusEpoch.current !== epoch) return;
    if (versions.error) throw new Error('Request details could not be loaded. Check your connection and retry.');
    const byVersion = new Map((versions.data || []).map((version) => [version.id, version]));
    const page = sessionRows.map((session) => {
      const response = Array.isArray(session.request_responses) ? session.request_responses[0] : session.request_responses;
      const version = byVersion.get(session.template_version_id);
      const questionRows = version?.request_template_version_questions as unknown as QuestionInfo[] | undefined;
      return {
        id: session.id, responseId: response?.id, createdAt: response?.created_at || session.created_at,
        status: response?.status || session.status, requestName: version?.name || 'Request', purpose: version?.purpose || '',
        fields: response?.shared_values || [], answers: (response?.answers || {}) as Record<string, unknown>,
        answerCount: response?.answer_count || 0, versionId: session.template_version_id,
        questions: (questionRows || []).slice().sort((a, b) => a.display_order - b.display_order),
      } satisfies Entry;
    });
    setRows((current) => append ? [...current, ...page] : page);
    setError('');
    setNextOffset(offset + sessionRows.length);
    setHasMore(sessionRows.length === PAGE_SIZE);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const epoch = ++focusEpoch.current;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let replicationReadyTimer: ReturnType<typeof setTimeout> | undefined;
    let replicationReady = false;
    let refreshInFlight = false;
    let refreshPending = false;
    const refreshAfterChange = () => {
      if (!active) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!active) return;
        if (refreshInFlight) { refreshPending = true; return; }
        refreshInFlight = true;
        void loadPage(orgIdRef.current, 0, false, epoch).catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Submissions could not be refreshed.');
        }).finally(() => {
          refreshInFlight = false;
          if (active && refreshPending) { refreshPending = false; refreshAfterChange(); }
        });
      }, 120);
    };
    setLoading(true); setError('');
    setRealtimeStatus('connecting');
    void (async () => {
      if (!supabase) { setRows([]); setError('Connect TapForm to load organization submissions.'); setLoading(false); return; }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { setRows([]); setError('Sign in again to open submissions.'); setLoading(false); return; }
      const { data: members, error: memberError } = await supabase.from('organization_members').select('organization_id').eq('user_id', auth.user.id).limit(1);
      if (!active) return;
      const orgId = members?.[0]?.organization_id;
      if (memberError || !orgId) { setRows([]); setError(memberError ? 'Your organization could not be loaded.' : 'Create or join an organization to view submissions.'); setLoading(false); return; }
      orgIdRef.current = orgId;
      setOrganizationId(orgId);
      try {
        refreshInFlight = true;
        await loadPage(orgId, 0, false, epoch);
        refreshInFlight = false;
        if (active) {
          const markReplicationReady = () => {
            if (!active || replicationReady) return;
            replicationReady = true;
            if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
            setRealtimeStatus('live');
            refreshAfterChange();
          };
          channel = supabase.channel(`submissions-${orgId}-${reloadCount}`, { config: { broadcast: { replication_ready: true } } })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'request_responses' }, refreshAfterChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'request_sessions', filter: `organization_id=eq.${orgId}` }, refreshAfterChange)
            .on('system', {}, (payload) => {
              if (payload.extension !== 'system') return;
              if (payload.status === 'ok') markReplicationReady();
              else if (payload.status === 'error') {
                if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
                setRealtimeStatus('unavailable');
                refreshAfterChange();
              }
            })
            .subscribe((status) => {
              if (!active) return;
              if (status === 'SUBSCRIBED') {
                replicationReady = false;
                setRealtimeStatus('connecting');
                refreshAfterChange();
                replicationReadyTimer = setTimeout(() => {
                  if (active && !replicationReady) {
                    setRealtimeStatus('unavailable');
                    refreshAfterChange();
                  }
                }, 5000);
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
                setRealtimeStatus('unavailable');
              }
            });
        }
      } catch (cause) { refreshInFlight = false; if (active) { setRows([]); setError(cause instanceof Error ? cause.message : 'Submissions could not be loaded.'); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; focusEpoch.current += 1; if (refreshTimer) clearTimeout(refreshTimer); if (replicationReadyTimer) clearTimeout(replicationReadyTimer); if (channel && supabase) void supabase.removeChannel(channel); };
  }, [loadPage, reloadCount]));

  const refreshNow = useCallback(async () => {
    if (!organizationId || !supabase || refreshing) return;
    setRefreshing(true); setError('');
    try { await loadPage(organizationId, 0, false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Submissions could not be refreshed.'); }
    finally { setRefreshing(false); }
  }, [loadPage, organizationId, refreshing]);

  const loadMore = async () => {
    if (!organizationId || loadingMore || !hasMore) return;
    setLoadingMore(true); setError('');
    try { await loadPage(organizationId, nextOffset, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'More submissions could not be loaded.'); }
    finally { setLoadingMore(false); }
  };

  const visibleRows = rows.filter((row) => (filter === 'all' || row.status === filter)
    && (!search.trim() || `${row.requestName} ${row.purpose} ${row.fields.map((field) => field.value_snapshot).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())));
  const filters: { key: StateFilter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'approved', label: 'Completed' }, { key: 'declined', label: 'Declined' }, { key: 'expired', label: 'Expired' }];

  return <Page><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshNow()} colors={[colors.ink]} progressBackgroundColor={colors.surface} tintColor={colors.ink} />}>
    <View><Eyebrow>ORGANIZATION INBOX</Eyebrow><Title>Submissions</Title><Body>Each person’s request result and approved snapshot, in one place.</Body></View>
    {realtimeStatus === 'unavailable' ? <Text accessibilityRole="alert" style={styles.liveNotice}>Live updates paused. Pull down to refresh.</Text> : null}
    <View style={styles.search}><Search size={17} color={colors.muted} /><Input label="Search submissions" value={search} onChangeText={setSearch} placeholder="Name or request" /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>{filters.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: filter === item.key }} onPress={() => { selection(); setFilter(item.key); }} style={[styles.filter, filter === item.key && styles.filterSelected]}><Text style={[styles.filterText, filter === item.key && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}</ScrollView>
    {error ? <Surface style={styles.error}><Text accessibilityRole="alert" style={styles.body}>{error}</Text>{!loading ? <Button title="Retry" variant="secondary" onPress={() => { setLoading(true); setReloadCount((value) => value + 1); }} /> : null}</Surface> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Body>Loading submissions</Body></View> : null}
    {!loading && !error && visibleRows.length ? visibleRows.map((row, index) => {
      const participant = row.fields.find((item) => item.field_key === 'full_name')?.value_snapshot || 'Participant';
      return <FadeInSection key={row.id} delay={Math.min(index, 5) * 20}><Surface style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${participant}, ${row.requestName}, ${statusLabel(row.status)}`} accessibilityState={{ expanded: expanded === row.id }} onPress={() => setExpanded((old) => old === row.id ? null : row.id)} style={styles.cardHead}>
          <View style={styles.icon}>{row.status === 'approved' ? <Check size={18} color={colors.ink} /> : row.status === 'declined' ? <ShieldX size={18} color={colors.muted} /> : row.status === 'expired' ? <Clock3 size={18} color={colors.muted} /> : <FileCheck2 size={18} color={colors.ink} />}</View>
          <View style={styles.headCopy}><Text numberOfLines={1} style={styles.person}>{participant}</Text><Text numberOfLines={2} style={styles.purpose}>{row.requestName}{row.purpose ? ` · ${row.purpose}` : ''}</Text><Text style={styles.meta}>{countLabel(row.fields.length, 'Vault field')} · {countLabel(row.answerCount, 'answer')} · {new Date(row.createdAt).toLocaleString()}</Text></View>
          <View style={styles.statusIcon}>{row.status === 'approved' ? <Shield size={15} color={colors.muted} /> : null}{expanded === row.id ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}</View>
        </Pressable>
        {expanded === row.id ? <><View style={styles.rule} /><Text style={styles.status}>{statusLabel(row.status)}</Text>
          {row.status === 'approved' && row.fields.length ? <><Text style={styles.sectionLabel}>INFORMATION APPROVED</Text>{row.fields.map((field) => <View key={field.field_key} style={styles.valueRow}><Text style={styles.label}>{FIELD_REGISTRY.find((item) => item.key === field.field_key)?.label || 'Shared detail'}</Text><Text selectable style={styles.value}>{field.value_snapshot}</Text></View>)}</> : null}
          {row.status === 'approved' && row.questions.length && row.answerCount ? <><Text style={styles.sectionLabel}>ONE-TIME ANSWERS</Text>{row.questions.map((question) => { const value = row.answers[question.id]; if (value === undefined || value === null || value === '') return null; return <View key={question.id} style={styles.valueRow}><Text style={styles.label}>{question.prompt}</Text><Text selectable style={styles.value}>{Array.isArray(value) ? value.join(', ') : String(value)}</Text></View>; })}</> : null}
          {row.status !== 'approved' ? <Body>No information was shared with this request.</Body> : null}
          {row.status === 'approved' ? <View style={styles.receipt}><Shield size={14} color={colors.muted} /><Text style={styles.receiptText}>Immutable receipt · {countLabel(row.fields.length, 'field')} · {countLabel(row.answerCount, 'answer')}</Text></View> : null}
        </> : null}
      </Surface></FadeInSection>;
    }) : null}
    {!loading && !error && visibleRows.length === 0 ? <FadeInSection><Surface style={styles.empty}><View style={styles.icon}><FileCheck2 size={19} color={colors.ink} /></View><Text style={styles.emptyTitle}>{rows.length ? 'No matching submissions' : 'No submissions yet'}</Text><Body style={styles.center}>{rows.length ? 'Try another search or status filter.' : 'Approved information appears here only after someone reviews and accepts a request.'}</Body></Surface></FadeInSection> : null}
    {hasMore && !search ? <Button title="Load older submissions" variant="secondary" loading={loadingMore} onPress={() => void loadMore()} /> : null}
  </ScrollView></Page>;
}

function countLabel(count: number, singular: string) { return `${count} ${count === 1 ? singular : `${singular}s`}`; }

const styles = StyleSheet.create({
  content: { gap: 17, paddingBottom: space.xl }, liveNotice: { color: colors.muted, fontSize: 12 }, search: { flexDirection: 'row', alignItems: 'center', gap: 8 }, filterList: { gap: 7 }, filter: { minHeight: 48, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line }, filterSelected: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { color: colors.muted, fontSize: 11, fontWeight: '600' }, filterTextSelected: { color: colors.canvas }, card: { gap: 12 }, cardHead: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 }, headCopy: { flex: 1, gap: 4 }, icon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, person: { fontSize: 14, color: colors.ink, fontWeight: '600' }, purpose: { fontSize: 11, color: colors.muted, lineHeight: 16 }, meta: { color: colors.subtle, fontSize: 9, lineHeight: 14 }, statusIcon: { minWidth: 20, alignItems: 'center', gap: 4 }, rule: { height: 1, backgroundColor: colors.line }, status: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }, sectionLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingTop: 2 }, valueRow: { gap: 4, paddingVertical: 4 }, label: { fontSize: 10, color: colors.muted }, value: { color: colors.ink, fontSize: 13, fontWeight: '500' }, receipt: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, flexDirection: 'row', gap: 7, alignItems: 'center' }, receiptText: { color: colors.muted, fontSize: 10 }, loading: { minHeight: 120, justifyContent: 'center', alignItems: 'center', gap: 12 }, error: { gap: 12 }, body: { color: colors.muted, fontSize: 13, lineHeight: 19 }, empty: { paddingVertical: 34, alignItems: 'center', gap: 11 }, emptyTitle: { fontSize: 16, color: colors.ink, fontWeight: '700' }, center: { maxWidth: 300, textAlign: 'center' },
});
