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
 * 核心组件：液态滑块 (Kyant0 风格)
 * - 细轨正圆，6dp 轨道高度，20dp 极简滑钮
 * - 带有丝滑的拖动阻尼回弹
 * - 点击瞬间即达并伴有清脆反馈
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
  
  // 严格依据 Kyant0 标准尺寸
  const trackHeight = 6;
  const trackRadius = 3;
  const thumbSize = 20;
  const thumbRadius = 10;
  
  // 计算垂直居中偏移
  const thumbOffset = (height - thumbSize) / 2;
  const trackOffset = (height - trackHeight) / 2;

  const trackAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: `${ratio * 100}%`,
    };
  });

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    let thumbX = ratio * width.value - thumbSize / 2;
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
        {/* 细轨道底槽：半透明磨砂液态玻璃 */}
        <View style={[styles.trackBg, { height: trackHeight, top: trackOffset, borderRadius: trackRadius }]}>
          <GlassPanel kind="liquid" radius={trackRadius} variant="bar" />
        </View>

        {/* 细轨道进度层：不会撑大的跟随变色 */}
        <Animated.View
          style={[
            styles.activeTrack,
            { height: trackHeight, top: trackOffset, backgroundColor: activeColor, borderRadius: trackRadius },
            trackAnimatedStyle,
          ]}
        />

        {/* 精致小圆滑钮 */}
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
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  activeTrack: {
    position: 'absolute',
    left: 0,
    opacity: 0.8,
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
