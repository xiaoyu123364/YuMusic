import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Text, View, YStack } from 'tamagui';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { usePlayerProgressSelector } from '@/features/player/store';
import type { LyricLine, LyricsStatus } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { MaterialLoading } from '@/components/ui/loading';

type LyricsViewProps = {
  lines: LyricLine[];
  status: LyricsStatus;
  onSeekLine?: (line: LyricLine) => void;
};

const RESUME_AUTO_SCROLL_MS = 3500;

type LyricRowProps = {
  line: LyricLine;
  active: boolean;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
};

// 每一行用 memo + 稳定的回调，仅当 active 状态切换时才重渲染，避免整列表抖动。
const LyricRow = memo(function LyricRow({
  line,
  active,
  activeColor,
  inactiveColor,
  onLayoutLine,
  onSeekLine,
}: LyricRowProps) {
  return (
    <Text
      onLayout={(event) => onLayoutLine(event.nativeEvent.layout.y)}
      onPress={onSeekLine ? () => onSeekLine(line) : undefined}
      suppressHighlighting
      textAlign="center"
      paddingVertical={11}
      color={active ? activeColor : inactiveColor}
      fontSize={16}
      lineHeight={25}
      fontWeight={active ? '700' : '500'}>
      {line.text}
    </Text>
  );
});

export function LyricsView({ lines, status, onSeekLine }: LyricsViewProps) {
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
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScrollBeginDrag={() => {
          userScrollUntil.current = Date.now() + RESUME_AUTO_SCROLL_MS;
        }}
        contentContainerStyle={{
          paddingVertical: viewportHeight ? viewportHeight * 0.42 : 200,
          paddingHorizontal: 28,
        }}>
        {lines.map((line, index) => (
          <LyricRow
            key={`${line.timeMs}-${index}`}
            line={line}
            active={index === activeIndex}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
            onLayoutLine={(offset) => handleLayoutLine(index, offset)}
            onSeekLine={onSeekLine}
          />
        ))}
      </ScrollView>

      {/* 上下渐隐遮罩（不参与文字着色，避免反光泛白） */}
      <LinearGradient
        colors={[palette.background, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.fadeTop, { height: viewportHeight * 0.18 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', palette.background]}
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
