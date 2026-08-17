import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';

import { addSpectrumListener, moekoeNative } from '@/features/android/native';
import { getAudioSessionId } from '@/features/player/store';
import { usePalette } from '@/hooks/use-palette';
import { log } from '@/lib/logger';

const BAR_COUNT = 24;

/** 单根频谱条：接收 0~1 幅度，用 spring 让条形「Q 弹」地跟随音频起伏。 */
function SpectrumBar({ level, color }: { level: number; color: string }) {
  const h = useSharedValue(0);
  const prev = useRef(0);

  useEffect(() => {
    if (Math.abs(level - prev.current) < 0.001) {
      return;
    }
    prev.current = level;
    // 灵动：spring 带轻微过冲回弹；下降时阻尼更大、更「粘」，上升干脆利落。
    const rising = level > h.value;
    h.value = withSpring(level, {
      damping: rising ? 16 : 20,
      stiffness: rising ? 240 : 160,
      mass: 0.55,
    });
  }, [level, h]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.06 + h.value * 0.94 }],
    opacity: 0.38 + h.value * 0.62,
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
    height: 64,
    borderRadius: 2,
    transformOrigin: 'bottom',
  },
});
