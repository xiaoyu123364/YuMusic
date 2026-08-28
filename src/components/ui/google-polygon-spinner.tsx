import React, { useEffect } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';

interface GooglePolygonSpinnerProps {
  size?: number;
  color?: string;
}

function getRadius(theta: number, shape: number): number {
  if (shape === 0) return 1 + 0.5 * Math.cos(4 * theta); // 四角平滑星形
  if (shape === 1) return 1 + 0.1 * Math.cos(4 * theta); // 圆角正方形
  if (shape === 2) return 1 + 0.3 * Math.cos(8 * theta); // 八角花瓣
  return 1; // 圆形液滴
}

export function GooglePolygonSpinner({ size = 32, color = '#4285F4' }: GooglePolygonSpinnerProps) {
  const rotation = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 3000,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1,
      false
    );
    progress.value = withRepeat(
      withTiming(4, {
        duration: 4000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    width: size,
    height: size,
  }));

  const path = useDerivedValue(() => {
    const p = progress.value;
    const center = size / 2;
    const baseRadius = size * 0.35;
    
    const shapeId = Math.floor(p) % 4;
    const nextShapeId = (shapeId + 1) % 4;
    const t = p - Math.floor(p);

    const skPath = Skia.Path.Make();
    const resolution = 60;
    for (let i = 0; i <= resolution; i++) {
      const theta = (i / resolution) * Math.PI * 2;
      const r1 = getRadius(theta, shapeId);
      const r2 = getRadius(theta, nextShapeId);
      const r = baseRadius * (r1 * (1 - t) + r2 * t);
      
      const x = center + r * Math.cos(theta);
      const y = center + r * Math.sin(theta);
      if (i === 0) skPath.moveTo(x, y);
      else skPath.lineTo(x, y);
    }
    skPath.close();
    return skPath;
  });

  return (
    <Animated.View style={animatedStyle}>
      <Canvas style={{ flex: 1 }}>
        <Path path={path} color={color} style="fill" />
      </Canvas>
    </Animated.View>
  );
}
