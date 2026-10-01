import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, Clock3, Copy, LockKeyhole, Plus, QrCode, Star, Trash2 } from 'lucide-react-native';
import { Body, Button, Eyebrow, Input, Page, SectionTitle, Surface, Title } from '@/components/ui';
import { FadeInSection } from '@/components/motion/MotionPrimitives';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY, vaultFromRows, type FieldKey } from '@/domain/fields';
import { activeTapCard } from '@/domain/exchange';
import { supabase } from '@/services/supabase';
import { useAppState } from '@/state/AppState';
import { createCardShareLink, deleteTapCard, listTapCards, saveTapCard, setDefaultTapCard, tapCardShareUrl, type CardShareLink, type TapCard } from '@/services/tapCards';
import { setPeerShareContext } from '@/services/nfcPeer';
import { error, selection, success } from '@/services/haptics';

type ExpiryChoice = 'never' | '15m' | '1h' | 'today' | 'custom';
const categories = ['personal','work','school','networking','emergency','sports','custom'] as const;

export default function TapCardsScreen() {
  const params = useLocalSearchParams<{ shareBackTransferId?: string }>();
  const shareBackTransferId = Array.isArray(params.shareBackTransferId) ? params.shareBackTransferId[0] : params.shareBackTransferId;
  const { vault, replaceVault } = useAppState();
  const [cards, setCards] = useState<TapCard[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('personal');
  const [fieldKeys, setFieldKeys] = useState<FieldKey[]>([]);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('never');
  const [customExpiry, setCustomExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [activeShare, setActiveShare] = useState<CardShareLink | null>(null);
  const [oneTime, setOneTime] = useState(false);
  const [clockNow, setClockNow] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const result = await listTapCards();
      setCards(result.cards); setDefaultId(result.defaultId);
      if (supabase) {
        const { data: user } = await supabase.auth.getUser();
        if (user.user) {
          const { data, error: loadError } = await supabase.from('personal_fields').select('field_key,value').eq('user_id', user.user.id);
          if (loadError) throw loadError;
          replaceVault(vaultFromRows(data || []));
        }
      }
    } catch { setMessage('Tap Cards could not be loaded. Check your connection and retry.'); }
    finally { setLoading(false); }
  }, [replaceVault]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  useEffect(() => {
    const syncNfcContext = () => {
      if (!activeShare) { void setPeerShareContext(null, null); return; }
      const localExpiry = activeShare.expiresAt || new Date(Date.now() + 10 * 60_000).toISOString();
      if (Date.parse(localExpiry) <= Date.now()) { void setPeerShareContext(null, null); return; }
      void setPeerShareContext(activeShare.token, localExpiry).catch(() => setMessage('NFC sharing is unavailable. The secure QR and link still work.'));
    };
    syncNfcContext();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') syncNfcContext(); else void setPeerShareContext(null, null); });
    const refreshNfcExpiry = activeShare && !activeShare.expiresAt
      ? setInterval(() => { if (AppState.currentState === 'active') syncNfcContext(); }, 60_000)
      : null;
    return () => { listener.remove(); if (refreshNfcExpiry) clearInterval(refreshNfcExpiry); void setPeerShareContext(null, null); };
  }, [activeShare]);

  useEffect(() => {
    if (!activeShare?.expiresAt) return;
    const initialClock = setTimeout(() => setClockNow(Date.now()), 0);
    const timer = setInterval(() => setClockNow(Date.now()), 15_000);
    return () => { clearTimeout(initialClock); clearInterval(timer); };
  }, [activeShare]);

  const available = useMemo(() => FIELD_REGISTRY.filter((field) => Boolean(vault[field.key]?.trim())), [vault]);
  const beginNew = () => {
    setEditId(undefined); setName(''); setCategory('personal'); setFieldKeys(available.filter((field) => !('sensitive' in field && field.sensitive)).slice(0,2).map((field) => field.key));
    setExpiryChoice('never'); setCustomExpiry(''); setMessage(''); setEditing(true); setActiveShare(null);
  };
  const beginEdit = (card: TapCard) => {
    setEditId(card.id); setName(card.name); setCategory(card.category as (typeof categories)[number]);
    setFieldKeys(card.tap_card_fields.map((field) => field.field_key as FieldKey));
    setExpiryChoice(card.expires_at ? 'custom' : 'never'); setCustomExpiry(card.expires_at ? new Date(card.expires_at).toISOString().slice(0,16) : ''); setMessage(''); setEditing(true); setActiveShare(null);
  };
  const calculatedExpiry = (): string | null => {
    const now = new Date();
    if (expiryChoice === 'never') return null;
    if (expiryChoice === '15m') return new Date(now.getTime()+15*60_000).toISOString();
    if (expiryChoice === '1h') return new Date(now.getTime()+60*60_000).toISOString();
    if (expiryChoice === 'today') { const date = new Date(now); date.setHours(23,59,59,0); return date.toISOString(); }
    const parsed = new Date(customExpiry);
    if (!customExpiry || !Number.isFinite(parsed.valueOf()) || parsed <= now) throw new Error('Choose a future date and time for this Tap Card.');
    return parsed.toISOString();
  };
  const save = async () => {
    setMessage('');
    if (name.trim().length < 1 || fieldKeys.length < 1) { setMessage('Give this Tap Card a name and select at least one Vault field.'); return; }
    setBusy(true);
    try {
      await saveTapCard({ id: editId, name, category, fieldKeys, expiresAt: calculatedExpiry() });
      setEditing(false); setEditId(undefined); setActiveShare(null); await reload();
      success();
      if (shareBackTransferId) setMessage(`Tap Card saved. Select it below to share back.`);
      else setMessage('Tap Card saved.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Tap Card could not be saved.'); error(); }
    finally { setBusy(false); }
  };
  const share = async (card: TapCard, singleUse: boolean) => {
    setBusy(true); setMessage(''); setOneTime(singleUse);
    try { setClockNow(Date.now()); setActiveShare(await createCardShareLink(card.id, singleUse, card.expires_at, shareBackTransferId)); success(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'A Tap Card QR could not be created.'); error(); }
    finally { setBusy(false); }
  };
  const makeDefault = async (card: TapCard) => {
    setBusy(true);
    try { await setDefaultTapCard(defaultId === card.id ? null : card.id); setDefaultId(defaultId === card.id ? null : card.id); success(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Default Tap Card could not be changed.'); error(); }
    finally { setBusy(false); }
  };
  const remove = (card: TapCard) => Alert.alert('Delete Tap Card?', `“${card.name}” will stop working for new shares. Completed receipts remain in Activity.`, [
    { text: 'Keep card', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void (async () => { setBusy(true); try { await deleteTapCard(card.id); if (defaultId===card.id) setDefaultId(null); await reload(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Tap Card could not be deleted.'); } finally { setBusy(false); } })(); } },
  ]);
  const shareLink = activeShare ? tapCardShareUrl(activeShare.token) : '';

  return <Page><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><ArrowLeft size={19} color={colors.ink} /><Text style={styles.backText}>Back</Text></Pressable>
    <View style={styles.header}><View><Eyebrow>WHAT YOU CHOOSE TO SHARE</Eyebrow><Title>Tap Cards</Title><Body>Reusable profiles of selected Vault fields.</Body></View>{!editing ? <Pressable accessibilityRole="button" accessibilityLabel="Create Tap Card" onPress={beginNew} style={styles.add}><Plus size={20} color={colors.primaryButtonText} /></Pressable> : null}</View>
    {message ? <Surface accessibilityRole="alert" style={styles.notice}><Body>{message}</Body></Surface> : null}
    {editing ? <Surface style={styles.editor}>
      <View style={styles.editorHead}><Text style={styles.editorTitle}>{editId ? 'Edit Tap Card' : 'New Tap Card'}</Text><Pressable accessibilityRole="button" onPress={() => { setEditing(false); setEditId(undefined); }}><Text style={styles.cancel}>Cancel</Text></Pressable></View>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Networking" maxLength={60} />
      <View style={styles.section}><Text style={styles.inputLabel}>Type</Text><View style={styles.categoryList}>{categories.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: category===item }} onPress={() => { selection(); setCategory(item); }} style={[styles.choice,category===item&&styles.choiceActive]}><Text style={[styles.choiceText,category===item&&styles.choiceTextActive]}>{item}</Text></Pressable>)}</View></View>
      <View style={styles.section}><SectionTitle trailing={`${fieldKeys.length} selected`}>Vault fields</SectionTitle>{available.length ? <View style={styles.fieldList}>{available.map((field,index) => <View key={field.key}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: fieldKeys.includes(field.key) }} onPress={() => { selection(); setFieldKeys((old) => old.includes(field.key) ? old.filter((key) => key!==field.key) : [...old,field.key]); }} style={styles.fieldRow}><View style={[styles.checkbox,fieldKeys.includes(field.key)&&styles.checkboxOn]}>{fieldKeys.includes(field.key)?<Check size={13} color={colors.primaryButtonText} strokeWidth={3}/>:null}</View><Text style={styles.fieldName}>{field.label}</Text></Pressable>{index<available.length-1?<View style={styles.rule}/>:null}</View>)}</View> : <Body>No Vault details to add yet. Add information in your Vault first.</Body>}</View>
      <View style={styles.section}><Text style={styles.inputLabel}>Card expiry</Text><View style={styles.categoryList}>{(['never','15m','1h','today','custom'] as ExpiryChoice[]).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: expiryChoice===item }} onPress={() => { selection(); setExpiryChoice(item); }} style={[styles.choice,expiryChoice===item&&styles.choiceActive]}><Text style={[styles.choiceText,expiryChoice===item&&styles.choiceTextActive]}>{item==='never'?'No expiry':item==='15m'?'15 minutes':item==='1h'?'1 hour':item==='today'?'Today':'Custom'}</Text></Pressable>)}</View>{expiryChoice==='custom'?<Input label="Date and time" value={customExpiry} onChangeText={setCustomExpiry} placeholder="YYYY-MM-DDTHH:MM" />:null}</View>
      <View style={styles.privacy}><LockKeyhole size={14} color={colors.muted}/><Text style={styles.meta}>A Tap Card stores field choices, not duplicate Vault values.</Text></View>
      <Button title={editId?'Save changes':'Create Tap Card'} loading={busy} onPress={() => void save()} />
    </Surface> : null}
    {activeShare ? <FadeInSection><Surface style={styles.qrPanel}>
      <View style={styles.qrHead}><View style={styles.qrHeading}><Eyebrow>{oneTime?'ONE-TIME SHARE':'REUSABLE SHARE'}</Eyebrow><Text style={styles.qrTitle}>{activeShare.cardName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close QR code" onPress={() => setActiveShare(null)} style={styles.close}><Text style={styles.cancel}>Close</Text></Pressable></View>
      {activeShare.expiresAt && Date.parse(activeShare.expiresAt) <= clockNow ? <View style={styles.expiredCode}><Clock3 size={20} color={colors.muted}/><Text style={styles.expiredTitle}>This code has expired</Text><Text style={styles.qrNote}>It can no longer be used for a new exchange. Close it and create a fresh code.</Text><Button title="Close expired code" variant="secondary" onPress={() => setActiveShare(null)}/></View> : <>
        <View style={styles.qrFrame}><QRCode value={shareLink} size={218} quietZone={12} color="#111212" backgroundColor="#F2F2F0" ecl="Q" /></View>
        <Text style={styles.qrNote}>This code carries a secure reference only. Your Vault values are shared after the receiver approves.</Text>
        {activeShare.expiresAt?<View style={styles.expiry}><Clock3 size={14} color={colors.muted}/><Text style={styles.meta}>Available until {new Date(activeShare.expiresAt).toLocaleString()}</Text></View>:null}
        <Text style={styles.qrNote}>For NFC, keep this Tap Card open and tap it with another TapForm phone. NFC carries only this secure reference.</Text>
        <Button title="Share link" variant="secondary" onPress={() => void Share.share({ message: `Open this TapForm card: ${shareLink}` })}><Copy size={16} color={colors.ink}/></Button>
      </>}
    </Surface></FadeInSection> : null}
    {!loading && !editing && cards.length===0 ? <Surface style={styles.empty}><View style={styles.emptyMark}><QrCode size={20} color={colors.ink}/></View><Text style={styles.emptyTitle}>Your Tap Cards start here</Text><Body>Choose the Vault details you want ready to share. A card never includes other Vault information.</Body>{available.length===0?<Button title="Add Vault information" onPress={() => router.push('/(tabs)/vault')}/>:<Button title="Create your first Tap Card" onPress={beginNew}/>}</Surface>:null}
    {loading ? <Text style={styles.meta}>Loading Tap Cards…</Text> : null}
    {!editing && cards.map((card, index) => {
      const usable = activeTapCard({ archivedAt: card.archived_at, expiresAt: card.expires_at });
      const isDefault = defaultId === card.id;
      const fields = card.tap_card_fields.map(({ field_key }) => FIELD_REGISTRY.find((item) => item.key===field_key)?.label ?? 'Vault field');
      const missing = card.tap_card_fields.filter(({ field_key }) => !vault[field_key as FieldKey]?.trim());
      const shareBack = Boolean(shareBackTransferId);
      return <FadeInSection key={card.id} delay={Math.min(index, 5) * 20}><Surface style={[styles.card,!usable&&styles.cardExpired]}>
        <View style={styles.cardTop}><View style={styles.cardTitleLine}><Text style={styles.cardTitle}>{card.name}</Text>{isDefault?<View style={styles.defaultTag}><Star size={12} color={colors.ink}/><Text style={styles.defaultText}>DEFAULT</Text></View>:null}</View>
          <View style={styles.iconActions}><Pressable disabled={busy||!usable} accessibilityRole="button" accessibilityState={{ selected: isDefault }} accessibilityLabel={isDefault?'Remove default Tap Card':'Set as default Tap Card'} onPress={() => void makeDefault(card)} style={styles.iconButton}><Star size={17} color={isDefault?colors.ink:colors.muted} fill={isDefault?colors.ink:'transparent'}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${card.name}`} onPress={() => beginEdit(card)} style={styles.iconButton}><Text style={styles.editLabel}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${card.name}`} onPress={() => remove(card)} style={styles.iconButton}><Trash2 size={16} color={colors.muted}/></Pressable></View>
        </View>
        <Text style={styles.cardMeta}>{card.category.toUpperCase()} · {fields.length} {fields.length===1?'FIELD':'FIELDS'}{card.expires_at?` · EXPIRES ${new Date(card.expires_at).toLocaleString()}`:''}</Text>
        <Text style={styles.fieldLabels}>{fields.join(' · ')||'No fields selected'}</Text>
        {missing.length?<Body style={styles.errorText}>Missing from Vault: {missing.map((field)=>FIELD_REGISTRY.find((item)=>item.key===field.field_key)?.label).join(', ')}. Update this card before sharing.</Body>:null}
        {!usable?<Text style={styles.expired}>EXPIRED · Edit the card to make it active again.</Text>:null}
        {usable?<View style={styles.actions}>{shareBack?<Button title={card.id===defaultId?'Share your default card back':'Share this card back'} loading={busy} onPress={() => void share(card,true)} disabled={missing.length>0}/>:<><Button title="Show reusable QR" variant="secondary" loading={busy} onPress={() => void share(card,false)} disabled={missing.length>0}/><Button title="Create one-time QR" variant="quiet" loading={busy} onPress={() => void share(card,true)} disabled={missing.length>0}/></>}</View>:null}
      </Surface></FadeInSection>;
    })}
    {!editing && !loading && cards.length>0 && !shareBackTransferId ? <Button title="Create Tap Card" variant="secondary" onPress={beginNew}/>:null}
    {shareBackTransferId?<Surface style={styles.shareBackNote}><Eyebrow>SHARE BACK</Eyebrow><Body>Choose a card above. The link is one-time and only the person who shared with you can accept it.</Body></Surface>:null}
  </ScrollView></Page>;
}

