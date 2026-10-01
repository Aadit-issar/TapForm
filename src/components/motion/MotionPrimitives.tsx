import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { FadeInDown, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { requestFound, selection } from '@/services/haptics';

export function FadeInSection({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(210).delay(delay)} style={style}>{children}</Animated.View>;
}

export function AnimatedProgress({ value, style, trackColor = '#252828', fillColor = '#E7E8E6' }: { value: number; style?: StyleProp<ViewStyle>; trackColor?: string; fillColor?: string }) {
  const [width, setWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, value));
    progress.value = reduceMotion ? target : withTiming(target, { duration: 220 });
  }, [progress, reduceMotion, value]);
  const fillStyle = useAnimatedStyle(() => ({ width: width * progress.value }));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, value)) * 100) }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.progressTrack, { backgroundColor: trackColor }, style]}>
    <Animated.View style={[styles.progressFill, { backgroundColor: fillColor }, fillStyle]} />
  </View>;
}

export function AnimatedCounter({ value, style }: { value: string | number; style?: object }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value && !reduceMotion) {
      opacity.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(1, { duration: 130 }));
      translateY.value = withSequence(withTiming(-3, { duration: 60 }), withTiming(0, { duration: 130 }));
    }
    previous.current = value;
  }, [opacity, reduceMotion, translateY, value]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return <Animated.Text accessibilityLiveRegion="polite" style={[style, animatedStyle]}>{value}</Animated.Text>;
}

export function AnimatedToggleRow({ label, detail, value, onValueChange, disabled = false }: { label: string; detail?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(value ? 17 : 0);
  useEffect(() => {
    offset.value = reduceMotion ? (value ? 17 : 0) : withTiming(value ? 17 : 0, { duration: 160 });
  }, [offset, reduceMotion, value]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return <Pressable
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityHint={detail}
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    onPress={() => { selection(!value); onValueChange(!value); }}
    style={({ pressed }) => [styles.toggleRow, pressed && !disabled && styles.rowPressed, disabled && styles.disabledRow]}
  >
    <View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text>{detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}</View>
    <View style={[styles.toggleTrack, value ? styles.toggleTrackOn : styles.toggleTrackOff]}><Animated.View style={[styles.toggleThumb, value && styles.toggleThumbOn, thumbStyle]} /></View>
  </Pressable>;
}

export function SuccessMark({ size = 56, active = true }: { size?: number; active?: boolean }) {
  const reduceMotion = useReducedMotion();
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = reduceMotion ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 210 });
  }, [active, reduceMotion, reveal]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ scale: 0.88 + reveal.value * 0.12 }] }));
  return <Animated.View accessible accessibilityRole="image" accessibilityLabel={active ? 'Completed' : 'Not completed'} style={[styles.successMark, { width: size, height: size, borderRadius: size / 2 }, animatedStyle]}>
    <Check size={size * 0.45} color="#111212" strokeWidth={2.5} />
  </Animated.View>;
}

export function PulseRing({ size = 120, active = true }: { size?: number; active?: boolean }) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    if (!active || reduceMotion) { phase.value = 0; return; }
    phase.value = withRepeat(withTiming(1, { duration: 2400 }), -1, false);
    return () => cancelAnimation(phase);
  }, [active, phase, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + phase.value * 0.16 }], opacity: 0.65 - phase.value * 0.4 }));
  return <Animated.View pointerEvents="none" style={[styles.pulseRing, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

export function LoadingSkeleton({ width = '100%', height = 14, style }: { width?: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.72);
  useEffect(() => {
    if (reduceMotion) { opacity.value = 0.72; return; }
    opacity.value = withRepeat(withSequence(withTiming(0.42, { duration: 700 }), withTiming(0.72, { duration: 700 })), -1, false);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View accessible accessibilityLabel="Loading" style={[styles.skeleton, { width, height }, style, animatedStyle]} />;
}

export function RequestTransition({ state, children }: { state: 'idle' | 'found' | 'consent' | 'error'; children: ReactNode }) {
  const lastState = useRef(state);
  useEffect(() => {
    if (state === 'found' && lastState.current !== 'found') requestFound();
    lastState.current = state;
  }, [state]);
  return <FadeInSection key={state}>{children}</FadeInSection>;
}

const styles = StyleSheet.create({
  progressTrack: { height: 4, overflow: 'hidden', borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  toggleRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowPressed: { opacity: 0.86 },
  disabledRow: { opacity: 0.6 },
  toggleCopy: { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.ink },
  toggleDetail: { fontSize: 12, lineHeight: 16, color: colors.muted },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1 },
  toggleTrackOn: { backgroundColor: '#E7E8E6', borderColor: '#E7E8E6' },
  toggleTrackOff: { backgroundColor: '#252828', borderColor: '#555957' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E7E8E6' },
  toggleThumbOn: { backgroundColor: '#111212' },
  successMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8E6' },
  pulseRing: { borderWidth: 1, borderColor: '#777B79' },
  skeleton: { borderRadius: 7, backgroundColor: '#292C2B' },
});
