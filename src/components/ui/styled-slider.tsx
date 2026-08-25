import { useRef } from 'react';

import { Slider } from 'tamagui';

import { WavySlider } from '@/components/ui/wavy-slider';
import { useDesignSpec } from '@/features/theme/design-style';
import { usePalette } from '@/hooks/use-palette';

/**
 * 风格感知滑杆：
 * - 苹果风 / 自定义-平滑：Tamagui 胶囊滑杆（iOS Music 风）；
 * - 安卓17风 / 自定义-波浪：M3 Expressive 波浪「毛毛虫」滑杆。
 */
export function StyledSlider({
  value,
  max,
  flowing = false,
  onChange,
  onCommit,
}: {
  value: number;
  max: number;
  /** 播放中波形流动（仅波浪形态生效）。 */
  flowing?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  const palette = usePalette();
  const design = useDesignSpec();
  // 松手提交必须用最新值：onSlideEnd 闭包可能捕获到上一帧的 value，
  // 直接用会导致 seek/音量跳回旧位置（"位置错位"）。
  const latestValue = useRef(value);
  latestValue.current = value;

  if (design.wavySlider) {
    return (
      <WavySlider
        value={value}
        max={Math.max(max, 1)}
        color={palette.accent}
        trackColor={palette.cardAlt}
        flowing={flowing}
        onChange={onChange}
        onCommit={onCommit}
      />
    );
  }

  return (
    <Slider
      size="$2"
      value={[Math.min(value, Math.max(max, 1))]}
      max={Math.max(max, 1)}
      step={max > 100 ? Math.max(1, Math.round(max / 600)) : 1}
      disabled={!max}
      onValueChange={(values) => onChange(values[0] ?? 0)}
      onSlideEnd={() => onCommit?.(latestValue.current)}>
      <Slider.Track backgroundColor={palette.cardAlt} height={4} borderRadius={999}>
        <Slider.TrackActive backgroundColor={palette.accent} />
      </Slider.Track>
      <Slider.Thumb
        index={0}
        size={16}
        circular
        backgroundColor={palette.accent}
        borderWidth={2.5}
        borderColor="#FFFFFF"
        pressStyle={{
          scale: 1.2,
          backgroundColor: palette.accentPressed,
          borderColor: '#FFFFFF',
        }}
        hoverStyle={{ backgroundColor: palette.accent, borderColor: '#FFFFFF' }}
        shadowColor="#000000"
        shadowOpacity={0.2}
        shadowRadius={5}
        shadowOffset={{ width: 0, height: 2 }}
      />
    </Slider>
  );
}
