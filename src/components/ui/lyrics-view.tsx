import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, YStack } from 'tamagui';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { usePlayerProgressSelector } from '@/features/player/store';
import type { LyricLine, LyricsStatus } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { MaterialLoading } from '@/components/ui/loading';

// Tamagui Text 的动画化包装：支持 reanimated 驱动的颜色/缩放过渡
const AnimatedText = Animated.createAnimatedComponent(Text);

type LyricsViewProps = {
  lines: LyricLine[];
  status: LyricsStatus;
  onSeekLine?: (line: LyricLine) => void;
  /**
   * 上下渐隐遮罩的底色：必须与所在页面的实际背景色一致，
   * 否则遮罩会形成「歌词界面底色与页面不同」的色块感
   * （播放页背景是 playerTop→playerBottom 渐变，而非 palette.background）。
   */
  fadeTopColor?: string;
  fadeBottomColor?: string;
};

const RESUME_AUTO_SCROLL_MS = 3500;

type LyricRowProps = {
  line: LyricLine;
  active: boolean;
  /** 当前行歌词的持续时长（毫秒），用于渐进高亮动画。 */
  lineDurationMs: number;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
};

// 每一行用 memo + 稳定的回调，仅当 active 状态切换时才重渲染，避免整列表抖动。
// 高亮过渡：颜色用 interpolateColor 平滑渐变，缩放用 spring 弹性放大（Apple Music 质感）。
const LyricRow = memo(function LyricRow({
  line,
  active,
  lineDurationMs,
  activeColor,
  inactiveColor,
  onLayoutLine,
  onSeekLine,
}: LyricRowProps) {
  // 初值直接取当前状态，避免首次挂载时从暗色弹到高亮的闪动
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (active) {
      // 根据歌词行持续时长做线性渐进高亮，模拟"唱到哪亮到哪"
      const duration = Math.max(300, Math.min(lineDurationMs, 8000));
      progress.value = withTiming(1, { duration, easing: Easing.linear });
    } else {
      // 离开时快速回暗
      progress.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
    }
  }, [active, lineDurationMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor as string, activeColor as string]
    ),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 1.07], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <AnimatedText
      onLayout={(event) => onLayoutLine(event.nativeEvent.layout.y)}
      onPress={onSeekLine ? () => onSeekLine(line) : undefined}
      suppressHighlighting
      textAlign="center"
      paddingVertical={11}
      fontSize={16}
      lineHeight={25}
      fontWeight={active ? '700' : '500'}
      style={animatedStyle}>
      {line.text}
    </AnimatedText>
  );
});

export function LyricsView({
  lines,
  status,
  onSeekLine,
  fadeTopColor,
  fadeBottomColor,
}: LyricsViewProps) {
  const palette = usePalette();
  const isDark = useIsDark();
  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const userScrollUntil = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const activeIndex = usePlayerProgressSelector(({ positionMs }) =>
    findActiveLyricIndex(lines, positionMs + 240)
  );

  const activeColor = palette.accent;
  const inactiveColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

  const handleLayoutLine = useCallback((index: number, offset: number) => {
    lineOffsets.current[index] = offset;
  }, []);

  useEffect(() => {
    lineOffsets.current = [];
  }, [lines]);

  useEffect(() => {
    if (activeIndex < 0 || !viewportHeight || Date.now() < userScrollUntil.current) {
      return;
    }

    const offset = lineOffsets.current[activeIndex];
    if (typeof offset !== 'number') {
      return;
    }

    // 原生平滑滚动，不触发 JS 逐帧计算。
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - viewportHeight * 0.42),
      animated: true,
    });
  }, [activeIndex, viewportHeight]);

  if (status === 'loading' || status === 'idle') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={12}>
        <MaterialLoading size={32} color={palette.accent} />
        <Text color={palette.textTertiary} fontSize={13}>
          歌词加载中
        </Text>
      </YStack>
    );
  }

  if (!lines.length) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={6}>
        <Text color={palette.textSecondary} fontSize={16} fontWeight="600">
          暂无歌词
        </Text>
        <Text color={palette.textTertiary} fontSize={12.5}>
          纯音乐，请欣赏
        </Text>
      </YStack>
    );
  }

  return (
    <View flex={1}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScrollBeginDrag={() => {
          userScrollUntil.current = Date.now() + RESUME_AUTO_SCROLL_MS;
        }}
        contentContainerStyle={{
          paddingVertical: viewportHeight ? viewportHeight * 0.42 : 200,
          paddingHorizontal: 28,
        }}>
        {lines.map((line, index) => {
          const nextTimeMs = index < lines.length - 1 ? lines[index + 1].timeMs : line.timeMs + 5000;
          const lineDurationMs = nextTimeMs - line.timeMs;
          return (
            <LyricRow
              key={`${line.timeMs}-${index}`}
              line={line}
              active={index === activeIndex}
              lineDurationMs={lineDurationMs}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              onLayoutLine={(offset) => handleLayoutLine(index, offset)}
              onSeekLine={onSeekLine}
            />
          );
        })}
      </ScrollView>

      {/* 上下渐隐遮罩（不参与文字着色，避免反光泛白）；底色跟随页面背景，消除色块感 */}
      <LinearGradient
        colors={[fadeTopColor ?? palette.background, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.fadeTop, { height: viewportHeight * 0.18 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', fadeBottomColor ?? palette.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.fadeBottom, { height: viewportHeight * 0.18 }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
