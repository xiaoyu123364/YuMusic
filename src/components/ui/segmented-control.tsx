import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/ui/glass';
import { useDesignSpec } from '@/features/theme/design-style';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { triggerHaptic } from '@/lib/haptics';

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

const SPRING = { damping: 22, stiffness: 260, mass: 0.9 };

/**
 * iOS 风格分段切换：玻璃滑块随选中项平滑滑动，且支持**按住滑块直接拖拽**切换。
 * 材质跟随设计风格（液态玻璃 / 毛玻璃 / 素面）。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const palette = usePalette();
  const isDark = useIsDark();
  const design = useDesignSpec();
  const kind = design.controlGlass;

  const [containerWidth, setContainerWidth] = useState(0);
  const segmentWidth = containerWidth > 0 ? (containerWidth - 8) / options.length : 0;
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  const position = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const isPressed = useSharedValue(false);

  // 外部 value 变化 → 滑块动画归位
  useEffect(() => {
    if (segmentWidth > 0) {
      position.value = withSpring(activeIndex * segmentWidth, SPRING);
    }
  }, [activeIndex, segmentWidth, position]);

  const selectIndex = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) {
      triggerHaptic();
      onChange(option.value);
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      dragStart.value = position.value;
      isPressed.value = true;
    })
    .onUpdate((event) => {
      const maxOffset = segmentWidth * (options.length - 1);
      position.value = Math.min(Math.max(dragStart.value + event.translationX, 0), maxOffset);
    })
    .onEnd((event) => {
      const maxOffset = segmentWidth * (options.length - 1);
      // 带速度预测：快速轻扫也能翻页（iOS 手感）
      const projected = position.value + event.velocityX * 0.08;
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(Math.min(Math.max(projected, 0), maxOffset) / segmentWidth))
      );
      position.value = withSpring(index * segmentWidth, SPRING);
      runOnJS(selectIndex)(index);
    })
    .onFinalize(() => {
      isPressed.value = false;
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.value },
      { scale: withSpring(isPressed.value ? 1.18 : 1, SPRING) }
    ],
  }));

  return (
    <XStack
      padding={2}
      height={44}
      borderRadius={14}
      backgroundColor={
        kind === 'plain'
          ? palette.cardAlt
          : kind === 'frost'
            ? 'transparent'
            : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)'
      }
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={kind === 'frost' || kind === 'plain' ? palette.border : palette.barBorder}
      overflow="hidden"
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      {kind === 'frost' ? <GlassPanel kind={kind} radius={14} blurIntensity={44} /> : null}
      {segmentWidth > 0 ? (
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 2,
                left: 2,
                width: segmentWidth,
                height: 40,
                borderRadius: 12,
                backgroundColor:
                  kind === 'liquid'
                    ? 'transparent' // 玻璃本体由原生折射层绘制，避免白块叠玻璃
                    : palette.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)', // 微晶高光边框
                shadowColor: palette.dockShadow,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0.4 : 0.12,
                shadowRadius: 8,
                elevation: 3,
                zIndex: 0,
              },
              thumbStyle,
            ]}>
            {kind === 'liquid' ? (
              <GlassPanel kind="liquid" variant="control" radius={12} blurIntensity={40} />
            ) : null}
          </Animated.View>
        </GestureDetector>
      ) : null}
      <XStack flex={1} zIndex={1} pointerEvents="box-none">
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <XStack
              key={option.value}
              flex={1}
              alignItems="center"
              justifyContent="center"
              borderRadius={12}
              transition="quick"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => {
                if (segmentWidth > 0) {
                  position.value = withSpring(index * segmentWidth, SPRING);
                }
                selectIndex(index);
              }}>
              <Text
                color={active ? palette.accent : palette.textTertiary}
                fontSize={13.5}
                fontWeight={active ? '700' : '500'}
                numberOfLines={1}>
                {option.label}
              </Text>
            </XStack>
          );
        })}
      </XStack>
    </XStack>
  );
}
