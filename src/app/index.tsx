import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Eye, EyeOff, LockKeyhole, MoveRight, ShieldCheck } from 'lucide-react-native';
import { Body, Button, Eyebrow, Input, Surface, Title } from '@/components/ui';
import { TapFormMark } from '@/components/graphics/TapFormMark';
import { colors, space } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isDemoMode, supabase } from '@/services/supabase';
import { Role, useAppState } from '@/state/AppState';
import { accountCreationErrorMessage } from '@/domain/authErrors';

export default function SignInScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [creating, setCreating] = useState(false); const [showPassword, setShowPassword] = useState(false);
  const [signupRole, setSignupRole] = useState<Role>('personal');
  const { setRole, developerToolsUnlocked } = useAppState();
  const authenticate = async () => {
    setError('');
    const emailAddress = email.trim();
    if (!emailAddress.includes('@') || password.length < 8) { setError('Enter a valid email and a password with at least 8 characters.'); return; }
    if (!supabase) { setError('Connect a Supabase project in .env to sign in. Demo mode is available in development builds only.'); return; }
    setBusy(true);
    try {
      const result = creating ? await supabase.auth.signUp({ email: emailAddress, password, options: { data: { role: signupRole } } }) : await supabase.auth.signInWithPassword({ email: emailAddress, password });
      if (result.error) { setError(creating ? accountCreationErrorMessage(result.error) : 'We could not sign you in. Check your details and try again.'); return; }
      if (creating && !result.data.session) { setError('Check your email to confirm your account, then sign in.'); return; }
      if (creating) setRole(signupRole);
    } catch (cause) {
      setError(creating ? accountCreationErrorMessage(cause) : 'We could not sign you in. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const sendResetLink = async () => {
    setError('');
    if (!email.includes('@')) { setError('Enter your account email first.'); return; }
    if (!supabase) { setError('Password reset is unavailable until Supabase is configured.'); return; }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    setError(resetError ? 'We could not send a reset link. Check the email and try again.' : 'If an account uses this email, a password reset link is on its way.');
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top','left','right','bottom']}><KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.brandRow}><View style={styles.mark}><TapFormMark size={22} color={colors.primaryButtonText} /></View><Text style={styles.brand}>tapform</Text></View>
      <View style={styles.hero}><Eyebrow>YOUR INFORMATION, ON YOUR TERMS</Eyebrow><Title>Stop filling forms.{`\n`}Start with a tap.</Title><Body>A private data vault that shares only what you approve.</Body></View>
      <Surface style={styles.form}><Text style={styles.formTitle}>{creating ? 'Create your account' : 'Welcome back'}</Text>
        {creating ? <View style={styles.roleChoice}><Text style={styles.roleLabel}>How will you use TapForm?</Text><View style={styles.roleButtons}><Button title="Personal" variant={signupRole==='personal'?'primary':'secondary'} selected={signupRole==='personal'} onPress={()=>setSignupRole('personal')}/><Button title="Organization" variant={signupRole==='organization'?'primary':'secondary'} selected={signupRole==='organization'} onPress={()=>setSignupRole('organization')}/></View></View> : null}
        <Input label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
        <View style={styles.passwordInput}><Input label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={creating ? 'new-password' : 'password'} placeholder="At least 8 characters" /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}><EyeIcon visible={showPassword} /></Pressable></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button title={creating ? 'Create account' : 'Sign in'} loading={busy} onPress={authenticate} />
        {!creating ? <Button title="Forgot password?" variant="quiet" onPress={() => void sendResetLink()} /> : null}
        <Button title={creating ? 'I already have an account' : 'Create an account'} variant="quiet" onPress={() => { setCreating(!creating); setError(''); }} />
        {__DEV__ && developerToolsUnlocked ? <Button title="Open development NFC test" variant="secondary" onPress={() => router.push('/nfc-test')} /> : null}
      </Surface>
      <View style={styles.privacy}><LockKeyhole size={16} color={colors.green} /><Text style={styles.privacyText}>Nothing is shared until you approve it.</Text></View>
      {!supabase && !isDemoMode ? <View style={styles.setup}><ShieldCheck size={17} color={colors.muted} /><Text style={styles.setupText}>Set up Supabase and .env to enable secure sign in.</Text><MoveRight size={15} color={colors.muted} /></View> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
function EyeIcon({ visible }: { visible: boolean }) { return visible ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />; }
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space.lg, paddingTop: 34, paddingBottom: 32, gap: space.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primaryButton, alignItems: 'center', justifyContent: 'center' }, brand: { color: colors.ink, fontWeight: '700', fontSize: 19, letterSpacing: -0.4 }, passwordInput: { position: 'relative' }, passwordToggle: { position: 'absolute', right: 12, bottom: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: 34, gap: 13 }, form: { gap: 16, padding: 20 }, formTitle: { fontSize: 20, color: colors.ink, fontWeight: '700', marginBottom: 2 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, privacyText: { fontSize: 13, color: colors.muted },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 }, setup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, setupText: { color: colors.muted, fontSize: 12 }, roleChoice: { gap: 9 }, roleLabel: { color: colors.ink, fontSize: 13, fontWeight: '600' }, roleButtons: { flexDirection: 'row', gap: 9 },
});
