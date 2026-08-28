import { createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Platform, StyleSheet, View, findNodeHandle, type StyleProp, type ViewStyle } from 'react-native';

import { GlassView } from 'expo-glass-effect';
import { requireNativeViewManager } from 'expo-modules-core';

import { useIsDark, usePalette } from '@/hooks/use-palette';

/** 解析 '#RRGGBB' / '#RRGGBBAA' / 'rgba(r,g,b,a)' → 原生 Int（ARGB，alpha=FF，alpha 由独立 prop 下发）。 */
function parseColorToInt(color: string): number | null {
  const c = color.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex6) return (0xff000000 | parseInt(hex6[1], 16)) | 0;
  const hex8 = /^#([0-9a-f]{8})$/i.exec(c);
  if (hex8) {
    const v = parseInt(hex8[1], 16);
    return (((v & 0xffffff) | 0xff000000) | 0) as number; // 取 RGB，alpha 用独立 prop
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,|$)/i.exec(c);
  if (rgba) {
    const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map((n) => Math.min(255, Number(n)));
    return ((0xff << 24) | (r << 16) | (g << 8) | b) | 0;
  }
  return null;
}

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
let NativeBackdropAnchor: ComponentType<Record<string, unknown>> | null = null;
if (Platform.OS === 'android') {
  NativeLiquidGlassView = requireNativeViewManager(
    'ExpoMoekoeNative',
    'LiquidGlassSurfaceView'
  ) as ComponentType<Record<string, unknown>>;
  // 页面内容锚点：挂在内容容器内的零视觉原生 View，attach 时自注册进
  // GlassBackdropRegistry，让玻璃绕开新架构 tag 查找直接拿到采样源。
  NativeBackdropAnchor = requireNativeViewManager(
    'ExpoMoekoeNative',
    'LiquidGlassBackdropAnchor'
  ) as ComponentType<Record<string, unknown>>;
}

/** 采样源（页面内容容器）的 native handle，由 Tabs 布局通过 Provider 下发。 */
export const BackdropContext = createContext<number | null>(null);

/** 读取页面内容容器的 native handle，用于液态玻璃采样背景。 */
export function useBackdropTargetId(): number | null {
  return useContext(BackdropContext);
}

/**
 * 液态玻璃采样容器：测量自身内容容器的 native handle 并通过 Context 下发。
 * 任何包含液态玻璃控件的屏幕（Tabs、设置页等）都应包一层，
 * 否则屏幕外的玻璃控件拿不到采样源而降级成模糊/素面。
 */
export function LiquidGlassBackdrop({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const backdropRef = useRef<View>(null);
  const [backdropTargetId, setBackdropTargetId] = useState<number | null>(null);

  const captureBackdrop = useCallback(() => {
    const id = findNodeHandle(backdropRef.current);
    if (id != null) {
      setBackdropTargetId(id);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (captureBackdrop()) return;
    let raf = 0;
    const tick = () => {
      if (captureBackdrop()) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [captureBackdrop]);

  return (
    <BackdropContext.Provider value={backdropTargetId}>
      <View
        ref={backdropRef}
        collapsable={false}
        style={[{ flex: 1 }, style]}
        onLayout={captureBackdrop}>
        {NativeBackdropAnchor ? (
          <NativeBackdropAnchor
            pointerEvents="none"
            collapsable={false}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {children}
      </View>
    </BackdropContext.Provider>
  );
}


export const LiquidGlassSurface = memo(function LiquidGlassSurface({
  radius = 28,
  backdropTargetId,
  style,
  /** 折射区高度：大表面（底栏）64；小控件（滑块/选项卡）应收小，否则边缘糊成光环。 */
  refractionHeight = 64,
  /** 倒角宽度：大表面 16；小控件建议 4~6。 */
  bevelWidth = 16,
  /** 色散强度：小控件减弱，避免小面积上出现彩边脏斑。 */
  dispersionStrength = 0.35,
  aberrationIntensity = 5.0,
}: {
  radius?: number;
  backdropTargetId?: number | null;
  style?: StyleProp<ViewStyle>;
  refractionHeight?: number;
  bevelWidth?: number;
  dispersionStrength?: number;
  aberrationIntensity?: number;
}) {
  const isDark = useIsDark();
  const palette = usePalette();
  // 采样为空/透明时的兜底底色（不透明），防止原生层把透明样本画成黑块
  const fallbackColor = isDark ? 0xff1a1c22 : 0xfff2f4f8;

  // KSU（KernelSU）液态玻璃配方：
  // - 强模糊 blurRadius≈25px → blurAmount ≈ (25-6)/180 ≈ 0.105
  // - 表面用主题 barSurface 色重着色（对应 miuix BlurExt 的 surface.copy(0.87f)，
  //   这里按音乐 App 背景复杂度调低到 暗色0.20 / 亮色0.24，彻底激发底层物理色散效果）
  const ksuBlurAmount = 0.105;
  const tintInt = parseColorToInt(palette.barSurface);
  const tintAlpha = isDark ? 0.20 : 0.24;

  // Android：自研原生液态玻璃（带折射 / 色散 / 触摸弹性）。
  if (Platform.OS === 'android' && NativeLiquidGlassView) {
    return (
      <NativeLiquidGlassView
        cornerRadius={radius}
        refractionHeight={refractionHeight}
        bevelWidth={bevelWidth}
        dispersionStrength={dispersionStrength}
        blurAmount={ksuBlurAmount}
        saturation={150}
        aberrationIntensity={aberrationIntensity}
        elasticity={0.18}
        enableChromaticAberration
        enableEdgeHighlight
        fallbackColor={fallbackColor}
        surfaceTintColor={tintInt ?? fallbackColor}
        surfaceTintAlpha={tintAlpha}
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
