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
  const velocityX = useSharedValue(0);

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
    .activeOffsetX([-4, 4])
    .failOffsetY([-30, 30])
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      dragStart.value = position.value;
      isPressed.value = true;
      runOnJS(triggerHaptic)();
    })
    .onUpdate((event) => {
      const maxOffset = segmentWidth * (options.length - 1);
      position.value = Math.min(Math.max(dragStart.value + event.translationX, 0), maxOffset);
      velocityX.value = withSpring(event.velocityX, { damping: 18, stiffness: 200 });
    })
    .onEnd((event) => {
      const maxOffset = segmentWidth * (options.length - 1);
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
      velocityX.value = withSpring(0, { damping: 12, stiffness: 240 });
    });

  const thumbStyle = useAnimatedStyle(() => {
    const baseScale = withSpring(isPressed.value ? 1.30 : 1, SPRING);
    const stretch = Math.min(0.20, Math.abs(velocityX.value) / 3000);
    const scaleX = baseScale * (1 + stretch);
    const scaleY = baseScale * (1 - stretch * 0.6);
    return {
      transform: [
        { translateX: position.value },
        { scaleX },
        { scaleY },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <XStack
        padding={3}
        height={48}
        borderRadius={24}
        backgroundColor={
          kind === 'plain'
            ? palette.cardAlt
            : kind === 'frost'
              ? 'transparent'
              : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)'
        }
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={kind === 'frost' || kind === 'plain' ? palette.border : palette.barBorder}
        overflow="visible"
        onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
        {kind === 'frost' ? <GlassPanel kind={kind} radius={24} blurIntensity={44} /> : null}
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 3,
                left: 3,
                width: segmentWidth,
                height: 42,
                borderRadius: 21,
                backgroundColor:
                  kind === 'liquid'
                    ? 'transparent'
                    : palette.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
                shadowColor: palette.dockShadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.4 : 0.15,
                shadowRadius: 10,
                elevation: 4,
                zIndex: 0,
              },
              thumbStyle,
            ]}>
            {kind === 'liquid' ? (
              <GlassPanel kind="liquid" variant="control" radius={21} blurIntensity={40} />
            ) : null}
          </Animated.View>
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
    </GestureDetector>
  );
}
