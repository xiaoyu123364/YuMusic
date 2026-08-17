import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { showToast } from '@/components/ui/toast';
import { MaxContentWidth } from '@/constants/theme';
import { libraryActions, useLibrary } from '@/features/library/store';
import { fetchPlaylistTracks, type PlaylistInfo } from '@/features/playlist/playlist-api';
import { playCollection } from '@/features/player/play-collection';
import { useHasTrack, usePlayer } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import type { PlayerTrack } from '@/features/player/types';
import { downloadTracksToLibrary } from '@/lib/download';
import { shareTracksAsCodes } from '@/lib/share';
import { MaterialLoading } from '@/components/ui/loading';

type ScreenState = {
  info: PlaylistInfo | null;
  tracks: PlayerTrack[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

export default function PlaylistScreen() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();
  const params = useLocalSearchParams<{ id: string; name?: string; cover?: string }>();
  const playlistId = typeof params.id === 'string' ? params.id : '';
  const requestIdRef = useRef(0);

  const [state, setState] = useState<ScreenState>({
    info: null,
    tracks: [],
    page: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  const library = useLibrary();
  // 自己的歌单(含"我喜欢")才允许移除歌曲;listid 是写操作专用 ID
  const ownPlaylist = library.playlists.find((item) => item.gid === playlistId && item.isMine);

  useEffect(() => {
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  function handleTrackRemoved(removed: PlayerTrack) {
    setState((current) => ({
      ...current,
      tracks: current.tracks.filter((item) =>
        removed.fileid ? item.fileid !== removed.fileid : item.hash !== removed.hash
      ),
      info: current.info
        ? { ...current.info, count: Math.max(0, current.info.count - 1) }
        : current.info,
    }));
  }

  useEffect(() => {
    void loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  async function loadPage(page: number) {
    if (!playlistId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((current) => ({
      ...current,
      loading: page === 1,
      loadingMore: page > 1,
      error: '',
    }));

    try {
      const result = await fetchPlaylistTracks(playlistId, page);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => {
          const seen = new Set(current.tracks.map((item) => item.hash));
          const merged =
            page === 1
              ? result.tracks
              : [...current.tracks, ...result.tracks.filter((item) => !seen.has(item.hash))];

          return {
            info: result.info ?? current.info,
            tracks: merged,
            page,
            hasMore: result.hasMore,
            loading: false,
            loadingMore: false,
            error: '',
          };
        });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          hasMore: page === 1 ? current.hasMore : false,
          error: error instanceof Error ? error.message : '歌单加载失败',
        }));
      });
    }
  }

  /** 从第 index 首开始播放整个歌单：先播已加载的，后台补齐剩余分页到队列。 */
  function playFrom(index: number) {
    void playCollection({
      tracks: state.tracks,
      startIndex: index,
      loadedPage: state.page,
      hasMore: state.hasMore,
      loadPage: (page) => fetchPlaylistTracks(playlistId, page),
    });
  }

  function toggleSelect(track: PlayerTrack) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(track.hash)) {
        next.delete(track.hash);
      } else {
        next.add(track.hash);
      }
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }

  async function handleBatchShare() {
    const selected = state.tracks.filter((item) => selectedKeys.has(item.hash));
    if (!selected.length) {
      showToast('请先勾选要分享的歌曲');
      return;
    }
    if (sharing) {
      return;
    }
    setSharing(true);
    const ok = await shareTracksAsCodes(selected);
    setSharing(false);
    if (!ok) {
      showToast('分享失败，请稍后重试');
    }
  }

  async function handleBatchDownload() {
    const selected = state.tracks.filter((item) => selectedKeys.has(item.hash));
    if (!selected.length) {
      showToast('请先勾选要下载的歌曲');
      return;
    }
    if (sharing) {
      return;
    }
    setSharing(true);
    showToast(`正在下载 ${selected.length} 首…`);
    const ok = await downloadTracksToLibrary(selected);
    setSharing(false);
    if (ok > 0) {
      showToast(`已下载 ${ok} 首到本地音乐`);
    } else {
      showToast('下载失败，请稍后重试');
    }
  }

  const fallbackName = typeof params.name === 'string' ? params.name : '';
  const fallbackCover = typeof params.cover === 'string' && params.cover ? params.cover : null;
  const title = state.info?.name || fallbackName || '歌单';
  const coverUrl = state.info?.coverUrl ?? fallbackCover;
  const activeHash = track?.hash;
  // 多选时隐藏迷你播放器，底部让位给批量操作栏，避免物理重叠。
  const listBottomInset =
    insets.bottom + (selectMode ? 92 : hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;

  return (
    <View flex={1} backgroundColor={palette.background}>
      <LinearGradient
        colors={[isDark ? 'rgba(255, 126, 182, 0.16)' : 'rgba(255, 92, 158, 0.14)', 'transparent']}
        style={styles.headerGlow}
      />

      <FlatList
        data={state.tracks}
        keyExtractor={(item, index) => `${item.hash}-${index}`}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (state.hasMore && !state.loading && !state.loadingMore) {
            void loadPage(state.page + 1);
          }
        }}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: MaxContentWidth,
          paddingHorizontal: 12,
          paddingTop: insets.top + 8,
          paddingBottom: listBottomInset,
        }}
        ListHeaderComponent={
          <YStack gap={18} paddingHorizontal={4} paddingBottom={16}>
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
              pressStyle={{ opacity: 0.6, scale: 0.94 }}
              onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </XStack>

            <XStack gap={16} alignItems="center">
              <Artwork uri={coverUrl} size={112} radius={20} />
              <YStack flex={1} gap={7}>
                <Text color={palette.text} fontSize={20} fontWeight="800" numberOfLines={2}>
                  {title}
                </Text>
                {state.info?.intro ? (
                  <Text color={palette.textTertiary} fontSize={12.5} lineHeight={18} numberOfLines={2}>
                    {state.info.intro.replace(/\s+/g, ' ')}
                  </Text>
                ) : null}
                <Text color={palette.textTertiary} fontSize={12}>
                  {state.info?.count ? `共 ${state.info.count} 首` : ''}
                </Text>
              </YStack>
            </XStack>

            {state.tracks.length ? (
              <XStack gap={10} alignItems="center">
                <XStack
                  alignSelf="flex-start"
                  alignItems="center"
                  gap={7}
                  height={44}
                  paddingHorizontal={22}
                  borderRadius={22}
                  backgroundColor={palette.accent}
                  transition="quickest"
                  pressStyle={{ opacity: 0.85, scale: 0.97 }}
                  onPress={() => playFrom(0)}>
                  <Ionicons name="play" size={16} color={palette.onAccent} />
                  <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                    播放全部
                  </Text>
                </XStack>
                <XStack
                  alignSelf="flex-start"
                  alignItems="center"
                  gap={6}
                  height={44}
                  paddingHorizontal={18}
                  borderRadius={22}
                  backgroundColor={palette.card}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={palette.border}
                  transition="quickest"
                  pressStyle={{ opacity: 0.7, scale: 0.97 }}
                  onPress={() => setSelectMode(true)}>
                  <Ionicons name="checkbox-outline" size={16} color={palette.textSecondary} />
                  <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                    多选
                  </Text>
                </XStack>
              </XStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          state.loading ? (
            <YStack alignItems="center" paddingVertical={70}>
              <MaterialLoading size={32} color={palette.accent} />
            </YStack>
          ) : state.error ? (
            <YStack alignItems="center" paddingVertical={60} gap={12} paddingHorizontal={28}>
              <Ionicons name="cloud-offline-outline" size={36} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13} textAlign="center">
                {state.error}
              </Text>
              <Text
                color={palette.accent}
                fontSize={14}
                fontWeight="600"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => void loadPage(1)}
                suppressHighlighting>
                重试
              </Text>
            </YStack>
          ) : (
            <YStack alignItems="center" paddingVertical={60} gap={8}>
              <Ionicons name="musical-note" size={34} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13}>
                这个歌单还没有歌曲
              </Text>
            </YStack>
          )
        }
        ListFooterComponent={
          state.loadingMore ? (
            <XStack justifyContent="center" paddingVertical={16}>
              <MaterialLoading size={20} color={palette.accent} />
            </XStack>
          ) : null
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            rank={index + 1}
            active={item.hash === activeHash}
            selected={selectMode ? selectedKeys.has(item.hash) : undefined}
            onPress={() => {
              if (selectMode) {
                toggleSelect(item);
              } else {
                playFrom(index);
              }
            }}
            onMore={selectMode ? undefined : () => setActionTrack(item)}
          />
        )}
      />

      {selectMode ? (
        <RNView
          style={[
            styles.selectBar,
            { bottom: insets.bottom + 12, paddingBottom: 0 },
          ]}>
          <XStack
            width="100%"
            maxWidth={MaxContentWidth}
            alignSelf="center"
            alignItems="center"
            justifyContent="space-between"
            paddingHorizontal={16}
            height={58}
            borderRadius={20}
            backgroundColor={palette.card}
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={palette.border}>
            <XStack
              alignItems="center"
              gap={8}
              paddingHorizontal={12}
              transition="quickest"
              pressStyle={{ opacity: 0.6 }}
              onPress={exitSelectMode}>
              <Ionicons name="close" size={18} color={palette.textSecondary} />
              <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                取消
              </Text>
            </XStack>
            <Text color={palette.text} fontSize={13.5} fontWeight="700">
              已选 {selectedKeys.size} 首
            </Text>
            <XStack gap={8} alignItems="center">
              <XStack
                alignItems="center"
                gap={6}
                paddingHorizontal={14}
                height={38}
                borderRadius={19}
                backgroundColor={palette.cardAlt}
                transition="quickest"
                pressStyle={{ opacity: 0.85, scale: 0.97 }}
                disabled={sharing || selectedKeys.size === 0}
                onPress={() => void handleBatchDownload()}>
                <Ionicons name="download-outline" size={15} color={palette.text} />
                <Text color={palette.text} fontSize={13.5} fontWeight="700">
                  下载
                </Text>
              </XStack>
              <XStack
                alignItems="center"
                gap={6}
                paddingHorizontal={16}
                height={38}
                borderRadius={19}
                backgroundColor={palette.accent}
                transition="quickest"
                pressStyle={{ opacity: 0.85, scale: 0.97 }}
                disabled={sharing || selectedKeys.size === 0}
                onPress={() => void handleBatchShare()}>
                <Ionicons name="share-social-outline" size={15} color={palette.onAccent} />
                <Text color={palette.onAccent} fontSize={13.5} fontWeight="700">
                  分享
                </Text>
              </XStack>
            </XStack>
          </XStack>
        </RNView>
      ) : null}

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
        removal={
          ownPlaylist
            ? { listid: ownPlaylist.listid, onRemoved: handleTrackRemoved }
            : undefined
        }
      />

      {selectMode ? null : (
        <RNView
          pointerEvents="box-none"
          style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
          <RNView pointerEvents="box-none" style={styles.miniDockInner}>
            <MiniPlayer />
          </RNView>
        </RNView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  miniDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  selectBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    alignItems: 'center',
    zIndex: 20,
    elevation: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  miniDockInner: {
    width: '100%',
    maxWidth: 680,
  },
});
