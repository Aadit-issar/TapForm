import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { TapFormMark } from './TapFormMark';

export type NfcVisualState = 'ready' | 'searching' | 'found' | 'connected' | 'error';

type NfcWaveVisualProps = {
  state?: NfcVisualState;
  size?: number;
  label?: string;
};

const neutral = ['#343737', '#555957', '#777B79', '#D9DBD8'] as const;

export function NfcWaveVisual({ state = 'ready', size = 224, label = 'NFC' }: NfcWaveVisualProps) {
  const reduceMotion = useReducedMotion();
  const wave = useSharedValue(0);
  const found = state === 'found';
  const active = state === 'ready' || state === 'searching';

  useEffect(() => {
    cancelAnimation(wave);
    if (reduceMotion || !active) {
      wave.value = 0;
      if (found && !reduceMotion) {
        wave.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 200 }));
      }
      return;
    }
    const duration = state === 'searching' ? 1450 : 2500;
    wave.value = withRepeat(withTiming(1, { duration }), -1, false);
    return () => cancelAnimation(wave);
  }, [active, found, reduceMotion, state, wave]);

  const ringSize = size * 0.88;
  const ringSizes = [0.52, 0.73, 0.94];
  return <View accessible accessibilityRole="image" accessibilityLabel={`${label}, ${state}`} style={[styles.root, { width: size, height: size }]}>
    {ringSizes.map((factor, index) => <WaveRing key={factor} color={neutral[index] ?? neutral[0]} size={ringSize * factor} phaseOffset={index / ringSizes.length} wave={wave} active={active} found={found} reduceMotion={reduceMotion} />)}
    <View style={[styles.center, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }, state === 'error' && styles.errorCenter]}>
      <TapFormMark size={size * 0.19} color={neutral[3]} />
    </View>
  </View>;
}

function WaveRing({ color, size, phaseOffset, wave, active, found, reduceMotion }: { color: string; size: number; phaseOffset: number; wave: SharedValue<number>; active: boolean; found: boolean; reduceMotion: boolean }) {
  const animatedStyle = useAnimatedStyle(() => {
    if (found && !reduceMotion) return { transform: [{ scale: 1.1 - wave.value * 0.1 }], opacity: 0.72 + wave.value * 0.28 };
    if (!active || reduceMotion) return { transform: [{ scale: 1 }], opacity: 1 };
    const phase = (wave.value + phaseOffset) % 1;
    return { transform: [{ scale: 0.88 + phase * 0.2 }], opacity: 0.62 * (1 - phase * 0.45) };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, { width: size, height: size, borderColor: found ? '#D9DBD8' : color, borderRadius: size / 2 }, animatedStyle]} />;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: { position: 'absolute', borderWidth: 1 },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#171919', borderWidth: 1, borderColor: '#777B79' },
  errorCenter: { borderColor: '#A4A7A5' },
});
