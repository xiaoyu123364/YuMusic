import { requireNativeViewManager } from 'expo-modules-core';
import { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * 原生液态玻璃（Liquid-Glass-Android）：
 * 通过 expo ViewManager 包装 QWEA0 的 LiquidGlassView，提供 iOS 26 风格的
 * SDF 折射 + 棱镜色散 + 传感器高光 + 触摸弹性。minSdk 24（经典管线），
 * API 33+ 自动切 AGSL 透镜管线。
 *
 * 仅作为绝对定位背景层（pointerEvents=none），拖拽/点击由外层 reanimated 处理。
 */
const NativeLiquidGlassView = requireNativeViewManager(
  'ExpoMoekoeNative',
  'LiquidGlassSurfaceView'
);

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
