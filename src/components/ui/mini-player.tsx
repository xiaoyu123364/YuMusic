import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet } from 'react-native';
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
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { GlassPanel } from '@/components/ui/glass';
import { MaterialLoading } from '@/components/ui/loading';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useDesignSpec } from '@/features/theme/design-style';
import { useIsDark, usePalette } from '@/hooks/use-palette';

export const MINI_PLAYER_HEIGHT = 58;

let lastOpenPlayerAt = 0;

function getWavyPath(
  cx: number,
  cy: number,
  r: number,
  progress: number,
  phase: number,
  amplitude: number,
  freq: number
) {
  'worklet';
  if (progress <= 0) return '';
  const points = 100;
  const totalAngle = progress * Math.PI * 2;
  const startAngle = -Math.PI / 2;

  let d = '';
  const numSteps = Math.max(5, Math.floor(points * progress));

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const angle = startAngle + t * totalAngle;
    const waveAngle = t * totalAngle * freq - phase;
    const wave = Math.sin(waveAngle) * amplitude;
    
    const currentR = r + wave;
    const x = cx + currentR * Math.cos(angle);
    const y = cy + currentR * Math.sin(angle);

    if (i === 0) {
      d += `M ${x} ${y}`;
    } else {
      d += ` L ${x} ${y}`;
    }
  }
  return d;
}

function WavyProgressRing({ playing, appState }: { playing: boolean; appState: AppStateStatus }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  const progressAnim = useSharedValue(0);
  const phase = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = withTiming(ratio, { duration: 1000, easing: Easing.linear });
  }, [ratio, progressAnim]);

  useEffect(() => {
    if (playing && appState === 'active') {
      phase.value = withRepeat(
        withTiming(phase.value + Math.PI * 2, { duration: 1500, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(phase);
    }
  }, [playing, appState, phase]);

  const path = useDerivedValue(() => {
    const d = getWavyPath(26, 26, 23, progressAnim.value, phase.value, 1.5, 12);
    return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
  });

  const circlePath = Skia.Path.Make();
  circlePath.addCircle(26, 26, 23);

  return (
    <View position="absolute" left={-6} top={-6} width={52} height={52} pointerEvents="none" zIndex={10}>
      <Canvas style={{ width: 52, height: 52 }}>
        <Path
          path={circlePath}
          style="stroke"
          strokeWidth={2}
          color={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}
        />
        <Path
          path={path}
          style="stroke"
          strokeWidth={2.5}
          color={palette.accent}
          strokeCap="round"
          strokeJoin="round"
        />
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
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => sub.remove();
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

        <View width={40} height={40}>
          <Animated.View style={[{ width: 40, height: 40 }, spinStyle]}>
            <Artwork uri={track.coverUrl} size={40} circle />
          </Animated.View>
          <WavyProgressRing playing={playing} appState={appState} />
        </View>

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
    </Animated.View>
  );
}
