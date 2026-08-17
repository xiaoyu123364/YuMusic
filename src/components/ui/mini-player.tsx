import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { LiquidGlassSurface } from '@/components/ui/liquid-glass';
import { useBarBlur, useLiquidGlass } from '@/features/settings/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { MaterialLoading } from '@/components/ui/loading';

export const MINI_PLAYER_HEIGHT = 58;

let lastOpenPlayerAt = 0;

function ProgressHairline() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View
      position="absolute"
      left={16}
      right={16}
      bottom={0}
      height={2}
      borderRadius={999}
      backgroundColor={palette.cardAlt}
      overflow="hidden">
      <View
        width={`${ratio * 100}%`}
        height="100%"
        borderRadius={999}
        backgroundColor={palette.accent}
      />
    </View>
  );
}

export function MiniPlayer({ backdropTargetId }: { backdropTargetId?: number | null }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const barBlur = useBarBlur();
  const liquidGlass = useLiquidGlass();
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

  // 液态玻璃拖拽：水平拖拽带阻尼位移 + 轻微倾斜，松手弹性回弹。
  const dragX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onUpdate((event) => {
      dragX.value = event.translationX * 0.6;
    })
    .onEnd(() => {
      dragX.value = withSpring(0, { damping: 15, stiffness: 200 });
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { rotate: `${dragX.value / 50}deg` },
      { scale: 1 - Math.min(Math.abs(dragX.value) / 500, 0.04) },
    ],
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
      <GestureDetector gesture={panGesture}>
        <Animated.View style={dragStyle}>
      <XStack
        height={MINI_PLAYER_HEIGHT}
        alignItems="center"
        gap={10}
        paddingHorizontal={10}
        borderRadius={28}
        borderWidth={1}
        overflow="hidden"
        borderColor={liquidGlass ? palette.barBorder : palette.border}
        backgroundColor={palette.barSurface}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: isDark ? 3 : 8 }}
        shadowOpacity={isDark ? 0.24 : 0.12}
        shadowRadius={isDark ? 10 : 16}
        elevation={isDark ? 0 : 8}
        transition="quickest"
        pressStyle={{ scale: 0.985 }}
        onPress={openPlayer}>
        {liquidGlass ? (
          <LiquidGlassSurface radius={28} backdropTargetId={backdropTargetId} />
        ) : (
          <BlurView
            intensity={barBlur ? 75 : 0}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}

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

        <ProgressHairline />
      </XStack>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
