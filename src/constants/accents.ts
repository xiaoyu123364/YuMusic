import { Palette, type AppPalette, type PaletteColor, type SchemeName } from '@/constants/theme';
import { getDynamicAccent } from '@/features/theme/system-accent';

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): `#${string}` {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase() as `#${string}`;
}

/** 按 t 权重向 target 做 sRGB 每通道线性插值。 */
export function mixHex(base: string, target: string, t: number): `#${string}` {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

const tint = (hex: string, t: number) => mixHex(hex, '#FFFFFF', t);
const shade = (hex: string, t: number) => mixHex(hex, '#000000', t);

export function withAlpha(hex: string, alpha: number): `rgba(${string})` {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type AccentPresetId =
  | 'dynamic'
  | 'pink'
  | 'blue'
  | 'green'
  | 'gold'
  | 'purple'
  | 'red'
  | 'teal'
  | 'orange';

type AccentOverlay = Pick<
  AppPalette,
  | 'accent'
  | 'accentPressed'
  | 'accentSoft'
  | 'accentBorder'
  | 'onAccent'
  | 'gradientStart'
  | 'gradientEnd'
  | 'placeholderStart'
  | 'playerTop'
>;

export type AccentPreset = {
  id: AccentPresetId;
  label: string;
  light: string;
  dark: string;
  /** 某预设某字段派生效果不佳时的逐字段覆写逃生舱。 */
  overrides?: Partial<Record<SchemeName, Partial<AccentOverlay>>>;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  // 动态取色（Material You）：读取 Android 12+ 系统壁纸主色 / 当前封面 Palette，
  // 实时注入全局主题。此处为不可用（低版本/提取失败）时的回退色。
  { id: 'dynamic', label: '动态', light: '#3D8BFF', dark: '#66A3FF' },
  // 固定色板：与动态取色并存，随时可切。
  { id: 'pink', label: '樱粉', light: '#FF5C9E', dark: '#FF7EB6' },
  { id: 'blue', label: '远峰蓝', light: '#3D8BFF', dark: '#66A3FF' },
  { id: 'green', label: '松石绿', light: '#2FA36B', dark: '#5BC48E' },
  { id: 'gold', label: '琥珀金', light: '#D89A1E', dark: '#F0B429' },
  { id: 'purple', label: '星紫', light: '#8B4FE8', dark: '#A97BF5' },
  { id: 'red', label: '绯红', light: '#E5484D', dark: '#FF6B6E' },
  { id: 'teal', label: '湖青', light: '#0E9BA4', dark: '#3FC1C9' },
  { id: 'orange', label: '落日橙', light: '#F0641E', dark: '#FF8A50' },
];

export const DEFAULT_ACCENT_ID: AccentPresetId = 'dynamic';

export function isAccentPresetId(value: unknown): value is AccentPresetId {
  return typeof value === 'string' && ACCENT_PRESETS.some((preset) => preset.id === value);
}

/** 派生系数用现有粉色手写值校准:对 #FF5C9E/#FF7EB6 输出精确或 Δ≤7 且均在非交互面上。 */
function buildAccentOverlay(preset: AccentPreset, scheme: SchemeName): AccentOverlay {
  const { light, dark } = preset;
  const shared = { gradientStart: tint(light, 0.3), gradientEnd: light as PaletteColor };
  const overlay: AccentOverlay =
    scheme === 'light'
      ? {
          accent: light as PaletteColor,
          accentPressed: shade(light, 0.08) as PaletteColor,
          accentSoft: withAlpha(light, 0.1) as PaletteColor,
          accentBorder: withAlpha(light, 0.24) as PaletteColor,
          onAccent: '#FFFFFF' as PaletteColor,
          ...shared,
          placeholderStart: tint(light, 0.83) as PaletteColor,
          playerTop: tint(light, 0.91) as PaletteColor,
        }
      : {
          accent: dark as PaletteColor,
          accentPressed: tint(dark, 0.16) as PaletteColor,
          accentSoft: withAlpha(dark, 0.14) as PaletteColor,
          accentBorder: withAlpha(dark, 0.32) as PaletteColor,
          onAccent: shade(dark, 0.87) as PaletteColor,
          ...shared,
          placeholderStart: mixHex(dark, Palette.dark.background, 0.86) as PaletteColor,
          playerTop: mixHex(dark, Palette.dark.background, 0.9) as PaletteColor,
        };
  return { ...overlay, ...preset.overrides?.[scheme] };
}

/** Monet 风格表面派生：把主色以较低权重混入中性表面，形成带色调的柔和层次（Material You 精髓）。
 *  权重已上调，确保动态取色在背景/卡片/边框上肉眼可见，同时保留对比度与可读性。 */
function buildMonetSurface(preset: AccentPreset, scheme: SchemeName): Partial<AppPalette> {
  const accent = scheme === 'light' ? preset.light : preset.dark;
  if (scheme === 'light') {
    return {
      background: mixHex(Palette.light.background, accent, 0.07) as PaletteColor,
      card: mixHex(Palette.light.card, accent, 0.05) as PaletteColor,
      cardAlt: mixHex(Palette.light.cardAlt, accent, 0.09) as PaletteColor,
      border: withAlpha(mixHex('#1B1F27', accent, 0.45), 0.13) as PaletteColor,
      barSurface: withAlpha(mixHex('#FAFAFA', accent, 0.1), 0.55) as PaletteColor,
      placeholderStart: tint(accent, 0.78) as PaletteColor,
    };
  }
  return {
    background: mixHex(Palette.dark.background, accent, 0.08) as PaletteColor,
    card: mixHex(Palette.dark.card, accent, 0.09) as PaletteColor,
    cardAlt: mixHex(Palette.dark.cardAlt, accent, 0.1) as PaletteColor,
    border: withAlpha(mixHex('#FFFFFF', accent, 0.35), 0.15) as PaletteColor,
    barSurface: withAlpha(mixHex('#121214', accent, 0.14), 0.55) as PaletteColor,
    placeholderStart: mixHex(accent, Palette.dark.background, 0.8) as PaletteColor,
  };
}

const paletteCache = new Map<string, AppPalette>();

/** 合成 palette;同 (accentId, scheme, monet) 永远返回同一对象引用,保证下游 memo 有效。 */
export function getPalette(
  accentId: AccentPresetId,
  scheme: SchemeName,
  monet = false
): AppPalette {
  let preset = ACCENT_PRESETS.find((item) => item.id === accentId) ?? ACCENT_PRESETS[0];

  // 动态取色：用封面 Palette / 系统壁纸主色覆盖，浅色用暗化主色、深色用亮化主色。
  if (accentId === 'dynamic') {
    const sys = getDynamicAccent();
    if (sys) {
      preset = {
        ...preset,
        light: shade(sys.primary, 0.16),
        dark: tint(sys.primary, 0.16),
      };
    }
  }

  const key = `${accentId}:${scheme}:${monet ? 'm' : 'n'}:${preset.light}`;
  let cached = paletteCache.get(key);
  if (!cached) {
    cached = {
      ...Palette[scheme],
      ...buildAccentOverlay(preset, scheme),
      ...(monet ? buildMonetSurface(preset, scheme) : {}),
    };
    paletteCache.set(key, cached);
  }
  return cached;
}
