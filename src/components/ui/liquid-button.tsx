import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/ui/glass';
import { triggerHaptic } from '@/lib/haptics';
import { usePalette } from '@/hooks/use-palette';

export interface LiquidButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle | ViewStyle[];
}

/**
 * 核心组件：液态按钮 (Kyant0 风格)
 * - 内嵌液态玻璃，支持阻尼按压缩放
 */
export function LiquidButton({
  children,
  onPress,
  variant = 'glass',
  size = 'md',
  style,
}: LiquidButtonProps) {
  const palette = usePalette();
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
      runOnJS(triggerHaptic)('selection');
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    })
    .onEnd(() => {
      if (onPress) {
        runOnJS(onPress)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const sizeStyles = {
    sm: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    md: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16 },
    lg: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 20 },
  };

  const bgColors = {
    primary: palette.accent,
    secondary: palette.cardAlt,
    glass: 'transparent',
  };

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[
          styles.container,
          sizeStyles[size],
          { backgroundColor: bgColors[variant] },
          style as any,
          animatedStyle,
        ]}
      >
        {variant === 'glass' && (
          <View style={StyleSheet.absoluteFill}>
            <GlassPanel kind="liquid" radius={sizeStyles[size].borderRadius} />
          </View>
        )}
        <Animated.View style={styles.content}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
