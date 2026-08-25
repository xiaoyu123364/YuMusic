import { BlurView } from 'expo-blur';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { View } from 'tamagui';

import {
  LiquidGlassSurface,
  useBackdropTargetId,
} from '@/components/ui/liquid-glass';
import type { GlassKind } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

/**
 * 设计风格统一材质面板（绝对定位背景层，pointerEvents=none）：
 * - liquid：原生液态玻璃（Android 自研折射管线 / iOS GlassView），
 *   无 backdrop 或不可用时自动降级为 frost；
 * - frost：BlurView 毛玻璃（Material Expressive 风）；
 * - plain：半透明素面卡片。
 *
 * variant 区分大表面（bar：底栏/播放条）与小控件（control：滑块/选项卡）：
 * 小控件用更轻的折射/倒角参数，避免原生管线在小面积上糊出灰光环。
 */
export function GlassPanel({
  kind,
  radius = 20,
  blurIntensity = 46,
  variant = 'bar',
  style,
}: {
  kind: GlassKind;
  radius?: number;
  blurIntensity?: number;
  variant?: 'bar' | 'control';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const isDark = useIsDark();
  const backdropTargetId = useBackdropTargetId();

  if (kind === 'liquid' && backdropTargetId != null) {
    return (
      <LiquidGlassSurface
        radius={radius}
        backdropTargetId={backdropTargetId}
        refractionHeight={variant === 'control' ? 18 : 64}
        bevelWidth={variant === 'control' ? 5 : 16}
        dispersionStrength={variant === 'control' ? 0.05 : 0.12}
        aberrationIntensity={variant === 'control' ? 1 : 2.2}
        style={style}
      />
    );
  }

  if (kind === 'liquid' || kind === 'frost') {
    return (
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }

  return (
    <View
      position="absolute"
      left={0}
      right={0}
      top={0}
      bottom={0}
      borderRadius={radius}
      backgroundColor={palette.barSurface}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={palette.border}
      style={style}
    />
  );
}
