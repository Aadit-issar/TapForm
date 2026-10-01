/** Single monochrome visual source for application surfaces and interaction states. */
export const colors = {
  canvas: '#090A0A',
  elevated: '#101111',
  surface: '#151717',
  surfaceSecondary: '#1C1E1E',
  surfaceActive: '#292B2B',
  line: '#343737',
  lineSubtle: '#252828',
  ink: '#F2F2F0',
  muted: '#B8BAB8',
  subtle: '#858987',
  disabled: '#5E6260',
  icon: '#E7E8E6',
  primaryButton: '#F1F2EF',
  primaryButtonText: '#111212',
  overlay: 'rgba(0,0,0,0.72)',
  // Compatibility aliases while screens migrate. All aliases stay grayscale.
  green: '#E7E8E6',
  greenDark: '#F2F2F0',
  greenWash: '#202020',
  mint: '#292B2B',
  amber: '#C6C9C7',
  amberWash: '#242625',
  red: '#B8BAB8',
  redWash: '#242525',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 } as const;
export const radius = { xs: 8, sm: 12, md: 16, lg: 22, hero: 24, pill: 999 } as const;
export const motion = { quick: 150, standard: 220, deliberate: 300 } as const;
