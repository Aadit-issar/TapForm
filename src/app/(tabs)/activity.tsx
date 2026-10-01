import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Archive, Check, ChevronRight, Clock3, ContactRound, Copy, FileCheck2, Inbox as InboxIcon, Share2, ShieldX } from 'lucide-react-native';
import { Body, Button, Eyebrow, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY } from '@/domain/fields';
import { inboxRequestStatus } from '@/domain/exchange';
import { countLabel } from '@/domain/countLabel';
import { FadeInSection } from '@/components/motion/MotionPrimitives';
import { archiveReceivedCard, setReceivedCardSaved } from '@/services/tapCards';
import { getPendingReview, savePendingReview } from '@/services/pendingReview';
import { getJoinedRequest } from '@/services/requests';
import { getPendingPeerForExchange } from '@/services/pendingPeer';
import { supabase } from '@/services/supabase';
import { error as errorHaptic, selection, success } from '@/services/haptics';

type InboxTab = 'requests' | 'received' | 'sent';
type RequestEntry = { id: string; kind: 'organization' | 'peer'; title: string; detail: string; status: string; createdAt: string; expiresAt?: string; fields: number; answers: number };
type ReceivedEntry = { id: string; transferId: string; sender: string; card: string; values: Record<string, string>; fieldCount: number; createdAt: string; saved: boolean };
type SentEntry = { id: string; recipient: string; title: string; detail: string; fieldCount: number; answerCount: number; createdAt: string; kind: 'organization' | 'peer' };

const tabs: { key: InboxTab; label: string }[] = [
  { key: 'requests', label: 'Requests' }, { key: 'received', label: 'Received' }, { key: 'sent', label: 'Sent' },
];
const friendlyStatus = (status: string) => ({ awaiting_consent: 'Needs review', created: 'Open', approved: 'Completed', completed: 'Completed', declined: 'Declined', expired: 'Expired', revoked: 'Unavailable', pending: 'Needs review' }[status] || 'Unavailable');

