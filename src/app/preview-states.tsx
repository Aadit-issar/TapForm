import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, CircleAlert, Clock3, Nfc, ShieldCheck } from 'lucide-react-native';
import { Body, Button, Eyebrow, Surface } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useAppState } from '@/state/AppState';

const states = ['Ready', 'Request received', 'Consent', 'Approved', 'Declined', 'Expired', 'Error'] as const;
const previewValues = [
  ['Full Name', 'Alex Morgan'],
  ['Date of Birth', '••••••'],
  ['School', 'Northfield Academy'],
  ['Grade', '11'],
  ['Emergency Contact', '••••••'],
] as const;
type PreviewState = (typeof states)[number];

/** Local visual fixtures only: this screen never joins or responds to a real request. */
export default function PreviewStatesScreen() {
  const { developerToolsUnlocked } = useAppState();
  const [current, setCurrent] = useState<PreviewState>('Ready');
  const [phoneSelected, setPhoneSelected] = useState(true);
  if (!__DEV__ || !developerToolsUnlocked) return <Redirect href="/(tabs)/profile" />;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}><ArrowLeft size={19} color={colors.ink}/><Text style={styles.backText}>Back</Text></Pressable>
    <View style={styles.heading}><Eyebrow>DEVELOPMENT ONLY · LOCAL PREVIEW</Eyebrow><Text style={styles.title}>Request states</Text><Body>Visual fixtures only. No session is joined and no data is sent.</Body></View>
    <Button title="Open motion & graphics gallery" variant="secondary" onPress={() => router.push('/motion-gallery')} />
    <View style={styles.statePicker}>{states.map((state) => <Pressable key={state} onPress={() => setCurrent(state)} accessibilityRole="button" accessibilityState={{ selected: current === state }} style={[styles.stateChip, current === state && styles.stateChipSelected]}><Text style={[styles.stateChipText, current === state && styles.stateChipTextSelected]}>{state}</Text></Pressable>)}</View>
    <Surface style={styles.preview}>
      <View style={styles.org}><View style={styles.mark}><Text style={styles.markText}>N</Text></View><View style={{ flex: 1 }}><Eyebrow>NORTHFIELD TECH FEST</Eyebrow><Text style={styles.orgStatus}>Demo organization · unverified</Text></View></View>
      {current === 'Ready' ? <><Nfc color={colors.green} size={27}/><Text style={styles.section}>Ready to tap</Text><Body>Share information securely. Nothing is sent until you approve.</Body></> : null}
      {current === 'Request received' ? <><Eyebrow>REQUEST RECEIVED</Eyebrow><Text style={styles.section}>Event Registration</Text><Body>Participant registration · expires in 01:42</Body><Button title="Review request" onPress={() => setCurrent('Consent')}/></> : null}
      {current === 'Consent' ? <><Eyebrow>REVIEW BEFORE YOU SHARE</Eyebrow><Text style={styles.section}>Event Registration</Text><Body>Only these fields will be shared.</Body>{['Full Name','Date of Birth','School','Grade','Emergency Contact'].map((label) => <Field key={label} label={label} detail={label === 'Full Name' ? 'Alex Morgan' : 'Required'} required/>)}<Pressable onPress={() => setPhoneSelected(!phoneSelected)} accessibilityRole="checkbox" accessibilityState={{ checked: phoneSelected }} style={styles.optional}><View style={[styles.check,phoneSelected&&styles.checkSelected]}>{phoneSelected?<Check size={13} color={colors.canvas}/>:null}</View><View style={{flex:1}}><Text style={styles.fieldTitle}>Phone Number</Text><Text style={styles.fieldMeta}>{phoneSelected?'Optional · included':'Optional · excluded'}</Text></View><Text style={styles.toggle}>{phoneSelected?'ON':'OFF'}</Text></Pressable><Button title={`Share ${phoneSelected?'6':'5'} fields`} onPress={() => setCurrent('Approved')}/><Button title="Decline request" variant="danger" onPress={() => setCurrent('Declined')}/></> : null}
      {current === 'Approved' ? <><View style={styles.resultIcon}><Check color={colors.canvas} size={22}/></View><Eyebrow>SHARED SECURELY</Eyebrow><Text style={styles.section}>5 fields shared</Text><Body>Northfield Tech Fest · Event Registration</Body>{previewValues.map(([label,value])=><Field key={label} label={label} detail={value}/>)}</> : null}
      {current === 'Declined' ? <StateCard icon={<Check color={colors.amber}/>} title="Request declined" detail="No information was shared."/> : null}
      {current === 'Expired' ? <StateCard icon={<Clock3 color={colors.amber}/>} title="Request expired" detail="Ask the organization to start a new request."/> : null}
      {current === 'Error' ? <StateCard icon={<CircleAlert color={colors.red}/>} title="Couldn't connect" detail="Check your connection and try again."/> : null}
    </Surface>
    <View style={styles.privacy}><ShieldCheck color={colors.green} size={17}/><Text style={styles.privacyText}>This preview is isolated from authentication, the backend, and real request permissions.</Text></View>
  </ScrollView>;
}

