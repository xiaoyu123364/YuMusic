import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { View } from 'tamagui';

interface GooglePolygonSpinnerProps {
  size?: number;
  color?: string;
}

export function GooglePolygonSpinner({ size = 34, color = '#FA233B' }: GooglePolygonSpinnerProps) {
  const rotation = useSharedValue(0);
  const morphProgress = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 2400,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1,
      false
    );

    morphProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(2, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(3, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [rotation, morphProgress]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
  }));

  const shape1Style = useAnimatedStyle(() => {
    const scale = interpolate(morphProgress.value, [0, 1, 2, 3], [1, 0.75, 1.1, 0.85]);
    const radius = interpolate(morphProgress.value, [0, 1, 2, 3], [size * 0.45, size * 0.15, size * 0.35, size * 0.5]);
    return {
      width: size * 0.8,
      height: size * 0.8,
      borderRadius: radius,
      backgroundColor: color,
      transform: [{ scale }],
    };
  });

  const shape2Style = useAnimatedStyle(() => {
    const scale = interpolate(morphProgress.value, [0, 1, 2, 3], [0.8, 1.05, 0.7, 1]);
    const rotate = interpolate(morphProgress.value, [0, 1, 2, 3], [45, 90, 135, 180]);
    return {
      position: 'absolute',
      width: size * 0.65,
      height: size * 0.65,
      borderRadius: size * 0.2,
      backgroundColor: color,
      opacity: 0.75,
      transform: [{ rotate: `${rotate}deg` }, { scale }],
    };
  });

  return (
    <Animated.View style={spinStyle}>
      <Animated.View style={shape1Style} />
      <Animated.View style={shape2Style} />
    </Animated.View>
  );
}
