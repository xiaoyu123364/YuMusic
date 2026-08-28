import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { GlassPanel } from '@/components/ui/glass';
import { LiquidGlassBackdrop } from '@/components/ui/liquid-glass';
import { openDownloadUrl, type ReleaseInfo } from '@/features/update/check-update';
import { useDesignSpec } from '@/features/theme/design-style';
import { usePalette } from '@/hooks/use-palette';

type UpdateModalProps = {
  visible: boolean;
  release: ReleaseInfo | null;
  onClose: () => void;
};

export function UpdateModal({ visible, release, onClose }: UpdateModalProps) {
  const palette = usePalette();
  const design = useDesignSpec();

  if (!release) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <LiquidGlassBackdrop>
            <YStack
              borderRadius={28}
              overflow="hidden"
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              backgroundColor={palette.card}
              padding={24}
              gap={16}
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.25,
                shadowRadius: 28,
                elevation: 16,
              }}>
              <GlassPanel kind={design.liquidReady ? 'liquid' : 'frost'} radius={28} variant="bar" />

              <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={10}>
                  <XStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={palette.accentSoft}>
                    <Ionicons name="sparkles" size={20} color={palette.accent} />
                  </XStack>
                  <YStack gap={2}>
                    <Text color={palette.text} fontSize={18} fontWeight="800">
                      发现新版本 v{release.versionName}
                    </Text>
                    <Text color={palette.textTertiary} fontSize={12}>
                      {release.name}
                    </Text>
                  </YStack>
                </XStack>
                <XStack
                  width={32}
                  height={32}
                  borderRadius={16}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.cardAlt}
                  pressStyle={{ opacity: 0.6 }}
                  onPress={onClose}>
                  <Ionicons name="close" size={16} color={palette.textSecondary} />
                </XStack>
              </XStack>

              <YStack
                maxHeight={220}
                backgroundColor={palette.cardAlt}
                borderRadius={18}
                padding={14}
                overflow="hidden">
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text color={palette.text} fontSize={13.5} lineHeight={20}>
                    {release.body}
                  </Text>
                </ScrollView>
              </YStack>

              <XStack gap={10} marginTop={4}>
                <XStack
                  flex={1}
                  height={44}
                  borderRadius={22}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.cardAlt}
                  pressStyle={{ opacity: 0.7 }}
                  onPress={onClose}>
                  <Text color={palette.textSecondary} fontSize={14} fontWeight="600">
                    稍后再说
                  </Text>
                </XStack>
                <XStack
                  flex={1.4}
                  height={44}
                  borderRadius={22}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accent}
                  pressStyle={{ opacity: 0.85, scale: 0.98 }}
                  onPress={() => {
                    openDownloadUrl(release.downloadUrl);
                    onClose();
                  }}>
                  <Text color={palette.onAccent} fontSize={14} fontWeight="700">
                    立即更新
                  </Text>
                </XStack>
              </XStack>
            </YStack>
          </LiquidGlassBackdrop>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
});
