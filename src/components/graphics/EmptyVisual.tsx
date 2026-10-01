import Svg, { Circle, Path, Rect } from 'react-native-svg';

type EmptyVisualProps = { kind: 'activity' | 'vault' | 'submissions'; size?: number };

export function EmptyVisual({ kind, size = 88 }: EmptyVisualProps) {
  const path = kind === 'activity'
    ? 'M13 12h30M13 24h23M13 36h27'
    : kind === 'vault'
      ? 'M17 15h27M17 24h18M17 33h24'
      : 'M24 10h19v29H24zM13 17v29h19';
  return <Svg width={size} height={size} viewBox="0 0 56 56" accessibilityRole="image" accessibilityLabel={`${kind} empty`}>
    {kind === 'vault' ? <Rect x="11" y="8" width="34" height="40" rx="5" fill="none" stroke="#555957" strokeWidth="1.5" /> : null}
    {kind === 'submissions' ? <Rect x="21" y="7" width="26" height="36" rx="4" fill="none" stroke="#555957" strokeWidth="1.5" /> : null}
    <Path d={path} fill="none" stroke="#A4A7A5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    {kind === 'activity' ? <Circle cx="8" cy="12" r="1.7" fill="#D9DBD8" /> : null}
  </Svg>;
}
