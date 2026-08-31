import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, findNodeHandle, StyleProp, ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import { BlurView } from 'expo-blur';

const BackdropContext = createContext<number | null>(null);

export function useBackdropTargetId(): number | null {
  return useContext(BackdropContext);
}

export function LiquidGlassBackdrop({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [backdropTargetId, setBackdropTargetId] = useState<number | null>(null);
  const ref = useRef<View>(null);

  useEffect(() => {
    if (ref.current) {
      setBackdropTargetId(findNodeHandle(ref.current));
    }
  }, []);

  const Component = Platform.OS !== 'ios' ? requireNativeViewManager('LiquidGlassBackdropAnchor') : View;

  return (
    <BackdropContext.Provider value={backdropTargetId}>
      {/* @ts-ignore */}
      <Component ref={ref} style={[StyleSheet.absoluteFill, style]}>
        {children}
      </Component>
    </BackdropContext.Provider>
  );
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
  if (Platform.OS === 'ios') {
    return <BlurView intensity={blurRadius * 10} style={[StyleSheet.absoluteFill, style]} />;
  }

  const Component = requireNativeViewManager('LiquidGlassSurfaceView');

  return (
    // @ts-ignore
    <Component
      style={[StyleSheet.absoluteFill, style]}
      radius={radius}
      refractionHeight={refractionHeight}
      refractionAmount={refractionAmount}
      blurRadius={blurRadius}
      chromaticAberration={chromaticAberration}
      depthEffect={depthEffect}
      tintColor={tintColor}
      tintAlpha={tintAlpha}
      enableHighlight={enableHighlight}
      backdropTargetId={backdropTargetId}
    />
  );
}
