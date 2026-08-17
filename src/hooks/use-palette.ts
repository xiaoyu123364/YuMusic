import { useColorScheme } from 'react-native';

import { getPalette } from '@/constants/accents';
import type { AppPalette, SchemeName } from '@/constants/theme';
import { useAccentId, useMonetColor, useThemeMode } from '@/features/settings/store';
import { useAccentVersion } from '@/features/theme/system-accent';

export function useEffectiveScheme(): SchemeName {
  const systemScheme = useColorScheme();
  const themeMode = useThemeMode();
  if (themeMode === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return themeMode;
}

export function usePalette(): AppPalette {
  const scheme = useEffectiveScheme();
  const accentId = useAccentId();
  const monet = useMonetColor();
  // 订阅动态主色版本号，封面 Palette / 壁纸色变化时触发重渲染。
  useAccentVersion();
  return getPalette(accentId, scheme, monet);
}

export function useIsDark(): boolean {
  return useEffectiveScheme() === 'dark';
}
