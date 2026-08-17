import { requireNativeViewManager } from 'expo-modules-core';
import { createContext, memo, useContext } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * 原生液态玻璃（Liquid-Glass-Android）：
 * 通过 expo ViewManager 包装 QWEA0 的 LiquidGlassView，提供 iOS 26 风格的
 * 毛玻璃 + 折射 + 色散 + 触摸弹性。minSdk 24（经典管线）。
 *
 * 仅作为绝对定位背景层（pointerEvents=none），拖拽/点击由外层 reanimated 处理。
 */
const NativeLiquidGlassView = requireNativeViewManager(
  'ExpoMoekoeNative',
  'LiquidGlassSurfaceView'
);

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
});
