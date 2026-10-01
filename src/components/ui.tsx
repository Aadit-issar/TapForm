import React, { useState } from 'react';
import { ActivityIndicator, PressableProps, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from '@/constants/theme';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';

export function Page({ children, ...props }: ViewProps) { return <SafeAreaView edges={['top','left','right','bottom']} {...props} style={[styles.page, props.style]}>{children}</SafeAreaView>; }
export function Eyebrow({ children }: React.PropsWithChildren) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Title({ children }: React.PropsWithChildren) { return <Text style={styles.title}>{children}</Text>; }
export function Body({ children, style }: React.PropsWithChildren<{ style?: object }>) { return <Text style={[styles.body, style]}>{children}</Text>; }
export function SectionTitle({ children, trailing }: React.PropsWithChildren<{ trailing?: string }>) {
  return <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{children}</Text>{trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}</View>;
}
export function Surface({ children, style, ...props }: ViewProps) { return <View {...props} style={[styles.surface, style]}>{children}</View>; }
export function Button({ title, variant = 'primary', loading = false, disabled, style, accessibilityLabel, accessibilityState, selected, children, ...props }: Omit<PressableProps, 'children'> & { title: string; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; loading?: boolean; selected?: boolean; children?: React.ReactNode }) {
  const state = { ...accessibilityState, ...(selected === undefined ? {} : { selected }), ...((disabled || loading) ? { disabled: true } : {}) };
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={state} disabled={disabled || loading} haptic={variant === 'primary' ? 'tap' : 'none'} style={[styles.button, styles[`button_${variant}`], (disabled || loading) && styles.disabled, typeof style === 'function' ? undefined : style]} {...props}>
    {loading ? <ActivityIndicator color={variant === 'primary' ? colors.primaryButtonText : colors.ink} /> : children ? <View style={styles.buttonContent}>{children}<Text style={[styles.buttonText, variant === 'primary' && styles.buttonPrimaryText]}>{title}</Text></View> : <Text style={[styles.buttonText, variant === 'primary' && styles.buttonPrimaryText]}>{title}</Text>}
  </AnimatedPressable>;
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return <View style={styles.inputWrap}><Text style={styles.inputLabel}>{label}</Text><TextInput placeholderTextColor={colors.subtle} selectionColor={colors.muted} autoCapitalize="sentences" {...props} onFocus={(event) => { setFocused(true); props.onFocus?.(event); }} onBlur={(event) => { setFocused(false); props.onBlur?.(event); }} style={[styles.input, focused && styles.inputFocused, props.style]} accessibilityLabel={label} /></View>;
}
export function Hairline() { return <View style={styles.hairline} />; }
export function StatusPill({ children, tone = 'green' }: React.PropsWithChildren<{ tone?: 'green' | 'amber' | 'gray' }>) {
  return <View style={[styles.pill, tone === 'gray' ? styles.pillGray : styles.pillNeutral]}><Text style={styles.pillText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '700', letterSpacing: -0.5 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  sectionTitle: { fontSize: 17, color: colors.ink, fontWeight: '600' },
  sectionTrailing: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  surface: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md },
  button: { minHeight: 54, borderRadius: radius.pill, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' }, buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  button_primary: { backgroundColor: colors.primaryButton }, button_secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, button_quiet: { backgroundColor: 'transparent' }, button_danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '600' }, buttonPrimaryText: { color: colors.primaryButtonText },
  disabled: { opacity: 0.46 },
  inputWrap: { gap: 7 }, inputLabel: { color: colors.ink, fontWeight: '600', fontSize: 13 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.elevated, borderRadius: radius.sm, paddingHorizontal: 15, color: colors.ink, fontSize: 15 }, inputFocused: { borderColor: colors.muted },
  hairline: { height: 1, backgroundColor: colors.line }, pill: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }, pillNeutral: { backgroundColor: colors.surfaceSecondary }, pillGray: { backgroundColor: '#EFF1EF' }, pillText: { color: colors.ink, fontSize: 11, fontWeight: '700' },
});
