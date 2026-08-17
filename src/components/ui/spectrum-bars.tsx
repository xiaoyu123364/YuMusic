import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';

import { addSpectrumListener, moekoeNative } from '@/features/android/native';
import { getAudioSessionId } from '@/features/player/store';
import { usePalette } from '@/hooks/use-palette';
import { log } from '@/lib/logger';

const BAR_COUNT = 24;

/** 单根频谱条：接收 0~1 幅度，平滑过渡到目标高度。 */
function SpectrumBar({ level, color }: { level: number; color: string }) {
  const h = useSharedValue(0);
  const prev = useRef(0);

  useEffect(() => {
    if (Math.abs(level - prev.current) < 0.001) {
      return;
    }
    prev.current = level;
    h.value = withTiming(level, { duration: 90 });
  }, [level, h]);

  const style = useAnimatedStyle(() => ({
    height: Math.max(3, h.value * 64),
    opacity: 0.35 + h.value * 0.65,
  }));

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color }, style]}
    />
  );
}

/**
 * 实时频谱条形：原生 Visualizer 绑定音频会话采集 FFT，
 * 通过 onSpectrumData 事件回传 24 个频段幅度，Reanimated 平滑绘制。
 */
export function SpectrumBars() {
  const palette = usePalette();
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [denied, setDenied] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let cancelled = false;

    async function start() {
      let granted = moekoeNative.requestSpectrumPermission();
      if (!granted) {
        // 首次调用会弹出系统权限框，稍等后重试一次。
        await new Promise((resolve) => setTimeout(resolve, 900));
        granted = moekoeNative.requestSpectrumPermission();
      }
      if (!granted) {
        log('spectrum', 'RECORD_AUDIO 权限未授予');
        setDenied(true);
        return;
      }
      const ok = moekoeNative.startSpectrum(getAudioSessionId());
      log('spectrum', `startSpectrum -> ${ok}`);
      setRunning(ok);
      if (!ok) {
        setDenied(true);
      }
    }

    void start();

    const unsub = addSpectrumListener((amplitudes) => {
      if (cancelled) {
        return;
      }
      setLevels(amplitudes.slice(0, BAR_COUNT));
    });

    return () => {
      cancelled = true;
      unsub();
      moekoeNative.stopSpectrum();
    };
  }, []);

  if (Platform.OS !== 'android') {
    return null;
  }

  if (denied) {
    return (
      <YStack height={64} alignItems="center" justifyContent="center" gap={4}>
        <Text color={palette.textTertiary} fontSize={12}>
          {running ? '频谱采集中…' : '需授权「录音」权限以显示实时频谱'}
        </Text>
      </YStack>
    );
  }

  return (
    <XStack height={64} alignItems="flex-end" gap={3} paddingHorizontal={6}>
      {levels.map((level, index) => (
        <SpectrumBar key={index} level={level} color={palette.accent} />
      ))}
    </XStack>
  );
}

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    borderRadius: 2,
  },
});
