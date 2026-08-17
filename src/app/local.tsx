import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { SongListItem } from '@/components/ui/song-list-item';
import { showToast } from '@/components/ui/toast';
import { MaxContentWidth } from '@/constants/theme';
import { hydrateLocalMusic, removeLocalTrack, useLocalTracks } from '@/features/local/local-store';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

export default function LocalScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const local = useLocalTracks();
  const { track } = usePlayer();
  const activeHash = track?.hash;

  useEffect(() => {
    hydrateLocalMusic();
  }, []);

  const tracks: PlayerTrack[] = local.map((item) => ({
    hash: item.hash,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl ?? null,
    durationMs: item.durationMs,
    source: 'local',
    localUri: item.publicUri,
  }));

  function playFrom(index: number) {
    void playerActions.playTracks(tracks, index);
  }

  function confirmRemove(item: PlayerTrack) {
    Alert.alert('移除本地音乐', `确定将《${item.title}》从本地音乐列表移除吗？\n已下载的文件不会被删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: () => {
          removeLocalTrack(item.hash);
          showToast('已从本地音乐移除');
        },
      },
    ]);
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <FlatList
        data={tracks}
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
                本地音乐
              </Text>
            </XStack>
            <Text color={palette.textTertiary} fontSize={12}>
              已下载的歌曲保存在系统「下载/yumusic」目录，共 {local.length} 首
            </Text>
          </YStack>
        }
        ListEmptyComponent={
          <YStack alignItems="center" paddingVertical={60} gap={8}>
            <Ionicons name="download-outline" size={34} color={palette.textTertiary} />
            <Text color={palette.textTertiary} fontSize={13}>
              还没有本地音乐，去歌单里「下载」歌曲吧
            </Text>
          </YStack>
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            rank={index + 1}
            active={item.hash === activeHash}
            onPress={() => playFrom(index)}
            onMore={() => confirmRemove(item)}
          />
        )}
      />
    </View>
  );
}
