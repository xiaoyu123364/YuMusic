import { createContext, memo, useContext, type ComponentType } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { GlassView } from 'expo-glass-effect';
import { requireNativeViewManager } from 'expo-modules-core';

/**
 * 跨平台液态玻璃层：
 *
 * - Android：通过 expo ViewManager 包装自研 LiquidGlassSurfaceView（QWEA0 管线，
 *   支持折射 / 色散 / 触摸弹性，minSdk 24）。
 * - iOS：使用 expo-glass-effect 的 GlassView（iOS 26 原生 Liquid Glass），
 *   在 iOS 18 及以下会自动降级为 vibrancy / blur，无需任何自定义原生代码即可
 *   获得「真·液态玻璃」而非 BlurView 伪效果。
 *
 * 仅作为绝对定位背景层（pointerEvents=none），拖拽 / 点击由外层 reanimated 处理。
 *
 * 注意：自研原生 ViewManager 仅在 Android 上加载，避免在 iOS 上因该原生 View
 * 未注册而渲染崩溃（iOS 不存在 ExpoMoekoeNative 的 LiquidGlassSurfaceView）。
 */
let NativeLiquidGlassView: ComponentType<Record<string, unknown>> | null = null;
if (Platform.OS === 'android') {
  NativeLiquidGlassView = requireNativeViewManager(
    'ExpoMoekoeNative',
    'LiquidGlassSurfaceView'
  ) as ComponentType<Record<string, unknown>>;
}

/** 采样源（页面内容容器）的 native handle，由 Tabs 布局通过 Provider 下发。 */
export const BackdropContext = createContext<number | null>(null);

/** 读取页面内容容器的 native handle，用于液态玻璃采样背景。 */
export function useBackdropTargetId(): number | null {
  return useContext(BackdropContext);
}

export const LiquidGlassSurface = memo(function LiquidGlassSurface({
  radius = 28,
  backdropTargetId,
  style,
}: {
  radius?: number;
  backdropTargetId?: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  // Android：自研原生液态玻璃（带折射 / 色散 / 触摸弹性）。
  if (Platform.OS === 'android' && NativeLiquidGlassView) {
    return (
      <NativeLiquidGlassView
        cornerRadius={radius}
        refractionHeight={64}
        bevelWidth={16}
        dispersionStrength={0.12}
        saturation={150}
        aberrationIntensity={2.2}
        elasticity={0.18}
        enableChromaticAberration
        enableEdgeHighlight
        backdropTargetId={backdropTargetId}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }

  // iOS / 其它平台：expo-glass-effect 真·液态玻璃（iOS 26），自动降级。
  return (
    <GlassView
      glassEffectStyle="regular"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    />
  );
});
