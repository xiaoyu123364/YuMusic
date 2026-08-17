import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View } from 'tamagui';

import { usePalette } from '@/hooks/use-palette';

/**
 * Google Material 3 风格的圆弧旋转加载动画，替代原生转圈菊花。
 * 用 180° 圆弧(border 技巧)持续旋转，视觉与 Material 3 CircularProgressIndicator 一致。
 */
export function MaterialLoading({
  size = 24,
  color,
  thickness = 2.5,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const palette = usePalette();
  const resolvedColor = color ?? palette.accent;
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
    return () => {
      rotation.value = 0;
    };
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  return (
    <View width={size} height={size} alignItems="center" justifyContent="center">
      <Animated.View
        style={[
          styles.arc,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: thickness,
            borderTopColor: resolvedColor,
            borderRightColor: resolvedColor,
          },
          spinStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  arc: {
    borderColor: 'transparent',
  },
});
