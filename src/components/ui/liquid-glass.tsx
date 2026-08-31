import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, findNodeHandle, StyleProp, ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import { BlurView } from 'expo-blur';

const BackdropContext = createContext<number | null>(null);

export function useBackdropTargetId(): number | null {
  return useContext(BackdropContext);
}

/**
 * 页面背景采样容器：使用标准 View 包裹，挂载 ref 获取原生节点句柄，
 * 100% 稳定，绝不引发 ViewManager 缺失闪退。
 */
export function LiquidGlassBackdrop({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [backdropTargetId, setBackdropTargetId] = useState<number | null>(null);
  const ref = useRef<View>(null);

  useEffect(() => {
    if (ref.current) {
      const handle = findNodeHandle(ref.current);
      if (handle) {
        setBackdropTargetId(handle);
      }
    }
  }, []);

  return (
    <BackdropContext.Provider value={backdropTargetId}>
      <View ref={ref} style={[StyleSheet.absoluteFill, style]}>
        {children}
      </View>
    </BackdropContext.Provider>
  );
}

let NativeGlassViewComponent: any = null;
let nativeViewLoadFailed = false;

function getNativeGlassComponent() {
  if (NativeGlassViewComponent) return NativeGlassViewComponent;
  if (nativeViewLoadFailed || Platform.OS === 'ios') return null;
  try {
    NativeGlassViewComponent = requireNativeViewManager('LiquidGlassSurfaceView');
    return NativeGlassViewComponent;
  } catch (_e) {
    nativeViewLoadFailed = true;
    return null;
  }
}

export function LiquidGlassSurface({
  radius = 16,
  refractionHeight = 24,
  refractionAmount = -14,
  blurRadius = 8,
  chromaticAberration = 0,
  depthEffect = false,
  tintColor,
  tintAlpha,
  enableHighlight = true,
  backdropTargetId,
  style,
}: {
  radius?: number;
  refractionHeight?: number;
  refractionAmount?: number;
  blurRadius?: number;
  chromaticAberration?: number;
  depthEffect?: boolean;
  tintColor?: string;
  tintAlpha?: number;
  enableHighlight?: boolean;
  backdropTargetId?: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  const NativeComponent = getNativeGlassComponent();

  if (!NativeComponent) {
    // 优雅降级为 BlurView，绝不闪退
    return (
      <BlurView
        intensity={Math.max(15, blurRadius * 10)}
        tint="default"
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }

  return (
    <NativeComponent
      style={[StyleSheet.absoluteFill, style]}
      cornerRadius={radius}
      refractionHeight={refractionHeight}
      refractionAmount={refractionAmount}
      blurAmount={blurRadius}
      chromaticAberration={chromaticAberration}
      depthEffect={depthEffect}
      surfaceTintColor={tintColor ? undefined : undefined}
      surfaceTintAlpha={tintAlpha}
      enableHighlight={enableHighlight}
      backdropTargetId={backdropTargetId}
    />
  );
}