const styles=StyleSheet.create({content:{gap:17,paddingBottom:space.xl},back:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8},backText:{color:colors.muted,fontSize:13},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},add:{width:48,height:48,borderRadius:15,backgroundColor:colors.primaryButton,alignItems:'center',justifyContent:'center'},notice:{padding:13},editor:{gap:16},editorHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},editorTitle:{fontSize:17,color:colors.ink,fontWeight:'600'},cancel:{color:colors.muted,fontSize:13,fontWeight:'600',minHeight:44,textAlignVertical:'center'},section:{gap:9},inputLabel:{fontSize:13,color:colors.ink,fontWeight:'600'},categoryList:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{minHeight:44,paddingHorizontal:12,justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface},choiceActive:{backgroundColor:colors.primaryButton,borderColor:colors.primaryButton},choiceText:{color:colors.muted,fontSize:11,fontWeight:'600',textTransform:'capitalize'},choiceTextActive:{color:colors.primaryButtonText},fieldList:{borderWidth:1,borderColor:colors.line,borderRadius:12,paddingHorizontal:12},fieldRow:{minHeight:49,flexDirection:'row',alignItems:'center',gap:10},checkbox:{width:21,height:21,borderRadius:6,borderWidth:1.5,borderColor:colors.muted,alignItems:'center',justifyContent:'center'},checkboxOn:{backgroundColor:colors.primaryButton,borderColor:colors.primaryButton},fieldName:{color:colors.ink,fontSize:13},rule:{height:1,backgroundColor:colors.lineSubtle},privacy:{flexDirection:'row',alignItems:'center',gap:5},card:{gap:10},cardExpired:{opacity:.7},cardTop:{flexDirection:'row',alignItems:'center',gap:6,justifyContent:'space-between'},cardTitleLine:{flexDirection:'row',alignItems:'center',gap:8,flex:1},cardTitle:{color:colors.ink,fontSize:17,fontWeight:'600',flexShrink:1},defaultTag:{flexDirection:'row',alignItems:'center',gap:3},defaultText:{color:colors.muted,fontSize:8,fontWeight:'700',letterSpacing:.7},iconActions:{flexDirection:'row',alignItems:'center'},iconButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},editLabel:{fontSize:11,color:colors.muted},cardMeta:{color:colors.muted,fontSize:9,fontWeight:'700',letterSpacing:.5},fieldLabels:{color:colors.ink,fontSize:12,lineHeight:18},errorText:{color:colors.ink,fontSize:11,lineHeight:17},expired:{color:colors.muted,fontSize:10,fontWeight:'600'},actions:{gap:4},empty:{alignItems:'center',gap:11,padding:22},emptyMark:{width:46,height:46,borderRadius:15,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},emptyTitle:{color:colors.ink,fontSize:17,fontWeight:'600'},qrPanel:{alignItems:'center',gap:14,paddingVertical:17},qrHead:{width:'100%',flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},qrHeading:{gap:3},qrTitle:{color:colors.ink,fontSize:16,fontWeight:'600'},close:{minHeight:44,justifyContent:'center'},qrFrame:{padding:12,backgroundColor:'#F2F2F0',borderRadius:12,borderWidth:1,borderColor:colors.line},qrNote:{color:colors.muted,fontSize:11,lineHeight:17,textAlign:'center'},expiredCode:{alignItems:'center',gap:10,padding:15},expiredTitle:{color:colors.ink,fontSize:15,fontWeight:'600'},expiry:{flexDirection:'row',alignItems:'center',gap:6},meta:{color:colors.muted,fontSize:11},shareBackNote:{gap:8}});
