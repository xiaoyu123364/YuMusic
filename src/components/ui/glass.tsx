import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LiquidGlassSurface, useBackdropTargetId } from './liquid-glass';
import { BlurView } from 'expo-blur';
import { useLiquidGlass } from '@/features/settings/store';
import { useIsDark } from '@/hooks/use-palette';

type GlassPanelProps = {
  kind?: 'liquid' | 'frost' | 'plain';
  variant?: 'bar' | 'control' | 'card';
  radius?: number;
  blurIntensity?: number;
  style?: StyleProp<ViewStyle>;
};

export function GlassPanel({ kind = 'liquid', variant = 'card', radius = 16, blurIntensity, style }: GlassPanelProps) {
  const liquidGlass = useLiquidGlass();
  const isDark = useIsDark();
  const backdropTargetId = useBackdropTargetId();

  let refractionHeight = 16;
  let refractionAmount = -10;
  let blurRadius = 6;
  let chromaticAberration = 0;

  if (variant === 'bar') {
    refractionHeight = 24;
    refractionAmount = -14;
    blurRadius = 8;
    chromaticAberration = 0;
  } else if (variant === 'control') {
    refractionHeight = 10;
    refractionAmount = -14;
    blurRadius = 4;
    chromaticAberration = 1;
  }

  const actualKind = liquidGlass && kind === 'liquid' ? 'liquid' : (kind === 'plain' ? 'plain' : 'frost');

  if (actualKind === 'liquid') {
    return (
      <LiquidGlassSurface
        radius={radius}
        refractionHeight={refractionHeight}
        refractionAmount={refractionAmount}
        blurRadius={blurRadius}
        chromaticAberration={chromaticAberration}
        backdropTargetId={backdropTargetId}
        style={style}
      />
    );
  }

  if (actualKind === 'frost') {
    return (
      <BlurView
        intensity={blurIntensity ?? blurRadius * 10}
        tint={isDark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' },
        style,
      ]}
    />
  );
}
