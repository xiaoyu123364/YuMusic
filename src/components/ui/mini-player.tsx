import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { GlassPanel } from '@/components/ui/glass';
import { useDesignSpec } from '@/features/theme/design-style';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { MaterialLoading } from '@/components/ui/loading';

export const MINI_PLAYER_HEIGHT = 58;

// 进度滑轨横向内缩：左 = 10(边距)+42(封面)+10(间距)，右 = 10+34(下一首)+10+36(播放)+10。
// 保证轨道线与玻璃滑钮永远不会压到圆形封面（椭圆头穿模修复）。
const RAIL_INSET_LEFT = 62;
const RAIL_INSET_RIGHT = 100;

let lastOpenPlayerAt = 0;

const SEEK_SPRING = { damping: 24, stiffness: 300 };

/**
 * 迷你条顶缘的可拖动进度滑块（Apple Music 风）：
 * 命中区域高（28px），视觉为细轨道 + 液态玻璃小滑钮；
 * 按住时滑钮放大、可横向拖拽预览，松手 seek 提交。
 */
function DraggableProgressRail() {
  const palette = usePalette();
  const isDark = useIsDark();
  const design = useDesignSpec();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  const width = useSharedValue(0);
  const dragging = useSharedValue(false);
  const knobX = useSharedValue(0);
  const pressed = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value && width.value > 0) {
      knobX.value = withTiming(ratio * width.value, { duration: 220, easing: Easing.out(Easing.quad) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  function commitSeek(x: number) {
    if (width.value <= 0 || durationMs <= 0) return;
    const r = Math.min(Math.max(x / width.value, 0), 1);
    playerActions.seekToMs(Math.round(r * durationMs));
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      pressed.value = true;
    })
    .onTouchesUp(() => {
      pressed.value = false;
    })
    .onBegin((event) => {
      dragging.value = true;
      knobX.value = Math.min(Math.max(event.x, 0), width.value);
    })
    .onUpdate((event) => {
      knobX.value = Math.min(Math.max(event.x, 0), width.value);
    })
    .onFinalize((event) => {
      dragging.value = false;
      runOnJS(commitSeek)(event.x);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knobX.value },
      { scale: withSpring(pressed.value ? 1.4 : 1, SEEK_SPRING) },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(knobX.value, 0),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        position="absolute"
        left={RAIL_INSET_LEFT}
        right={RAIL_INSET_RIGHT}
        top={-7}
        height={28}
        zIndex={10}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
        }}>
        {/* 视觉层：细轨道，中心与迷你条顶缘平齐 */}
        <View
          position="absolute"
          left={0}
          right={0}
          top={12}
          height={4}
          borderRadius={999}
          backgroundColor={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)'}
          overflow="visible">
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                borderRadius: 999,
                backgroundColor: palette.accent,
              },
              fillStyle,
            ]}
          />
        </View>
        {/* 液态玻璃小滑钮 */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: -8,
              top: 6,
              width: 16,
              height: 16,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.65)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.25,
              shadowRadius: 3,
              elevation: 3,
            },
            knobStyle,
          ]}>
          <GlassPanel kind={design.barGlass} variant="control" radius={8} blurIntensity={60} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export function MiniPlayer() {
  const palette = usePalette();
  const isDark = useIsDark();
  const design = useDesignSpec();
  const router = useRouter();
  const { track, playing, loading, buffering } = usePlayer();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 16000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  if (!track) {
    return null;
  }

  const busy = loading || buffering;
  function openPlayer() {
    const now = Date.now();
    if (now - lastOpenPlayerAt < 800) {
      return;
    }

    lastOpenPlayerAt = now;
    router.push('/player');
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)}>
      <XStack
        height={MINI_PLAYER_HEIGHT}
        alignItems="center"
        gap={10}
        paddingHorizontal={10}
        borderRadius={28}
        borderWidth={design.barGlass === 'plain' ? 1 : StyleSheet.hairlineWidth}
        overflow="hidden"
        borderColor={design.barGlass === 'plain' ? palette.border : palette.barBorder}
        backgroundColor={design.barGlass === 'plain' ? palette.barSurface : 'transparent'}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: isDark ? 3 : 8 }}
        shadowOpacity={isDark ? 0.24 : 0.12}
        shadowRadius={isDark ? 10 : 16}
        elevation={isDark ? 0 : 8}
        transition="quickest"
        pressStyle={{ scale: 0.985 }}
        onPress={openPlayer}>
        <GlassPanel kind={design.barGlass} radius={28} blurIntensity={72} />

        <Animated.View style={[{ width: 42, height: 42 }, spinStyle]}>
          <Artwork uri={track.coverUrl} size={42} circle />
        </Animated.View>

        <YStack flex={1} gap={1}>
          <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
            {track.title}
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
            {track.artist || '未知歌手'}
          </Text>
        </YStack>

        <XStack
          width={36}
          height={36}
          borderRadius={18}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.accentSoft}
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.7 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.toggle();
          }}>
          {busy ? (
            <MaterialLoading size={16} color={palette.accent} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={18}
              color={palette.accent}
              style={playing ? undefined : { marginLeft: 2 }}
            />
          )}
        </XStack>

        <XStack
          width={34}
          height={36}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.next();
          }}>
          <Ionicons name="play-skip-forward" size={19} color={palette.textSecondary} />
        </XStack>
      </XStack>

      {/* 进度滑轨独立于玻璃条本体（否则会被 overflow:hidden 裁掉顶缘滑钮） */}
      <DraggableProgressRail />
    </Animated.View>
  );
}
