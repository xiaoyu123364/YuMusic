export const Palette = {
  // iOS 系统色板（Apple Music 设计语言）：
  // - 浅色：systemGroupedBackground #F2F2F7 + 白色分组卡片
  // - 深色：纯黑背景（OLED，Apple Music 深色即纯黑）+ #1C1C1E 卡片
  // - 文字层级对齐 iOS label / secondaryLabel / tertiaryLabel
  light: {
    accent: '#FA233B',
    accentPressed: '#E01E33',
    accentSoft: 'rgba(250, 35, 59, 0.10)',
    accentBorder: 'rgba(250, 35, 59, 0.24)',
    onAccent: '#FFFFFF',
    gradientStart: '#FC5A6A',
    gradientEnd: '#FA233B',
    background: '#F2F2F7',
    card: '#FFFFFF',
    cardAlt: '#E5E5EA',
    border: 'rgba(60, 60, 67, 0.29)',
    text: '#000000',
    textSecondary: '#8A8A8E',
    textTertiary: '#AEAEB4',
    placeholderStart: '#FFE0E4',
    placeholderEnd: '#E9E9EF',
    danger: '#FF3B30',
    dangerSoft: 'rgba(255, 59, 48, 0.10)',
    barSurface: 'rgba(249, 249, 249, 0.72)',
    barBorder: 'rgba(60, 60, 67, 0.20)',
    glassHighlight: 'rgba(255, 255, 255, 0.85)',
    dockShadow: '#000000',
    vip: '#B97B1F',
    vipSoft: 'rgba(240, 184, 90, 0.18)',
    // 播放页环境渐变：Apple Music 以专辑主色做氛围光，此处用中性系统灰近似，
    // accent 覆盖层会按主色再派生。
    playerTop: '#FDFDFE',
    playerBottom: '#F2F2F7',
  },
  dark: {
    accent: '#FB4B55',
    accentPressed: '#FC626B',
    accentSoft: 'rgba(251, 75, 85, 0.14)',
    accentBorder: 'rgba(251, 75, 85, 0.32)',
    onAccent: '#FFFFFF',
    gradientStart: '#FC5A6A',
    gradientEnd: '#FA233B',
    background: '#000000',
    card: '#1C1C1E',
    cardAlt: '#2C2C2E',
    border: 'rgba(84, 84, 88, 0.65)',
    text: '#FFFFFF',
    textSecondary: '#98989F',
    textTertiary: '#636368',
    placeholderStart: '#2C2C2E',
    placeholderEnd: '#1C1C22',
    danger: '#FF453A',
    dangerSoft: 'rgba(255, 69, 58, 0.14)',
    barSurface: 'rgba(22, 22, 24, 0.72)',
    barBorder: 'rgba(84, 84, 88, 0.60)',
    glassHighlight: 'rgba(255, 255, 255, 0.18)',
    dockShadow: '#000000',
    vip: '#F0C065',
    vipSoft: 'rgba(240, 192, 101, 0.14)',
    playerTop: '#16161A',
    playerBottom: '#000000',
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