function Field({label,detail,required=false}:{label:string;detail:string;required?:boolean}) { return <View style={styles.field}><View style={{flex:1}}><Text style={styles.fieldTitle}>{label}</Text><Text style={styles.fieldMeta}>{detail}</Text></View>{required?<Text style={styles.required}>REQUIRED</Text>:null}</View>; }
function StateCard({icon,title,detail}:{icon:React.ReactNode;title:string;detail:string}) { return <View style={styles.stateCard}>{icon}<Text style={styles.section}>{title}</Text><Body>{detail}</Body></View>; }

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.canvas},content:{padding:space.lg,paddingBottom:32,gap:space.lg},back:{minHeight:40,flexDirection:'row',alignItems:'center',gap:8},backText:{color:colors.ink,fontWeight:'600'},heading:{gap:8},title:{fontSize:27,fontWeight:'700',color:colors.ink},statePicker:{flexDirection:'row',flexWrap:'wrap',gap:8},stateChip:{minHeight:38,justifyContent:'center',paddingHorizontal:12,borderWidth:1,borderColor:colors.line,borderRadius:radius.pill,backgroundColor:colors.surface},stateChipSelected:{backgroundColor:colors.greenWash,borderColor:colors.green},stateChipText:{fontSize:12,color:colors.muted},stateChipTextSelected:{color:colors.ink,fontWeight:'700'},preview:{gap:13,borderRadius:radius.md},org:{flexDirection:'row',alignItems:'center',gap:11,paddingBottom:12,borderBottomWidth:1,borderColor:colors.line},mark:{width:40,height:40,borderRadius:13,backgroundColor:colors.greenWash,alignItems:'center',justifyContent:'center'},markText:{fontSize:17,color:colors.green,fontWeight:'700'},orgStatus:{fontSize:11,color:colors.muted,marginTop:4},section:{fontSize:20,color:colors.ink,fontWeight:'700'},field:{minHeight:50,borderTopWidth:1,borderColor:colors.line,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:7},fieldTitle:{fontSize:13,color:colors.ink,fontWeight:'600'},fieldMeta:{fontSize:11,color:colors.muted,marginTop:3},required:{fontSize:9,color:colors.muted,fontWeight:'700',letterSpacing:.6},optional:{minHeight:54,borderTopWidth:1,borderColor:colors.line,flexDirection:'row',alignItems:'center',gap:10},check:{width:20,height:20,borderRadius:6,borderWidth:1,borderColor:colors.subtle,alignItems:'center',justifyContent:'center'},checkSelected:{backgroundColor:colors.green,borderColor:colors.green},toggle:{fontSize:10,color:colors.muted,fontWeight:'700',letterSpacing:.7},resultIcon:{width:50,height:50,borderRadius:17,backgroundColor:colors.green,alignItems:'center',justifyContent:'center'},stateCard:{alignItems:'flex-start',gap:9,paddingVertical:12},privacy:{flexDirection:'row',gap:9,alignItems:'flex-start'},privacyText:{flex:1,fontSize:11,color:colors.muted,lineHeight:17},center:{flex:1,backgroundColor:colors.canvas,alignItems:'center',justifyContent:'center'},});
