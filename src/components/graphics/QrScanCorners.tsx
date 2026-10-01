import { StyleSheet, View, type ViewProps } from 'react-native';

type QrScanCornersProps = ViewProps & {
  color?: string;
  cornerLength?: number;
  strokeWidth?: number;
};

/** Non-interactive QR framing; keep the QR's quiet zone unobstructed. */
export function QrScanCorners({ color = '#B8BAB8', cornerLength = 26, strokeWidth = 2, style, ...props }: QrScanCornersProps) {
  const cornerStyle = { width: cornerLength, height: cornerLength, borderColor: color, borderWidth: strokeWidth };
  return <View pointerEvents="none" {...props} style={[StyleSheet.absoluteFill, style]}>
    <View style={[styles.corner, styles.topLeft, cornerStyle]} />
    <View style={[styles.corner, styles.topRight, cornerStyle]} />
    <View style={[styles.corner, styles.bottomLeft, cornerStyle]} />
    <View style={[styles.corner, styles.bottomRight, cornerStyle]} />
  </View>;
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', borderRadius: 2 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
});
