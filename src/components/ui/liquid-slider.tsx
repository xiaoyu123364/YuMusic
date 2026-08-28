import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/ui/glass';
import { triggerHaptic } from '@/lib/haptics';

export interface LiquidSliderProps {
  value: number;
  max: number;
  onChange: (val: number) => void;
  onSlideEnd?: (val: number) => void;
  activeColor?: string;
  height?: number;
}

/**
 * 纯 Gesture Handler + Reanimated 驱动的全交互液态玻璃滑块
 * - 支持拖动与点击瞬间跳转
 * - 拖拽时带有 Q 弹放大阻尼动画
 * - 提供清脆的触觉反馈
 */
export function LiquidSlider({
  value,
  max,
  onChange,
  onSlideEnd,
  activeColor = '#ffffff',
  height = 32,
}: LiquidSliderProps) {
  const isDragging = useSharedValue(false);
  const width = useSharedValue(0);
  const thumbScale = useSharedValue(1);

  const emitChange = (x: number) => {
    if (width.value <= 0 || max <= 0) return;
    const ratio = Math.min(Math.max(x / width.value, 0), 1);
    onChange(Math.round(ratio * max));
  };

  const emitCommit = (x: number) => {
    if (width.value <= 0 || max <= 0) return;
    const ratio = Math.min(Math.max(x / width.value, 0), 1);
    onSlideEnd?.(Math.round(ratio * max));
  };

  const handleHaptic = () => {
    triggerHaptic('selection');
  };

  // 合并 Pan 和 Tap 支持顺畅拖拽与点击跳转
  const pan = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      isDragging.value = true;
      thumbScale.value = withSpring(1.35, { damping: 15, stiffness: 300 });
      runOnJS(handleHaptic)();
    })
    .onTouchesUp(() => {
      isDragging.value = false;
      thumbScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      runOnJS(handleHaptic)();
    })
    .onBegin((e) => {
      runOnJS(emitChange)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(emitChange)(e.x);
    })
    .onFinalize((e) => {
      runOnJS(emitCommit)(e.x);
    });

  const tap = Gesture.Tap()
    .onEnd((e) => {
      runOnJS(handleHaptic)();
      runOnJS(emitChange)(e.x);
      runOnJS(emitCommit)(e.x);
    });

  const composedGesture = Gesture.Race(pan, tap);

  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const thumbSize = 28; // 胶囊直径
  const thumbRadius = 14; 
  const thumbOffset = (height - thumbSize) / 2;

  const trackAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: `${ratio * 100}%`,
    };
  });

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    // 限制 Thumb 不会超出轨道左右两端
    let thumbX = ratio * width.value - thumbSize / 2;
    // 为避免越界可开启钳制，但传统滑块 Thumb 中心随边缘移动
    if (thumbX < 0) thumbX = 0;
    if (width.value > 0 && thumbX > width.value - thumbSize) {
      thumbX = width.value - thumbSize;
    }
    return {
      transform: [
        { translateX: width.value > 0 ? thumbX : 0 },
        { scale: thumbScale.value }
      ],
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={[styles.container, { height }]}
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}
      >
        {/* 轨道为液态玻璃底槽 */}
        <View style={[StyleSheet.absoluteFill, styles.trackBg, { borderRadius: height / 2 }]}>
          <GlassPanel kind="liquid" radius={height / 2} variant="bar" />
        </View>

        {/* 已走过的进度条高亮并随滑块到达变色 */}
        <Animated.View
          style={[
            styles.activeTrack,
            { backgroundColor: activeColor, borderRadius: height / 2 },
            trackAnimatedStyle,
          ]}
        />

        {/* 内部高透液态玻璃胶囊 */}
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
              top: thumbOffset,
              borderRadius: thumbRadius,
            },
            thumbAnimatedStyle,
          ]}
        >
          <GlassPanel kind="liquid" radius={thumbRadius} variant="control" />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    overflow: 'hidden',
  },
  activeTrack: {
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0.6, // 让高亮层透出下方的玻璃质感
  },
  thumb: {
    position: 'absolute',
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
});