export default function ActivityScreen() {
  const [tab, setTab] = useState<InboxTab>('requests');
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [received, setReceived] = useState<ReceivedEntry[]>([]);
  const [sent, setSent] = useState<SentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async (showLoading = true, isCurrent: () => boolean = () => true) => {
    if (!supabase) { if (isCurrent()) { setLoading(false); setError('Connect to TapForm to open your Inbox.'); } return; }
    if (!isCurrent()) return;
    if (showLoading) setLoading(true);
    setError('');
    try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (!isCurrent()) return;
    if (authError || !auth.user) { setError('Sign in again to open your Inbox.'); return; }
    const userId = auth.user.id;
    const [sessionResult, peerResult, receivedResult, sentPeerResult, sentRequestResult] = await Promise.all([
      supabase.from('request_sessions').select('id,status,created_at,expires_at,organizations(name),request_template_versions(name),request_responses(id,status,shared_field_count,answer_count)').eq('joined_user_id', userId).order('created_at', { ascending: false }).limit(40),
      supabase.from('peer_exchange_sessions').select('id,status,created_at,expires_at,sender_name_snapshot').eq('receiver_user_id', userId).order('created_at', { ascending: false }).limit(40),
      supabase.from('received_cards').select('id,saved_at,created_at,peer_transfers(id,sender_name_snapshot,card_name_snapshot,values_snapshot,field_count,completed_at)').is('archived_at', null).order('created_at', { ascending: false }).limit(40),
      supabase.from('peer_transfers').select('id,card_name_snapshot,field_count,completed_at,receiver_name_snapshot').eq('sender_user_id', userId).order('completed_at', { ascending: false }).limit(40),
      supabase.from('request_responses').select('id,status,created_at,answer_count,shared_field_count,shared_values(field_key),request_sessions(organizations(name),request_template_versions(name))').eq('personal_user_id', userId).order('created_at', { ascending: false }).limit(40),
    ]);
    if (!isCurrent()) return;
    const queryError = sessionResult.error || peerResult.error || receivedResult.error || sentPeerResult.error || sentRequestResult.error;
    if (queryError) { setError('Your Inbox could not be refreshed. Check your connection and retry.'); return; }

    const sessions = (sessionResult.data || []).map((row) => {
      const organization = row.organizations as unknown as { name?: string } | null;
      const template = row.request_template_versions as unknown as { name?: string } | null;
      const response = Array.isArray(row.request_responses) ? row.request_responses[0] : row.request_responses;
      return { id: row.id, kind: 'organization' as const, title: organization?.name || 'Organization', detail: template?.name || 'Information request', status: response?.status || row.status, createdAt: row.created_at, expiresAt: row.expires_at, fields: response?.shared_field_count || 0, answers: response?.answer_count || 0 };
    });
    const peers = (peerResult.data || []).map((row) => {
      return { id: row.id, kind: 'peer' as const, title: row.sender_name_snapshot || 'TapForm member', detail: 'Tap Card exchange', status: row.status, createdAt: row.created_at, expiresAt: row.expires_at, fields: 0, answers: 0 };
    });
    setNow(Date.now());
    setRequests([...sessions, ...peers].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    setReceived((receivedResult.data || []).flatMap((row) => {
      const transfer = Array.isArray(row.peer_transfers) ? row.peer_transfers[0] : row.peer_transfers;
      if (!transfer) return [];
      const values = transfer.values_snapshot && typeof transfer.values_snapshot === 'object' ? transfer.values_snapshot as Record<string, string> : {};
      return [{ id: row.id, transferId: transfer.id, sender: transfer.sender_name_snapshot, card: transfer.card_name_snapshot, values, fieldCount: transfer.field_count, createdAt: transfer.completed_at || row.created_at, saved: Boolean(row.saved_at) }];
    }));
    const peerSent = (sentPeerResult.data || []).map((row) => {
      return { id: row.id, recipient: row.receiver_name_snapshot || 'TapForm member', title: row.card_name_snapshot, detail: 'Personal Tap Card', fieldCount: row.field_count, answerCount: 0, createdAt: row.completed_at, kind: 'peer' as const };
    });
    const requestSent = (sentRequestResult.data || []).map((row) => {
      const session = row.request_sessions as unknown as { organizations?: { name?: string }; request_template_versions?: { name?: string } } | null;
      return { id: row.id, recipient: session?.organizations?.name || 'Organization', title: session?.request_template_versions?.name || 'Request', detail: friendlyStatus(row.status), fieldCount: row.shared_field_count, answerCount: row.answer_count, createdAt: row.created_at, kind: 'organization' as const };
    });
    setSent([...peerSent, ...requestSent].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch {
      if (isCurrent()) setError('Your Inbox could not be refreshed. Check your connection and retry.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const refreshInbox = useCallback(() => {
    setRefreshing(true);
    void reload(false).finally(() => setRefreshing(false));
  }, [reload]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let replicationReadyTimer: ReturnType<typeof setTimeout> | undefined;
    let replicationReady = false;
    let refreshInFlight = false;
    let refreshPending = false;
    const finishRefresh = () => {
      refreshInFlight = false;
      if (alive && refreshPending) { refreshPending = false; scheduleRefresh(); }
    };
    const scheduleRefresh = () => {
      if (!alive) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!alive) return;
        if (refreshInFlight) { refreshPending = true; return; }
        refreshInFlight = true;
        void reload(false, () => alive).finally(finishRefresh);
      }, 180);
    };
    refreshInFlight = true;
    void reload(true, () => alive).finally(finishRefresh);
    setRealtimeStatus('connecting');
    if (!supabase) return () => { alive = false; };
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const userId = data.user.id;
      const markReplicationReady = () => {
        if (!alive || replicationReady) return;
        replicationReady = true;
        if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
        setRealtimeStatus('live');
        scheduleRefresh();
      };
      channel = supabase!.channel(`inbox-${userId}`, { config: { broadcast: { replication_ready: true } } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'request_responses', filter: `personal_user_id=eq.${userId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'request_sessions', filter: `joined_user_id=eq.${userId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'received_cards', filter: `receiver_user_id=eq.${userId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'peer_transfers', filter: `receiver_user_id=eq.${userId}` }, scheduleRefresh)
        .on('system', {}, (payload) => {
          if (payload.extension !== 'system') return;
          if (payload.status === 'ok') markReplicationReady();
          else if (payload.status === 'error') {
            if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
            setRealtimeStatus('unavailable');
            scheduleRefresh();
          }
        })
        .subscribe((status) => {
          if (!alive) return;
          if (status === 'SUBSCRIBED') {
            replicationReady = false;
            setRealtimeStatus('connecting');
            scheduleRefresh();
            replicationReadyTimer = setTimeout(() => {
              if (alive && !replicationReady) { setRealtimeStatus('unavailable'); scheduleRefresh(); }
            }, 5000);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (replicationReadyTimer) clearTimeout(replicationReadyTimer);
            setRealtimeStatus('unavailable');
          }
        });
    });
    return () => { alive = false; if (refreshTimer) clearTimeout(refreshTimer); if (replicationReadyTimer) clearTimeout(replicationReadyTimer); if (channel) void supabase!.removeChannel(channel); };
  }, [reload]));

  useEffect(() => {
    const nextExpiry = requests.reduce((earliest, entry) => {
      if (!['created', 'awaiting_consent', 'pending', 'in_progress'].includes(entry.status) || !entry.expiresAt) return earliest;
      const expiry = Date.parse(entry.expiresAt);
      return Number.isFinite(expiry) && expiry > now ? Math.min(earliest, expiry) : earliest;
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - now + 10));
    return () => clearTimeout(timer);
  }, [now, requests]);

  const copyValue = async (value: string) => {
    await Clipboard.setStringAsync(value);
    setNotice('Copied to clipboard.');
    setTimeout(() => setNotice(''), 2200);
  };

  const exportContact = async (item: ReceivedEntry) => {
    try {
      const permission = await getPermissionsAsync();
      const access = permission.granted ? permission : await requestPermissionsAsync();
      if (!access.granted) { Alert.alert('Contacts access is off', 'Allow Contacts access only if you want TapForm to add this card to your address book.'); return; }
      const fullName = item.values.full_name || item.sender;
      const nameParts = fullName.trim().split(/\s+/);
      const contact = await Contact.create({
        givenName: nameParts.shift() || fullName,
        familyName: nameParts.join(' '),
        company: item.values.institution,
        phones: [item.values.phone, item.values.emergency_phone].filter(Boolean).map((number) => ({ label: 'mobile', number: number! })),
        emails: [item.values.email, item.values.emergency_email].filter(Boolean).map((address) => ({ label: 'other', address: address! })),
      });
      void contact;
      success();
      setNotice(`Saved ${fullName} to Contacts.`); setTimeout(() => setNotice(''), 2500);
    } catch { errorHaptic(); Alert.alert('Could not save contact', 'TapForm could not add this card to your Contacts. You can still copy each shared detail.'); }
  };

  const toggleSaved = async (item: ReceivedEntry) => {
    try { await setReceivedCardSaved(item.id, !item.saved); setReceived((old) => old.map((card) => card.id === item.id ? { ...card, saved: !card.saved } : card)); success(); }
    catch { errorHaptic(); setError('That received card could not be updated. Retry when you are online.'); }
  };
  const archiveCard = (item: ReceivedEntry) => Alert.alert('Remove received card?', `The card from ${item.sender} will be archived from your Inbox.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void archiveReceivedCard(item.id).then(() => { setReceived((old) => old.filter((card) => card.id !== item.id)); success(); }).catch(() => { errorHaptic(); setError('That received card could not be removed. Retry when you are online.'); }); } },
  ]);

  const openRequest = async (entry: RequestEntry) => {
    setError('');
    if (entry.kind === 'peer') {
      const pending = await getPendingPeerForExchange(entry.id);
      if (pending) router.push({ pathname: '/share' as never, params: { token: pending.token } });
      else setError('This Tap Card exchange could not be restored. Ask the sender to share it again.');
      return;
    }
    if (entry.status !== 'awaiting_consent') return;
    try {
      const cached = await getPendingReview(entry.id);
      const request = cached?.request ?? await getJoinedRequest(entry.id);
      await savePendingReview(request);
      router.push({ pathname: '/review', params: {
        sessionId: request.sessionId, orgName: request.organizationName, purpose: request.purpose,
        templateName: request.templateName, retention: request.retentionDescription,
        fields: JSON.stringify(request.fields), questions: JSON.stringify(request.questions),
        expiresAt: request.expiresAt, verification: request.organizationStatus,
      } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This request could not be reopened.'); }
  };

  const title = tab === 'requests' ? 'Requests' : tab === 'received' ? 'Received' : 'Sent';
  return <Page><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshInbox} colors={[colors.ink]} progressBackgroundColor={colors.surface} />}>
    <View><Eyebrow>TAPFORM INBOX</Eyebrow><Title>{title}</Title><Body>Requests, received cards, and your sharing receipts.</Body></View>
    {realtimeStatus === 'unavailable' ? <Text accessibilityLiveRegion="polite" style={styles.liveNotice}>Live updates paused. Pull down to refresh.</Text> : null}
    <View accessibilityRole="tablist" style={styles.tabs}>{tabs.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => { selection(); setTab(item.key); setExpanded(null); setError(''); }} style={[styles.tab, tab === item.key && styles.tabSelected]}><Text style={[styles.tabText, tab === item.key && styles.tabTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {error ? <Surface style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Button title="Retry" variant="secondary" onPress={() => void reload()} /></Surface> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Body>Refreshing your Inbox…</Body></View> : null}
    {!loading && !error && tab === 'requests' ? requests.length ? <>
      <SectionTitle trailing={`${requests.length}`}>Recent requests</SectionTitle>
      <Surface style={styles.list}>{requests.map((item, index) => { const visibleStatus = inboxRequestStatus(item.status, item.expiresAt, now); return <FadeInSection key={`${item.kind}-${item.id}`} delay={Math.min(index, 5) * 20}><View>{index ? <View style={styles.rule} /> : null}<Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.detail}, ${friendlyStatus(visibleStatus)}`} onPress={() => openRequest(item)} style={styles.row}>
        <View style={styles.icon}>{item.status === 'approved' || item.status === 'completed' ? <Check size={17} color={colors.ink} /> : item.status === 'declined' ? <ShieldX size={17} color={colors.muted} /> : <Clock3 size={17} color={colors.muted} />}</View>
        <View style={styles.copy}><Text style={styles.primary}>{item.title}</Text><Text style={styles.secondary}>{item.detail} · {new Date(item.createdAt).toLocaleDateString()}</Text></View><Text style={styles.status}>{friendlyStatus(visibleStatus)}</Text>
      </Pressable>{item.kind === 'organization' && (item.fields || item.answers) ? <Text style={styles.counts}>{countLabel(item.fields, 'Vault field')} · {countLabel(item.answers, 'answer')}</Text> : null}</View></FadeInSection>; })}</Surface>
    </> : <Empty icon={<InboxIcon size={22} color={colors.ink} />} title="No requests yet" copy="Organization requests and personal Tap Card exchanges will appear here." action="Scan a TapForm code" onAction={() => router.push('/scan' as never)} /> : null}
    {!loading && !error && tab === 'received' ? received.length ? <>
      <SectionTitle trailing={`${received.length}`}>Received cards</SectionTitle>
      {received.map((item, index) => <FadeInSection key={item.id} delay={Math.min(index, 5) * 20}><Surface style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded((old) => old === item.id ? null : item.id)} style={styles.cardHead}><View style={styles.icon}><ContactRound size={18} color={colors.ink} /></View><View style={styles.copy}><Text style={styles.primary}>{item.sender}</Text><Text style={styles.secondary}>{item.card} · {countLabel(item.fieldCount, 'field')} · {new Date(item.createdAt).toLocaleDateString()}</Text></View><ChevronRight size={18} color={colors.muted} /></Pressable>
        {expanded === item.id ? <><View style={styles.rule} />{Object.entries(item.values).map(([key, value]) => <View key={key} style={styles.valueRow}><View style={styles.copy}><Text style={styles.fieldLabel}>{FIELD_REGISTRY.find((field) => field.key === key)?.label || key}</Text><Text selectable style={styles.value}>{value}</Text></View><Pressable onPress={() => void copyValue(value)} accessibilityRole="button" accessibilityLabel={`Copy ${FIELD_REGISTRY.find((field) => field.key === key)?.label || key}`} style={styles.smallButton}><Copy size={16} color={colors.ink} /></Pressable></View>)}
          <View style={styles.actions}><Button title={item.saved ? 'Saved in TapForm' : 'Save in TapForm'} variant="secondary" onPress={() => void toggleSaved(item)} /><Button title="Save to Contacts" variant="secondary" onPress={() => void exportContact(item)} /></View>
          {item.values.phone ? <Button title="Call" variant="quiet" onPress={() => void Linking.openURL(`tel:${encodeURIComponent(item.values.phone!)}`).catch(() => Alert.alert('Unable to call', 'No phone app is available on this device.'))} /> : null}
          {item.values.email ? <Button title="Email" variant="quiet" onPress={() => void Linking.openURL(`mailto:${encodeURIComponent(item.values.email!)}`).catch(() => Alert.alert('Unable to email', 'No email app is available on this device.'))} /> : null}
          <Button title="Share a Tap Card back" onPress={() => router.push({ pathname: '/tap-cards' as never, params: { shareBackTransferId: item.transferId } })}><Share2 size={16} color={colors.primaryButtonText} /></Button>
          <Button title="Remove from Inbox" variant="quiet" onPress={() => archiveCard(item)}><Archive size={15} color={colors.muted} /></Button>
        </> : null}
      </Surface></FadeInSection>)}
    </> : <Empty icon={<ContactRound size={22} color={colors.ink} />} title="No cards received" copy="When someone shares a Tap Card with you, it will be saved here as a contact-style card." /> : null}
    {!loading && !error && tab === 'sent' ? sent.length ? <>
      <SectionTitle trailing={`${sent.length}`}>Sharing receipts</SectionTitle>
      <Surface style={styles.list}>{sent.map((item, index) => <FadeInSection key={`${item.kind}-${item.id}`} delay={Math.min(index, 5) * 20}><View>{index ? <View style={styles.rule} /> : null}<Pressable accessibilityRole="button" onPress={() => setExpanded((old) => old === item.id ? null : item.id)} style={styles.row}><View style={styles.icon}>{item.kind === 'peer' ? <Share2 size={17} color={colors.ink} /> : <FileCheck2 size={17} color={colors.ink} />}</View><View style={styles.copy}><Text style={styles.primary}>Shared with {item.recipient}</Text><Text style={styles.secondary}>{item.title} · {new Date(item.createdAt).toLocaleString()}</Text></View><ChevronRight size={18} color={colors.muted} /></Pressable>{expanded === item.id ? <Text style={styles.counts}>{countLabel(item.fieldCount, 'Vault field')} · {countLabel(item.answerCount, 'answer')}</Text> : null}</View></FadeInSection>)}</Surface>
    </> : <Empty icon={<Share2 size={22} color={colors.ink} />} title="Nothing sent yet" copy="Your completed shares and immutable receipts will appear here." action="Manage Tap Cards" onAction={() => router.push('/tap-cards' as never)} /> : null}
  </ScrollView></Page>;
}

function Empty({ icon, title, copy, action, onAction }: { icon: React.ReactNode; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <FadeInSection><Surface style={styles.empty}><View style={styles.emptyIcon}>{icon}</View><Text style={styles.emptyTitle}>{title}</Text><Body style={styles.center}>{copy}</Body>{action && onAction ? <Button title={action} variant="secondary" onPress={onAction} /> : null}</Surface></FadeInSection>;
}

const styles = StyleSheet.create({
  content: { gap: 19, paddingBottom: space.xl }, liveNotice: { color: colors.muted, fontSize: 12 }, tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 4, gap: 4 }, tab: { flex: 1, minHeight: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, tabSelected: { backgroundColor: colors.ink }, tabText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, tabTextSelected: { color: colors.canvas }, list: { paddingHorizontal: 14, paddingVertical: 2 }, row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11 }, rule: { height: 1, backgroundColor: colors.line }, icon: { width: 39, height: 39, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 4 }, primary: { fontSize: 13, color: colors.ink, fontWeight: '600' }, secondary: { fontSize: 11, color: colors.muted }, status: { color: colors.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }, counts: { paddingLeft: 50, paddingBottom: 13, color: colors.muted, fontSize: 11 }, card: { gap: 13 }, cardHead: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 11 }, valueRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, fieldLabel: { color: colors.muted, fontSize: 10 }, value: { color: colors.ink, fontSize: 13 }, smallButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, actions: { gap: 8 }, empty: { paddingVertical: 30, alignItems: 'center', gap: 12 }, emptyIcon: { width: 50, height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontSize: 16, color: colors.ink, fontWeight: '700' }, center: { maxWidth: 300, textAlign: 'center' }, loading: { minHeight: 130, justifyContent: 'center', alignItems: 'center', gap: 12 }, error: { gap: 11 }, errorText: { color: colors.muted, fontSize: 13 }, notice: { color: colors.ink, fontSize: 12, textAlign: 'center' },
});
