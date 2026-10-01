import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { selection, tap } from '@/services/haptics';

type AnimatedPressableProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: 'none' | 'tap' | 'selection';
};

export function AnimatedPressable({ children, style, pressedScale = 0.98, haptic = 'none', onPressIn, onPressOut, ...props }: AnimatedPressableProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Pressable
    {...props}
    onPressIn={(event) => {
      scale.set(reduceMotion ? 1 : withSpring(pressedScale, { damping: 22, stiffness: 340, mass: 0.55 }));
      if (haptic === 'tap') tap();
      if (haptic === 'selection') selection();
      onPressIn?.(event);
    }}
    onPressOut={(event) => {
      scale.set(reduceMotion ? 1 : withSpring(1, { damping: 20, stiffness: 300, mass: 0.55 }));
      onPressOut?.(event);
    }}
  ><Animated.View style={[style, animatedStyle]}>{children}</Animated.View></Pressable>;
}

export function AnimatedCard(props: AnimatedPressableProps) {
  return <AnimatedPressable pressedScale={0.995} {...props} />;
}
