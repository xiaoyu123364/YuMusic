import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Animated, {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const WAVELENGTH = 26;
const MID_Y = 16;
const STROKE_WIDTH = 4;
const STROKE_HALF = STROKE_WIDTH / 2;
const THUMB_RADIUS = 6.5;

/**
 * M3 Expressive 波浪「毛毛虫」滑杆（Material 3 Expressive Wavy Progress）：
 * - 轨道为正弦波，波形相位随播放持续流动；
 * - 拖动时波幅增大（M3E 规范：progress 移动时 wave 振幅增强）；
 * - 波尾圆点即拇指，可点按 / 拖拽。
 */
export function WavySlider({
  value,
  max,
  color,
  trackColor,
  flowing = false,
  height = 32,
  onChange,
  onCommit,
}: {
  value: number;
  max: number;
  color: string;
  trackColor: string;
  /** true 时波形持续向左流动（如播放中的进度条）。 */
  flowing?: boolean;
  height?: number;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  const width = useSharedValue(0);
  const phase = useSharedValue(0);
  const dragAmp = useSharedValue(0);
  const pressed = useSharedValue(false);

  // 波形相位流动：每秒推进一个波长（与 M3E 默认 waveSpeed = wavelength 对齐）。
  useEffect(() => {
    if (flowing) {
      phase.value = withRepeat(
        withTiming(phase.value + Math.PI * 2, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(phase);
    }
    return () => cancelAnimation(phase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowing]);

  const clampedRatio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  const waveYAt = (x: number, w: number, ph: number, ampBoost: number): number => {
    'worklet';
    const amp = 1.6 + ampBoost * 4.2;
    return MID_Y + amp * Math.sin((x / WAVELENGTH) * Math.PI * 2 - ph);
  };

  const buildWave = (ratio: number, w: number, ph: number, ampBoost: number) => {
    'worklet';
    const path = Skia.Path.Make();
    if (w <= 0 || ratio <= 0) {
      path.moveTo(0, MID_Y);
      return path;
    }
    // 波尾与拇指圆心使用同一钳制公式（[r+1, w-r-1]）：
    // 满进度时波尾正好停在拇指处，不会再从拇指右侧戳出 5px 的「突出」。
    const minX = THUMB_RADIUS + 1;
    const maxX = Math.max(w - (THUMB_RADIUS + 1), minX);
    const end = Math.min(Math.max(ratio * w, minX), maxX);
    const amp = 1.6 + ampBoost * 4.2;
    // 密集采样（step=3）+ 二次贝塞尔过中点平滑：
    // 旧实现是 step=5 的折线（lineTo 直连），放大时折角明显、边缘粗糙。
    // 改为「以采样点为控制点、相邻采样点中点为端点」的 Q 曲线，波形数学连续、视觉平滑。
    const xs: number[] = [];
    const ys: number[] = [];
    const step = 3;
    for (let x = 0; x < end; x += step) {
      xs.push(x);
      ys.push(MID_Y + amp * Math.sin((x / WAVELENGTH) * Math.PI * 2 - ph));
    }
    xs.push(end);
    ys.push(MID_Y + amp * Math.sin((end / WAVELENGTH) * Math.PI * 2 - ph));

    path.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length - 1; i += 1) {
      const midX = (xs[i] + xs[i + 1]) / 2;
      const midY = (ys[i] + ys[i + 1]) / 2;
      path.quadTo(xs[i], ys[i], midX, midY);
    }
    path.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
    return path;
  };

  const wavePath = useDerivedValue(() =>
    buildWave(clampedRatio, width.value, phase.value, dragAmp.value)
  );

  // 静止基线在拇指周围「开缝」：拇指随波形上下起伏时，
  // 直线基线不再从椭圆滑块头中间穿过（穿模修复）。
  const baselinePath = useDerivedValue(() => {
    'worklet';
    const w = width.value;
    const path = Skia.Path.Make();
    if (w <= 0) {
      return path;
    }
    const minX = THUMB_RADIUS + 1;
    const maxX = Math.max(w - (THUMB_RADIUS + 1), minX);
    const cx = Math.min(Math.max(clampedRatio * w, minX), maxX);
    const r = pressed.value ? 8 : THUMB_RADIUS;
    const gap = r + 3;
    const right = Math.max(w - STROKE_HALF, 1);
    const leftEnd = Math.min(cx - gap, right);
    if (leftEnd > STROKE_HALF) {
      path.moveTo(STROKE_HALF, MID_Y);
      path.lineTo(leftEnd, MID_Y);
    }
    const rightStart = Math.max(cx + gap, STROKE_HALF);
    if (rightStart < right) {
      path.moveTo(rightStart, MID_Y);
      path.lineTo(right, MID_Y);
    }
    return path;
  });

  // thumb 圆心裁到 [r, w-r]，防止右端半圆穿出容器
  const thumbCx = useDerivedValue(() => {
    const minX = THUMB_RADIUS + 1;
    const maxX = Math.max(width.value - (THUMB_RADIUS + 1), minX);
    return Math.min(Math.max(clampedRatio * width.value, minX), maxX);
  });
  const thumbCy = useDerivedValue(() =>
    waveYAt(
      Math.min(Math.max(clampedRatio * width.value, THUMB_RADIUS + 1), Math.max(width.value - (THUMB_RADIUS + 1), THUMB_RADIUS + 1)),
      width.value,
      phase.value,
      dragAmp.value
    )
  );

  const thumbRadius = useDerivedValue(() => (pressed.value ? 8 : THUMB_RADIUS));

  function emitChange(x: number) {
    if (!width.value || max <= 0) {
      return;
    }
    const ratio = Math.min(Math.max(x / width.value, 0), 1);
    onChange?.(Math.round(ratio * max));
  }

  function emitCommit(x: number) {
    if (!width.value || max <= 0) {
      return;
    }
    const ratio = Math.min(Math.max(x / width.value, 0), 1);
    onCommit?.(Math.round(ratio * max));
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      pressed.value = true;
      dragAmp.value = withTiming(1, { duration: 160 });
    })
    .onTouchesUp(() => {
      pressed.value = false;
      dragAmp.value = withTiming(0, { duration: 320 });
    })
    .onBegin((event) => {
      runOnJS(emitChange)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(emitChange)(event.x);
    })
    .onFinalize((event) => {
      runOnJS(emitCommit)(event.x);
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={{ height }}>
        <Canvas
          style={StyleSheet.absoluteFill}
          onLayout={(event) => {
            width.value = event.nativeEvent.layout.width;
          }}>
          {/* 静止轨道基线（拇指周围开缝，内缩 STROKE_HALF 防止圆头超出容器右端） */}
          <Path
            path={baselinePath}
            color={trackColor}
            style="stroke"
            strokeWidth={STROKE_WIDTH}
            strokeCap="round"
          />
          {/* 波浪进度（毛毛虫本体） */}
          <Path
            path={wavePath}
            color={color}
            style="stroke"
            strokeWidth={STROKE_WIDTH}
            strokeCap="round"
          />
          <Circle cx={thumbCx} cy={thumbCy} r={thumbRadius} color={color} />
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
}
