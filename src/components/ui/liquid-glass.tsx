import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type RefObject } from 'react';
import { StyleSheet, type StyleProp, type View, type ViewStyle } from 'react-native';

import { useBarBlur } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

/**
 * 液态玻璃层：expo-blur BlurView 真模糊 + 折射高光 + 棱镜色散边缘 + 内发光。
 *
 * Android 上必须传 `blurTarget`（指向包裹页面内容的 BlurTargetView）+ 显式
 * `blurMethod="dimezisBlurViewSdk31Plus"`，否则 BlurView 会退化为「半透明色块」——
 * 这是之前「没有液态玻璃」的根因（默认 blurMethod 是 none，不模糊）。
 */
export const LiquidGlassSurface = memo(function LiquidGlassSurface({
  radius = 28,
  blurTarget,
  style,
}: {
  radius?: number;
  blurTarget?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const isDark = useIsDark();
  const barBlur = useBarBlur();

  return (
    <>
      {/* 核心：真模糊背景（采样 blurTarget 指向的内容） */}
      <BlurView
        intensity={barBlur ? 80 : 0}
        tint={isDark ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget}
        blurReductionFactor={3}
        style={[StyleSheet.absoluteFill, style]}
      />
      {/* 顶部折射高光 */}
      <LinearGradient
        colors={[palette.glassHighlight, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.highlight, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        pointerEvents="none"
      />
      {/* 棱镜色散边缘（顶部 1.5px 彩虹带） */}
      <LinearGradient
        colors={['rgba(255,92,158,0.30)', 'rgba(61,139,255,0.30)', 'rgba(52,168,83,0.26)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.dispersion, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        pointerEvents="none"
      />
      {/* 对角折射光斑 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.20)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }]}
        pointerEvents="none"
      />
      {/* 底部内发光 */}
      <LinearGradient
        colors={['transparent', isDark ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.05)']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 0, y: 1 }}
        style={[styles.innerGlow, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }]}
        pointerEvents="none"
      />
    </>
  );
});

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
  },
  dispersion: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  innerGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
  },
});
