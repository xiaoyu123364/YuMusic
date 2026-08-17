export const Palette = {
  light: {
    accent: '#FF5C9E',
    accentPressed: '#F04E90',
    accentSoft: 'rgba(255, 92, 158, 0.10)',
    accentBorder: 'rgba(255, 92, 158, 0.24)',
    onAccent: '#FFFFFF',
    gradientStart: '#FF8AC2',
    gradientEnd: '#FF5C9E',
    background: '#F4F4F6',
    card: '#FDFDFE',
    cardAlt: '#ECECEF',
    border: 'rgba(17, 24, 39, 0.07)',
    text: '#12131F',
    textSecondary: '#6E7386',
    textTertiary: '#9DA2B3',
    placeholderStart: '#FFE3F0',
    placeholderEnd: '#E9EBFF',
    danger: '#E5484D',
    dangerSoft: 'rgba(229, 72, 77, 0.10)',
    barSurface: 'rgba(250, 250, 250, 0.5)',
    barBorder: 'rgba(255, 255, 255, 0.65)',
    glassHighlight: 'rgba(255, 255, 255, 0.85)',
    dockShadow: '#0F172A',
    vip: '#B97B1F',
    vipSoft: 'rgba(240, 184, 90, 0.18)',
    playerTop: '#FFF0F7',
    playerBottom: '#F4F4F6',
  },
  dark: {
    accent: '#FF7EB6',
    accentPressed: '#FF93C2',
    accentSoft: 'rgba(255, 126, 182, 0.14)',
    accentBorder: 'rgba(255, 126, 182, 0.32)',
    onAccent: '#231018',
    gradientStart: '#FF8AC2',
    gradientEnd: '#FF5C9E',
    background: '#121214',
    card: '#242428',
    cardAlt: '#1C1C1E',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#F5F5F7',
    textSecondary: '#A6A6B0',
    textTertiary: '#6E6E78',
    placeholderStart: '#2C2335',
    placeholderEnd: '#1E2233',
    danger: '#FF6369',
    dangerSoft: 'rgba(255, 99, 105, 0.14)',
    barSurface: 'rgba(18, 18, 20, 0.5)',
    barBorder: 'rgba(255, 255, 255, 0.25)',
    glassHighlight: 'rgba(255, 255, 255, 0.18)',
    dockShadow: '#000000',
    vip: '#F0C065',
    vipSoft: 'rgba(240, 192, 101, 0.14)',
    playerTop: '#1E171E',
    playerBottom: '#121214',
  },
} as const;

export type SchemeName = 'light' | 'dark';

/** Tamagui 严格样式值只接受 hex/rgba 模板字面量,不接受宽泛 string。 */
export type PaletteColor = `#${string}` | `rgba(${string})`;

export type AppPalette = { [K in keyof (typeof Palette)['light']]: PaletteColor };

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export const MaxContentWidth = 800;
export const WideBreakpoint = 680;
