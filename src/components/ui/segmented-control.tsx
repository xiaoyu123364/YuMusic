import { StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';

import {
  LiquidGlassSurface,
  useBackdropTargetId,
} from '@/components/ui/liquid-glass';
import { useLiquidGlass } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** 胶囊分段切换：与桌面端发现页的 switch 控件同构；开启液态玻璃时用毛玻璃背景。 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const palette = usePalette();
  const isDark = useIsDark();
  const liquidGlass = useLiquidGlass();
  const backdropTargetId = useBackdropTargetId();
  const glass = liquidGlass && backdropTargetId != null;

  return (
    <XStack
      padding={4}
      borderRadius={16}
      backgroundColor={glass ? 'transparent' : palette.cardAlt}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={glass ? palette.barBorder : palette.border}
      overflow="hidden">
      {glass ? <LiquidGlassSurface radius={16} backdropTargetId={backdropTargetId} /> : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <XStack
            key={option.value}
            flex={1}
            height={36}
            alignItems="center"
            justifyContent="center"
            borderRadius={12}
            backgroundColor={active ? (glass ? 'rgba(255,255,255,0.5)' : palette.card) : 'transparent'}
            shadowColor={active ? palette.dockShadow : 'transparent'}
            shadowOffset={{ width: 0, height: 3 }}
            shadowOpacity={active ? (isDark ? 0.4 : 0.1) : 0}
            shadowRadius={8}
            elevation={active ? 3 : 0}
            transition="quick"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => onChange(option.value)}>
            <Text
              color={active ? palette.text : palette.textTertiary}
              fontSize={13.5}
              fontWeight={active ? '700' : '500'}>
              {option.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}
