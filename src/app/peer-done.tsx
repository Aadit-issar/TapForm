import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { FadeInSection, SuccessMark } from '@/components/motion/MotionPrimitives';
import { Body, Button, Eyebrow, Surface } from '@/components/ui';
import { colors, space } from '@/constants/theme';

export default function PeerDoneScreen() {
  const params = useLocalSearchParams<{ transferId?: string; sender?: string; cardName?: string; fieldCount?: string }>();
  const sender = Array.isArray(params.sender) ? params.sender[0] : params.sender || 'TapForm member';
  const cardName = Array.isArray(params.cardName) ? params.cardName[0] : params.cardName || 'Tap Card';
  const count = Number(Array.isArray(params.fieldCount) ? params.fieldCount[0] : params.fieldCount) || 0;
  const transferId = Array.isArray(params.transferId) ? params.transferId[0] : params.transferId;
  return <View style={styles.screen}>
    <FadeInSection><SuccessMark size={58} /></FadeInSection>
    <Eyebrow>RECEIVED IN TAPFORM</Eyebrow><Text style={styles.title}>Card received</Text>
    <Body style={styles.center}>{cardName} from {sender} is saved in your Inbox. Its values show exactly what they shared.</Body>
    <Surface style={styles.receipt}><View style={styles.row}><Text style={styles.label}>Tap Card</Text><Text style={styles.value}>{cardName}</Text></View><View style={styles.row}><Text style={styles.label}>From</Text><Text style={styles.value}>{sender}</Text></View><View style={styles.row}><Text style={styles.label}>Information received</Text><Text style={styles.value}>{count} {count===1?'field':'fields'}</Text></View><View style={styles.secure}><ShieldCheck size={15} color={colors.muted}/><Text style={styles.label}>Only the sender’s selected fields were transferred.</Text></View></Surface>
    {transferId ? <Button title="Share a Tap Card back" onPress={() => router.replace({ pathname: '/tap-cards' as never, params: { shareBackTransferId: transferId } })}/> : null}
    <Button title="Open Inbox" variant="secondary" onPress={() => router.dismissTo('/(tabs)/activity')}/>
  </View>;
}

const styles=StyleSheet.create({screen:{flex:1,justifyContent:'center',padding:space.lg,gap:14,backgroundColor:colors.canvas},title:{color:colors.ink,fontSize:30,lineHeight:36,fontWeight:'600'},center:{textAlign:'left'},receipt:{gap:13,marginTop:3},row:{minHeight:30,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},label:{color:colors.muted,fontSize:12,flex:1},value:{color:colors.ink,fontSize:13,fontWeight:'600',textAlign:'right',flexShrink:1},secure:{flexDirection:'row',alignItems:'flex-start',gap:7,borderTopWidth:1,borderColor:colors.lineSubtle,paddingTop:11}});
