import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { TamaguiProvider } from 'tamagui';

import { hydrateSettings, useSettingsHydrated } from '@/features/settings/store';
import { FloatingLyricsController } from '@/features/android/floating-lyrics';
import { MediaSessionController } from '@/features/android/media-session';
import { isNativeAvailable, logNativeDiagnostics } from '@/features/android/native';
import { autoClaimVipBenefits } from '@/features/account/vip-benefits';
import { hydrateEqualizer } from '@/features/player/equalizer';
import { hydrateLocalMusic } from '@/features/local/local-store';
import { hydrateRecentPlays } from '@/features/recent/recent-store';
import { loadSystemAccent } from '@/features/theme/system-accent';
import { ToastHost } from '@/components/ui/toast';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { log } from '@/lib/logger';
import { tamaguiConfig } from '../../tamagui.config';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void hydrateSettings();
// 读取 Android 12+ 系统壁纸动态主色（同步）
loadSystemAccent();
// 水合并应用已保存的均衡器预设
void hydrateEqualizer();
// 水合本地音乐清单与最近播放记录（需在首次播放前完成，避免覆盖）
hydrateLocalMusic();
hydrateRecentPlays();
// 启动即静默领取 VIP 权益（幂等，未登录/已领取自动跳过）
void autoClaimVipBenefits();
// 启动日志：便于在「设置 → 运行日志」中定位问题
log('app', `启动 platform=${Platform.OS} 原生模块=${isNativeAvailable()}`);
logNativeDiagnostics();

export default function RootLayout() {
  const hydrated = useSettingsHydrated();
  const palette = usePalette();
  const isDark = useEffectiveScheme() === 'dark';

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.accent,
        background: palette.background,
        card: palette.card,
        text: palette.text,
        border: 'transparent',
      },
    };
  }, [isDark, palette]);

  useEffect(() => {
    if (hydrated) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hydrated]);

  if (!hydrated) {
    // 原生 splash 覆盖期间完成偏好读取,首帧即正确主题。
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={isDark ? 'dark' : 'light'}>
      <ThemeProvider value={navTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              animationDuration: 300,
              gestureEnabled: true,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen name="playlist/[id]" />
          <Stack.Screen name="rank/[id]" />
          <Stack.Screen name="album/[id]" />
          <Stack.Screen
            name="search"
            options={{
              animation: 'fade_from_bottom',
              animationDuration: 300,
            }}
          />
          <Stack.Screen
            name="recognize"
            options={{
              animation: 'fade_from_bottom',
              animationDuration: 300,
            }}
          />
          <Stack.Screen name="cloud" />
          <Stack.Screen
            name="login"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              animationDuration: 300,
            }}
          />
          <Stack.Screen name="settings" />
          <Stack.Screen name="web" />
        </Stack>
        <ToastHost />
        <MediaSessionController />
        <FloatingLyricsController />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </TamaguiProvider>
  );
}
