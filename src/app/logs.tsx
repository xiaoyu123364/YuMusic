import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { MaxContentWidth } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { clearLogs, useLogs, type LogEntry } from '@/lib/logger';

const LEVEL_COLOR = {
  info: '#4A9EFF',
  warn: '#F0B429',
  error: '#E5484D',
} as const;

function formatLogsForExport(logs: LogEntry[]): string {
  return logs.map((entry) => `[${entry.time}] [${entry.level}] [${entry.tag}] ${entry.message}`).join('\n');
}

export default function LogsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logs = useLogs();

  function handleExport() {
    const text = formatLogsForExport(logs);
    void Share.share({ message: text || '(暂无日志)' }, { dialogTitle: '导出日志' });
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: MaxContentWidth,
          paddingHorizontal: 16,
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
        }}
        ListHeaderComponent={
          <YStack gap={14} paddingBottom={14}>
            <XStack alignItems="center" gap={12}>
              <XStack
                width={38}
                height={38}
                borderRadius={19}
                alignItems="center"
                justifyContent="center"
                backgroundColor={palette.card}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}
                transition="quickest"
                pressStyle={{ opacity: 0.7, scale: 0.96 }}
                onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={20} color={palette.text} />
              </XStack>
              <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
                运行日志
              </Text>
              <View flex={1} />
              <XStack
                height={36}
                paddingHorizontal={14}
                borderRadius={18}
                alignItems="center"
                gap={6}
                backgroundColor={palette.card}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}
                transition="quickest"
                pressStyle={{ opacity: 0.7 }}
                onPress={handleExport}>
                <Ionicons name="share-outline" size={15} color={palette.textSecondary} />
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  导出
                </Text>
              </XStack>
              <XStack
                height={36}
                paddingHorizontal={14}
                borderRadius={18}
                alignItems="center"
                gap={6}
                backgroundColor={palette.card}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}
                transition="quickest"
                pressStyle={{ opacity: 0.7 }}
                onPress={clearLogs}>
                <Ionicons name="trash-outline" size={15} color={palette.textSecondary} />
                <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                  清空
                </Text>
              </XStack>
            </XStack>
            <Text color={palette.textTertiary} fontSize={12}>
              共 {logs.length} 条 · 点击「导出」可复制全部日志用于排查问题
            </Text>
          </YStack>
        }
        ListEmptyComponent={
          <YStack alignItems="center" paddingVertical={60} gap={8}>
            <Ionicons name="document-text-outline" size={34} color={palette.textTertiary} />
            <Text color={palette.textTertiary} fontSize={13}>
              暂无日志
            </Text>
          </YStack>
        }
        renderItem={({ item }) => (
          <YStack
            paddingVertical={7}
            paddingHorizontal={10}
            borderRadius={10}
            borderBottomWidth={StyleSheet.hairlineWidth}
            borderBottomColor={palette.border}>
            <XStack gap={8} alignItems="center">
              <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
                {item.time}
              </Text>
              <Text
                color={LEVEL_COLOR[item.level]}
                fontSize={11}
                fontWeight="700"
                textTransform="uppercase">
                {item.level}
              </Text>
              <Text color={palette.textSecondary} fontSize={11.5} fontWeight="700">
                {item.tag}
              </Text>
            </XStack>
            <Text color={palette.text} fontSize={12.5} lineHeight={18} selectable>
              {item.message}
            </Text>
          </YStack>
        )}
      />
    </View>
  );
}
