import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { SongListItem } from '@/components/ui/song-list-item';
import { MaxContentWidth } from '@/constants/theme';
import { playerActions, usePlayer } from '@/features/player/store';
import {
  clearRecentPlays,
  hydrateRecentPlays,
  useRecentPlays,
} from '@/features/recent/recent-store';
import { usePalette } from '@/hooks/use-palette';

export default function RecentScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const recent = useRecentPlays();
  const { track } = usePlayer();
  const activeHash = track?.hash;

  useEffect(() => {
    hydrateRecentPlays();
  }, []);

  function playFrom(index: number) {
    void playerActions.playTracks(recent, index);
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <FlatList
        data={recent}
        keyExtractor={(item) => item.hash}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: MaxContentWidth,
          paddingHorizontal: 12,
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
        }}
        ListHeaderComponent={
          <YStack gap={14} paddingHorizontal={4} paddingBottom={12}>
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
                最近播放
              </Text>
              <View flex={1} />
              {recent.length ? (
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
                  onPress={clearRecentPlays}>
                  <Ionicons name="trash-outline" size={15} color={palette.textSecondary} />
                  <Text color={palette.textSecondary} fontSize={13} fontWeight="600">
                    清空
                  </Text>
                </XStack>
              ) : null}
            </XStack>
          </YStack>
        }
        ListEmptyComponent={
          <YStack alignItems="center" paddingVertical={60} gap={8}>
            <Ionicons name="time-outline" size={34} color={palette.textTertiary} />
            <Text color={palette.textTertiary} fontSize={13}>
              还没有播放记录
            </Text>
          </YStack>
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            rank={index + 1}
            active={item.hash === activeHash}
            onPress={() => playFrom(index)}
          />
        )}
      />
    </View>
  );
}
