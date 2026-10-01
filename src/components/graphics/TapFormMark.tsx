import Svg, { Circle, Path } from 'react-native-svg';

type TapFormMarkProps = {
  size?: number;
  color?: string;
};

/** Monochrome T-and-contact-point mark; intentionally distinct from the NFC symbol. */
export function TapFormMark({ size = 32, color = '#F2F2F0' }: TapFormMarkProps) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image" accessibilityLabel="TapForm">
    <Circle cx="24" cy="7" r="2.5" fill={color} />
    <Path d="M11 16h26M24 16v26M30 25h7M30 33h7" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
