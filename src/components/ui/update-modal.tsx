import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { GlassPanel } from '@/components/ui/glass';
import { LiquidGlassBackdrop } from '@/components/ui/liquid-glass';
import { showToast } from '@/components/ui/toast';
import { downloadAndInstallApk, openDownloadUrl, type ReleaseInfo } from '@/features/update/check-update';
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
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!release) return null;

  async function handleUpdate() {
    if (downloading || !release) return;

    setDownloading(true);
    setProgress(0);
    showToast('开始在应用内下载安装包...');

    try {
      const ok = await downloadAndInstallApk(
        release.downloadUrl,
        release.versionName,
        (p) => setProgress(Math.round(p * 100))
      );

      if (ok) {
        showToast('下载完成，正在调起系统安装...');
        onClose();
      } else {
        showToast('安装调起失败，正在前往下载页面');
        openDownloadUrl(release.downloadUrl);
        onClose();
      }
    } catch {
      showToast('下载异常，正在打开下载页面');
      openDownloadUrl(release.downloadUrl);
      onClose();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={downloading ? () => {} : onClose}>
      <Pressable style={styles.overlay} onPress={downloading ? undefined : onClose}>
        <Pressable style={styles.cardWrapper} onPress={(e) => e.stopPropagation()}>
          <LiquidGlassBackdrop>
            <YStack
              width={340}
              maxWidth="92%"
              borderRadius={28}
              overflow="hidden"
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              backgroundColor={palette.card}
              padding={20}
              gap={16}
              style={styles.cardShadow}>
              <GlassPanel kind={design.liquidReady ? 'liquid' : 'frost'} radius={28} variant="bar" />

              {/* 头部：版本图标与标题 */}
              <XStack alignItems="center" justifyContent="space-between" gap={8}>
                <XStack alignItems="center" gap={12} flex={1} minWidth={0}>
                  <XStack
                    width={44}
                    height={44}
                    borderRadius={22}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={palette.accentSoft}>
                    <Ionicons name="sparkles" size={22} color={palette.accent} />
                  </XStack>
                  <YStack gap={2} flex={1} minWidth={0}>
                    <Text color={palette.text} fontSize={17} fontWeight="800" numberOfLines={1}>
                      发现新版本 v{release.versionName}
                    </Text>
                    <Text color={palette.accent} fontSize={12} fontWeight="600" numberOfLines={1}>
                      {release.name || '全新功能与体验升级'}
                    </Text>
                  </YStack>
                </XStack>
                {downloading ? null : (
                  <XStack
                    width={30}
                    height={30}
                    borderRadius={15}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={palette.cardAlt}
                    pressStyle={{ opacity: 0.6 }}
                    onPress={onClose}>
                    <Ionicons name="close" size={16} color={palette.textSecondary} />
                  </XStack>
                )}
              </XStack>

              {/* 更新日志区域 */}
              <YStack
                height={160}
                backgroundColor={palette.cardAlt}
                borderRadius={18}
                padding={14}
                overflow="hidden">
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text color={palette.text} fontSize={13} lineHeight={20}>
                    {release.body || '本次更新包含性能提升与体验优化。'}
                  </Text>
                </ScrollView>
              </YStack>

              {/* 下载进度条（下载中显示） */}
              {downloading ? (
                <YStack gap={6}>
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text color={palette.textSecondary} fontSize={12}>
                      正在下载安装包...
                    </Text>
                    <Text color={palette.accent} fontSize={12} fontWeight="700">
                      {progress}%
                    </Text>
                  </XStack>
                  <View height={6} borderRadius={3} backgroundColor={palette.cardAlt} overflow="hidden">
                    <View
                      height="100%"
                      width={`${Math.max(5, progress)}%`}
                      borderRadius={3}
                      backgroundColor={palette.accent}
                    />
                  </View>
                </YStack>
              ) : null}

              {/* 操作按钮区 */}
              <XStack gap={10} marginTop={4}>
                {downloading ? null : (
                  <XStack
                    flex={1}
                    height={42}
                    borderRadius={21}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={palette.cardAlt}
                    pressStyle={{ opacity: 0.7 }}
                    onPress={onClose}>
                    <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                      稍后再说
                    </Text>
                  </XStack>
                )}
                <XStack
                  flex={downloading ? 1 : 1.4}
                  height={42}
                  borderRadius={21}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={palette.accent}
                  opacity={downloading ? 0.75 : 1}
                  pressStyle={{ opacity: 0.85, scale: 0.98 }}
                  onPress={handleUpdate}>
                  <Text color={palette.onAccent} fontSize={13.5} fontWeight="700">
                    {downloading ? `正在下载 ${progress}%` : '应用内立即更新'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
});
