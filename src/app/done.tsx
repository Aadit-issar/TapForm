import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ShieldCheck } from 'lucide-react-native';
import { SuccessMark } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Surface } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { FIELD_REGISTRY } from '@/domain/fields';
import { supabase } from '@/services/supabase';

export default function DoneScreen() {
  const params = useLocalSearchParams<{ status?: string; orgName?: string; purpose?: string; responseId?: string; answerCount?: string; sharedFieldCount?: string; timestamp?: string }>();
  const [fields,setFields]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(params.status==='approved');
  const [loadError,setLoadError]=useState('');
  const responseId=Array.isArray(params.responseId)?params.responseId[0]:params.responseId;
  const answerCount=Math.max(0,Math.min(50,Number(Array.isArray(params.answerCount)?params.answerCount[0]:params.answerCount)||0));
  const sharedFieldCount=Math.max(0,Math.min(20,Number(Array.isArray(params.sharedFieldCount)?params.sharedFieldCount[0]:params.sharedFieldCount)||0));
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        if(params.status!=='approved'||!responseId)return;
        if(!supabase){setLoadError('The receipt could not be loaded while offline.');return;}
        const {data,error:queryError}=await supabase.from('shared_values').select('field_key,value_snapshot').eq('response_id',responseId);
        if(!active)return;
        if(queryError)setLoadError('The share is confirmed, but the receipt could not be loaded. Check Activity when your connection returns.');
        else setFields(Object.fromEntries((data??[]).map((row)=>[row.field_key,row.value_snapshot])));
      } catch {
        if(active)setLoadError('The share is confirmed, but the receipt could not be loaded. Check Activity when your connection returns.');
      } finally {
        if(active)setLoading(false);
      }
    })();
    return()=>{active=false;};
  },[params.status,responseId]);
  const declined = params.status === 'declined';
  const count = Object.keys(fields).length;
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <SuccessMark size={62} active={!declined} />
    <Eyebrow>{declined ? 'YOUR CHOICE IS RECORDED' : 'SHARE CONFIRMED'}</Eyebrow>
    <Text style={styles.title}>{declined ? 'Request declined' : 'Information shared'}</Text>
    <Body>{declined ? `Nothing was shared with ${params.orgName || 'the organization'}.` : `${sharedFieldCount || count} ${(sharedFieldCount || count) === 1 ? 'field was' : 'fields were'} shared with ${params.orgName || 'the organization'}.`}</Body>
    {!declined ? <Surface style={styles.receipt}>
      <View style={styles.receiptHead}><View style={styles.receiptMark}><ShieldCheck size={17} color={colors.ink} /></View><View style={{ flex: 1, gap: 3 }}><Text style={styles.receiptTitle}>{params.purpose || 'Approved request'}</Text><Text style={styles.time}>{params.timestamp ? new Date(params.timestamp).toLocaleString() : new Date().toLocaleString()}</Text></View></View>
      {loading?<ActivityIndicator color={colors.ink}/>:loadError?<Text accessibilityRole="alert" style={styles.label}>{loadError}</Text>:Object.entries(fields).map(([key, value], index) => <View key={key} style={[styles.valueRow, index > 0 && styles.withRule]}><Text style={styles.label}>{FIELD_REGISTRY.find((field) => field.key === key)?.label || 'Shared information'}</Text><Text style={styles.value}>{maskValue(key, value)}</Text></View>)}
      {answerCount>0?<View style={[styles.valueRow,styles.withRule]}><Text style={styles.label}>One-time question answers</Text><Text style={styles.value}>{answerCount} {answerCount===1?'answer':'answers'}</Text></View>:null}
    </Surface> : <View style={styles.declined}><Check size={17} color={colors.muted} /><Text style={styles.declinedText}>No Vault information was sent.</Text></View>}
    <View style={styles.actions}><Button title="View Activity" onPress={() => router.dismissTo('/(tabs)/activity')} /><Button title="Done" variant="quiet" onPress={() => router.dismissTo('/(tabs)')} /></View>
  </ScrollView></View>;
}

function maskValue(key: string, value: string) {
  if (['date_of_birth', 'phone', 'emergency_phone', 'emergency_email', 'student_id'].includes(key)) return '••••••••';
  if (key === 'emergency_name') return '••••••••';
  return value;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { flexGrow: 1, justifyContent: 'center', padding: space.lg, paddingBottom: 30, gap: 14 }, title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.5 }, receipt: { gap: 12, marginTop: 5, padding: 15 }, receiptHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 11, borderBottomWidth: 1, borderColor: colors.line }, receiptMark: { height: 34, width: 34, borderRadius: 11, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, receiptTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' }, time: { color: colors.muted, fontSize: 10 }, valueRow: { gap: 4, paddingTop: 8 }, withRule: { borderTopWidth: 1, borderColor: colors.lineSubtle }, label: { color: colors.muted, fontSize: 10 }, value: { color: colors.ink, fontSize: 13, fontWeight: '500' }, declined: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, declinedText: { color: colors.muted, fontSize: 12 }, actions: { gap: 5, marginTop: 3 } });
