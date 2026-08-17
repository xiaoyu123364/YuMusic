import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import {
  EQUALIZER_PRESETS,
  setEqualizerPreset,
  useEqualizerPreset,
  type EqualizerPresetId,
} from '@/features/player/equalizer';
import { usePalette } from '@/hooks/use-palette';
import { SpectrumBars } from '@/components/ui/spectrum-bars';

const PRESET_ICONS: Record<EqualizerPresetId, keyof typeof Ionicons.glyphMap> = {
  flat: 'remove-outline',
  mastering: 'flash-outline',
  clarity: 'sparkles-outline',
  hakimi: 'heart-outline',
};

/** 音效/均衡器选择面板：4 种声音风格，点击即切换并持久化。 */
export function EqualizerPanel() {
  const palette = usePalette();
  const current = useEqualizerPreset();

  return (
    <YStack gap={10}>
      {/* 实时频谱条形 */}
      <YStack
        padding={12}
        borderRadius={18}
        backgroundColor={palette.card}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}>
        <SpectrumBars />
      </YStack>

      {EQUALIZER_PRESETS.map((preset) => {
        const active = preset.id === current;
        return (
          <XStack
            key={preset.id}
            alignItems="center"
            gap={12}
            padding={13}
            borderRadius={18}
            backgroundColor={active ? palette.accentSoft : palette.card}
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={active ? palette.accentBorder : palette.border}
            transition="quickest"
            pressStyle={{ opacity: 0.72, scale: 0.99 }}
            onPress={() => setEqualizerPreset(preset.id)}>
            <XStack
              width={40}
              height={40}
              borderRadius={20}
              alignItems="center"
              justifyContent="center"
              backgroundColor={active ? palette.accent : palette.cardAlt}>
              <Ionicons
                name={PRESET_ICONS[preset.id]}
                size={19}
                color={active ? palette.onAccent : palette.textSecondary}
              />
            </XStack>
            <YStack flex={1} gap={3}>
              <Text color={active ? palette.accent : palette.text} fontSize={14.5} fontWeight="700">
                {preset.label}
              </Text>
              <Text color={palette.textTertiary} fontSize={12} numberOfLines={2}>
                {preset.description}
              </Text>
            </YStack>
            {active ? (
              <Ionicons name="checkmark-circle" size={20} color={palette.accent} />
            ) : null}
          </XStack>
        );
      })}
    </YStack>
  );
}
