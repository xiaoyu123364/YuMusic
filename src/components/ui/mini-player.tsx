import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { GlassPanel } from '@/components/ui/glass';
import { MaterialLoading } from '@/components/ui/loading';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useDesignSpec } from '@/features/theme/design-style';
import { useIsDark, usePalette } from '@/hooks/use-palette';

import { triggerHaptic } from '@/lib/haptics';

export const MINI_PLAYER_HEIGHT = 58;

let lastOpenPlayerAt = 0;

function WavyProgressRing({ playing, appState }: { playing: boolean; appState: AppStateStatus }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  const progressAnim = useSharedValue(0);
  const phaseAnim = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = withTiming(ratio, { duration: 600, easing: Easing.out(Easing.quad) });
  }, [ratio, progressAnim]);

  useEffect(() => {
    if (playing && appState === 'active') {
      phaseAnim.value = withRepeat(
        withTiming(phaseAnim.value - Math.PI * 2, { duration: 2400, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(phaseAnim);
    }
  }, [playing, appState, phaseAnim]);

  const path = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    const center = 24;
    const baseRadius = 21; // 48x48 容器中的半徑 21，線寬 2.5
    const segments = 120;
    const waves = 8;
    const amplitude = 1.8;
    
    // 只绘制到当前进度
    const currentSegments = Math.floor(segments * progressAnim.value);
    
    for (let i = 0; i <= currentSegments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 - Math.PI / 2;
      
      // 随播放进度波动的正弦波
      const wave = Math.sin(t * Math.PI * 2 * waves + phaseAnim.value) * amplitude;
      
      const r = baseRadius + wave;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      
      if (i === 0) {
        skPath.moveTo(x, y);
      } else {
        skPath.lineTo(x, y);
      }
    }
    return skPath;
  });
  
  const trackPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    const center = 24;
    const baseRadius = 21;
    skPath.addCircle(center, center, baseRadius);
    return skPath;
  });

  // 背景轨道：极淡的半透明圆环
  const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
  // 进度波浪颜色：主题主色或高透白光，绝无粉红刺眼外圈
  const progressColor = isDark ? 'rgba(255,255,255,0.9)' : palette.accent;

  return (
    <View
      position="absolute"
      left={-4}
      top={-4}
      width={48}
      height={48}
      pointerEvents="none"
      zIndex={10}>
      <Canvas style={{ width: 48, height: 48 }}>
        <Path path={trackPath} style="stroke" strokeWidth={2.5} color={trackColor} />
        {progressAnim.value > 0 && (
          <Path path={path} style="stroke" strokeWidth={2.5} color={progressColor} strokeCap="round" strokeJoin="round" />
        )}
      </Canvas>
    </View>
  );
}

export function MiniPlayer() {
  const palette = usePalette();
  const isDark = useIsDark();
  const design = useDesignSpec();
  const router = useRouter();
  const { track, playing, loading, buffering } = usePlayer();
  const rotation = useSharedValue(0);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppState(nextAppState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (playing && appState === 'active') {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 24000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, appState, rotation]);

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

        <View width={40} height={40} alignItems="center" justifyContent="center">
          <WavyProgressRing playing={playing} appState={appState} />
          <Animated.View style={[{ width: 40, height: 40 }, spinStyle]}>
            <Artwork uri={track.coverUrl} size={40} circle />
          </Animated.View>
        </View>

        <YStack flex={1} minWidth={0} flexShrink={1} marginRight={6} gap={1} overflow="hidden">
          <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
            {track.title}
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
            {track.artist || '未知歌手'}
          </Text>
        </YStack>

        <XStack
          width={34}
          height={36}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            triggerHaptic();
            playerActions.previous();
          }}>
          <Ionicons name="play-skip-back" size={19} color={palette.textSecondary} />
        </XStack>

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
            triggerHaptic();
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
            triggerHaptic();
            playerActions.next();
          }}>

          <Ionicons name="play-skip-forward" size={19} color={palette.textSecondary} />
        </XStack>
      </XStack>
    </Animated.View>
  );
}
