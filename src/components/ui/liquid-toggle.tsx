import React from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { GlassPanel } from '@/components/ui/glass';
import { triggerHaptic } from '@/lib/haptics';
import { usePalette } from '@/hooks/use-palette';

export interface LiquidToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  activeColor?: string;
  disabled?: boolean;
}

/**
 * 核心组件：液态开关 (Kyant0 风格)
 * - 圆润胶囊，开闭切换具有生动顺滑的动效
 * - 拖拽缩放与回弹
 */
export function LiquidToggle({
  checked,
  onCheckedChange,
  activeColor,
  disabled = false,
}: LiquidToggleProps) {
  const palette = usePalette();
  const themeAccent = activeColor || palette.accent;
  
  const isDark = palette.background === '#000000' || palette.background === '#101016';
  const inactiveBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  const progress = useSharedValue(checked ? 1 : 0);
  const dragProgress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withSpring(checked ? 1 : 0, { damping: 15, stiffness: 250 });
  }, [checked, progress]);

  const handleHaptic = () => {
    triggerHaptic('selection');
  };

  const toggle = () => {
    if (disabled) return;
    runOnJS(handleHaptic)();
    onCheckedChange(!checked);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      dragProgress.value = withSpring(1, { damping: 15, stiffness: 300 });
    })
    .onTouchesUp(() => {
      dragProgress.value = withSpring(0, { damping: 15, stiffness: 300 });
    })
    .onEnd((e) => {
      if (disabled) return;
      if (e.translationX > 5 && !checked) {
        runOnJS(toggle)();
      } else if (e.translationX < -5 && checked) {
        runOnJS(toggle)();
      } else if (Math.abs(e.translationX) <= 5) {
        runOnJS(toggle)();
      }
    });

  const tap = Gesture.Tap()
    .onEnd(() => {
      if (!disabled) {
        dragProgress.value = withSpring(1, { damping: 15, stiffness: 300 });
        setTimeout(() => {
          dragProgress.value = withSpring(0, { damping: 15, stiffness: 300 });
        }, 100);
        runOnJS(toggle)();
      }
    });

  const composedGesture = Gesture.Race(pan, tap);

  const trackAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [inactiveBg, themeAccent]
      ),
    };
  });

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    const translateX = progress.value * 28;
    const width = 22 + dragProgress.value * 6;
    
    const adjustedX = checked 
      ? translateX - (dragProgress.value * 6)
      : translateX;

    return {
      width,
      transform: [{ translateX: adjustedX }],
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.container, trackAnimatedStyle, disabled && styles.disabled]}>
        <Animated.View style={[styles.thumb, thumbAnimatedStyle]}>
           <GlassPanel kind="liquid" radius={11} variant="control" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  thumb: {
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  }
});
