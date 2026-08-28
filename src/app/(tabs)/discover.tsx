import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';
import { GlassPanel } from '@/components/ui/glass';
import { LiquidGlassBackdrop } from '@/components/ui/liquid-glass';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Artwork } from '@/components/ui/artwork';
import { PlaylistCard } from '@/components/ui/playlist-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth, type AppPalette } from '@/constants/theme';
import { GooglePolygonSpinner } from '@/components/ui/google-polygon-spinner';
import { fetchCategoryPlaylists,
  fetchNewAlbums,
  fetchNewSongs,
  fetchPlaylistCategories,
  fetchRankGroups,
  type AlbumRegion,
  type DiscoverAlbum,
  type DiscoverCategory,
  type DiscoverPlaylist,
  type RankGroup,
} from '@/features/discover/discover-api';
import { playCollection } from '@/features/player/play-collection';
import { usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { MaterialLoading } from '@/components/ui/loading';

const DISCOVER_TABS = [
  { value: 'playlist', label: '歌单' },
  { value: 'ranking', label: '榜单' },
  { value: 'album', label: '新碟' },
  { value: 'song', label: '新歌' },
] as const;

type DiscoverTab = (typeof DISCOVER_TABS)[number]['value'];

const ALBUM_REGIONS: { value: AlbumRegion | 'all'; label: string }[] = [
  { value: 'all', label: '推荐' },
  { value: 'chn', label: '华语' },
  { value: 'eur', label: '欧美' },
  { value: 'jpn', label: '日本' },
  { value: 'kor', label: '韩国' },
];

function SpringPressable({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 20, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 300 });
      }}
      onPress={onPress}
      style={style}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}

function useGridMetrics() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth) - 32;
  // 横屏/平板更宽时增加列数，保持卡片大小合理。
  const columns = contentWidth >= 720 ? 4 : contentWidth >= 500 ? 3 : 2;
  const gap = 12;
  const cardWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);
  return { cardWidth, columns };
}

function PaneStatus({
  palette,
  loading,
  error,
  emptyText,
  onRetry,
}: {
  palette: AppPalette;
  loading: boolean;
  error: string;
  emptyText: string;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <YStack alignItems="center" paddingVertical={70}>
        <MaterialLoading size={32} color={palette.accent} />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack alignItems="center" paddingVertical={60} gap={12} paddingHorizontal={28}>
        <Ionicons name="cloud-offline-outline" size={36} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={13} textAlign="center">
          {error}
        </Text>
        <Text
          color={palette.accent}
          fontSize={14}
          fontWeight="600"
          pressStyle={{ opacity: 0.6 }}
          onPress={onRetry}
          suppressHighlighting>
          重试
        </Text>
      </YStack>
    );
  }

  return (
    <YStack alignItems="center" paddingVertical={60} gap={8}>
      <Ionicons name="musical-note" size={34} color={palette.textTertiary} />
      <Text color={palette.textTertiary} fontSize={13}>
        {emptyText}
      </Text>
    </YStack>
  );
}

function CategoryChip({
  label,
  active,
  palette,
  onPress,
}: {
  label: string;
  active: boolean;
  palette: AppPalette;
  onPress: () => void;
}) {
  return (
    <SpringPressable onPress={onPress}>
      <XStack
        paddingHorizontal={13}
        height={32}
        alignItems="center"
        borderRadius={16}
        backgroundColor={active ? palette.accentSoft : 'transparent'}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={active ? palette.accent : palette.border}
        overflow="hidden"
      >
        <GlassPanel kind="liquid" variant="control" radius={16} />
        <Text
          color={active ? palette.accent : palette.textSecondary}
          fontSize={12.5}
          fontWeight={active ? '700' : '500'}>
          {label}
        </Text>
      </XStack>
    </SpringPressable>
  );
}

/* ---------------- 歌单 ---------------- */

function PlaylistPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const { cardWidth, columns } = useGridMetrics();
  const requestIdRef = useRef(0);

  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [mainTag, setMainTag] = useState(0);
  const [sonTag, setSonTag] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<DiscoverPlaylist[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const activeTag = sonTag ?? mainTag;
  const activeMain = categories.find((item) => item.tagId === mainTag);

  async function onRefresh() {
    setRefreshing(true);
    const requestId = ++requestIdRef.current;
    try {
      const result = await fetchCategoryPlaylists(activeTag, 1);
      if (requestId !== requestIdRef.current) {
        return;
      }
      startTransition(() => {
        setPlaylists(result.playlists);
        setPage(1);
        setHasMore(result.hasMore);
        setError('');
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      startTransition(() => setError(caught instanceof Error ? caught.message : '歌单加载失败'));
    } finally {
      if (requestId === requestIdRef.current) {
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    fetchPlaylistCategories()
      .then((items) => startTransition(() => setCategories(items)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadPage(activeTag, 1);
     
  }, [activeTag]);

  async function loadPage(tagId: number, nextPage: number) {
    const requestId = ++requestIdRef.current;
    if (nextPage === 1) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchCategoryPlaylists(tagId, nextPage);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setPlaylists((current) => {
          if (nextPage === 1) {
            return result.playlists;
          }

          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.playlists.filter((item) => !seen.has(item.id))];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
        setLoading(false);
        setLoadingMore(false);
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setLoading(false);
        setLoadingMore(false);
        if (nextPage === 1) {
          setPlaylists([]);
          setError(caught instanceof Error ? caught.message : '歌单加载失败');
        } else {
          setHasMore(false);
        }
      });
    }
  }

  return (
    <FlatList
      data={loading || error ? [] : playlists}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor="transparent"
          colors={['transparent']}
          progressBackgroundColor="transparent"
        >
          <XStack width="100%" alignItems="center" justifyContent="center" paddingVertical={10}>
            <GooglePolygonSpinner size={24} color={palette.accent} />
          </XStack>
        </RefreshControl>
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loading && !loadingMore) {
          void loadPage(activeTag, page + 1);
        }
      }}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        gap: 16,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        <YStack gap={10}>
          {categories.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {categories.map((item) => (
                <CategoryChip
                  key={item.tagId}
                  label={item.name}
                  active={item.tagId === mainTag}
                  palette={palette}
                  onPress={() => {
                    setMainTag(item.tagId);
                    // 父分类本身查不到歌单，切换后默认选中第一个子分类
                    setSonTag(item.sons.length ? item.sons[0].tagId : null);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
          {activeMain && activeMain.sons.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {activeMain.sons.map((son) => (
                <CategoryChip
                  key={son.tagId}
                  label={son.name}
                  active={son.tagId === sonTag}
                  palette={palette}
                  onPress={() => setSonTag(son.tagId)}
                />
              ))}
            </ScrollView>
          ) : null}
        </YStack>
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="这个分类暂时没有歌单"
          onRetry={() => void loadPage(activeTag, 1)}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <XStack justifyContent="center" paddingVertical={16}>
            <MaterialLoading size={20} color={palette.accent} />
          </XStack>
        ) : null
      }
      renderItem={({ item }) => (
        <SpringPressable
          onPress={() =>
            router.push({
              pathname: '/playlist/[id]',
              params: { id: item.id, name: item.title, cover: item.coverUrl ?? '' },
            })
          }>
          <View style={{ width: cardWidth, borderRadius: 18, overflow: 'hidden' }}>
            <GlassPanel kind="liquid" radius={18} />
            <PlaylistCard
              title={item.title}
              coverUrl={item.coverUrl}
              playCountText={item.playCountText}
              width={cardWidth}
              onPress={() => {}}
            />
          </View>
        </SpringPressable>
      )}
    />
  );
}

/* ---------------- 榜单 ---------------- */

function RankingPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const [ranks, setRanks] = useState<RankGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const items = await fetchRankGroups();
      startTransition(() => {
        setRanks(items);
        setLoading(false);
      });
    } catch (caught) {
      startTransition(() => {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : '榜单加载失败');
      });
    }
  }

  return (
    <FlatList
      data={loading || error ? [] : ranks}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        paddingHorizontal: 12,
        paddingBottom: bottomInset,
      }}
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="暂时没有可用的榜单"
          onRetry={() => void load()}
        />
      }
      renderItem={({ item }) => (
        <SpringPressable
          onPress={() =>
            router.push({
              pathname: '/rank/[id]',
              params: { id: item.id, name: item.name, cover: item.coverUrl ?? '' },
            })
          }>
          <XStack
            alignItems="center"
            gap={13}
            paddingVertical={9}
            paddingHorizontal={6}
            borderRadius={16}
            overflow="hidden"
          >
            <GlassPanel kind="liquid" radius={16} />
            <Artwork uri={item.coverUrl} size={58} radius={14} />
            <YStack flex={1} gap={3}>
              <Text color={palette.text} fontSize={15} fontWeight="700" numberOfLines={1}>
                {item.name}
              </Text>
              {item.intro ? (
                <Text color={palette.textTertiary} fontSize={12} numberOfLines={1}>
                  {item.intro}
                </Text>
              ) : null}
            </YStack>
            <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
          </XStack>
        </SpringPressable>
      )}
    />
  );
}

/* ---------------- 新碟 ---------------- */

function AlbumPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const router = useRouter();
  const { cardWidth, columns } = useGridMetrics();
  const [albums, setAlbums] = useState<DiscoverAlbum[]>([]);
  const [region, setRegion] = useState<AlbumRegion | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const items = await fetchNewAlbums();
      startTransition(() => {
        setAlbums(items);
        setLoading(false);
      });
    } catch (caught) {
      startTransition(() => {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : '新碟加载失败');
      });
    }
  }

  const visible = region === 'all' ? albums : albums.filter((item) => item.region === region);

  return (
    <FlatList
      data={loading || error ? [] : visible}
      keyExtractor={(item) => `${item.region}-${item.id}`}
      numColumns={columns}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        gap: 16,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {ALBUM_REGIONS.map((item) => (
            <CategoryChip
              key={item.value}
              label={item.label}
              active={item.value === region}
              palette={palette}
              onPress={() => setRegion(item.value)}
            />
          ))}
        </ScrollView>
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="这个地区暂时没有新专辑"
          onRetry={() => void load()}
        />
      }
      renderItem={({ item }) => (
        <SpringPressable
          onPress={() =>
            router.push({
              pathname: '/album/[id]',
              params: {
                id: item.id,
                name: item.name,
                cover: item.coverUrl ?? '',
                artist: item.artist,
                date: item.publishDate,
              },
            })
          }>
          <YStack
            width={cardWidth}
            gap={7}
            paddingBottom={6}
            borderRadius={18}
            overflow="hidden"
          >
            <GlassPanel kind="liquid" radius={18} />
            <Artwork uri={item.coverUrl} radius={16} size={cardWidth} />
            <YStack gap={2} paddingHorizontal={6} paddingTop={4}>
              <Text color={palette.text} fontSize={12.5} fontWeight="600" lineHeight={17} numberOfLines={2}>
                {item.name}
              </Text>
              <Text color={palette.textTertiary} fontSize={11} numberOfLines={1}>
                {item.artist}
              </Text>
            </YStack>
          </YStack>
        </SpringPressable>
      )}
    />
  );
}

/* ---------------- 新歌 ---------------- */

function NewSongPane({ bottomInset }: { bottomInset: number }) {
  const palette = usePalette();
  const { track } = usePlayer();
  const requestIdRef = useRef(0);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadPage(1);
     
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    const requestId = ++requestIdRef.current;
    try {
      const result = await fetchNewSongs(1);
      if (requestId !== requestIdRef.current) {
        return;
      }
      startTransition(() => {
        setTracks(result.tracks);
        setPage(1);
        setHasMore(result.hasMore);
        setError('');
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      startTransition(() => setError(caught instanceof Error ? caught.message : '新歌加载失败'));
    } finally {
      if (requestId === requestIdRef.current) {
        setRefreshing(false);
      }
    }
  }

  async function loadPage(nextPage: number) {
    const requestId = ++requestIdRef.current;
    if (nextPage === 1) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchNewSongs(nextPage);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setTracks((current) => {
          if (nextPage === 1) {
            return result.tracks;
          }

          const seen = new Set(current.map((item) => item.hash));
          return [...current, ...result.tracks.filter((item) => !seen.has(item.hash))];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
        setLoading(false);
        setLoadingMore(false);
      });
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setLoading(false);
        setLoadingMore(false);
        if (nextPage === 1) {
          setError(caught instanceof Error ? caught.message : '新歌加载失败');
        } else {
          setHasMore(false);
        }
      });
    }
  }

  const activeHash = track?.hash;

  /** 从第 index 首开始播放整个新歌列表：先播已加载的，后台补齐剩余分页。 */
  function playFrom(index: number) {
    void playCollection({
      tracks,
      startIndex: index,
      loadedPage: page,
      hasMore,
      loadPage: fetchNewSongs,
    });
  }

  return (
    <>
      <FlatList
      data={loading || error ? [] : tracks}
      keyExtractor={(item, index) => `${item.hash}-${index}`}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor="transparent"
          colors={['transparent']}
          progressBackgroundColor="transparent"
        >
          <XStack width="100%" alignItems="center" justifyContent="center" paddingVertical={10}>
            <GooglePolygonSpinner size={24} color={palette.accent} />
          </XStack>
        </RefreshControl>
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loading && !loadingMore) {
          void loadPage(page + 1);
        }
      }}
      contentContainerStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: MaxContentWidth,
        paddingHorizontal: 12,
        paddingBottom: bottomInset,
      }}
      ListHeaderComponent={
        tracks.length ? (
          <XStack
            alignItems="center"
            gap={5}
            paddingHorizontal={6}
            paddingBottom={8}
            alignSelf="flex-start"
            pressStyle={{ opacity: 0.6 }}
            onPress={() => playFrom(0)}>
            <Ionicons name="play-circle" size={17} color={palette.accent} />
            <Text color={palette.accent} fontSize={13.5} fontWeight="600">
              播放全部
            </Text>
          </XStack>
        ) : null
      }
      ListEmptyComponent={
        <PaneStatus
          palette={palette}
          loading={loading}
          error={error}
          emptyText="暂时没有新歌"
          onRetry={() => void loadPage(1)}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <XStack justifyContent="center" paddingVertical={16}>
            <MaterialLoading size={20} color={palette.accent} />
          </XStack>
        ) : null
      }
      renderItem={({ item, index }) => (
        <SongListItem
          track={item}
          active={item.hash === activeHash}
          onPress={() => playFrom(index)}
          onMore={() => setActionTrack(item)}
        />
      )}
      />

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
      />
    </>
  );
}

/* ---------------- 页面 ---------------- */

export default function DiscoverScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const [tab, setTab] = useState<DiscoverTab>('playlist');
  const [mounted, setMounted] = useState<DiscoverTab[]>(['playlist']);

  function switchTab(next: DiscoverTab) {
    setTab(next);
    setMounted((current) => (current.includes(next) ? current : [...current, next]));
  }

  return (
    <LiquidGlassBackdrop style={{ flex: 1 }}>
      <View flex={1} backgroundColor={palette.background}>
        <YStack flex={1} paddingTop={insets.top + 14} gap={14}>
        <YStack
          alignSelf="center"
          width="100%"
          maxWidth={MaxContentWidth}
          paddingHorizontal={16}
          gap={14}>
          <Text color={palette.text} fontSize={34} fontWeight="800" letterSpacing={0.37}>
            发现
          </Text>
          <XStack
            height={44}
            borderRadius={18}
            padding={3}
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={palette.border}
            overflow="hidden">
            <GlassPanel kind="liquid" radius={18} variant="bar" />
            <XStack flex={1} zIndex={1}>
              {DISCOVER_TABS.map((option) => {
                const active = option.value === tab;
                return (
                  <XStack
                    key={option.value}
                    flex={1}
                    alignItems="center"
                    justifyContent="center"
                    borderRadius={14}
                    overflow="hidden"
                    pressStyle={{ opacity: 0.6 }}
                    onPress={() => switchTab(option.value)}>
                    {active && <GlassPanel kind="liquid" variant="control" radius={14} />}
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
          </XStack>
        </YStack>

        {mounted.includes('playlist') ? (
          <View flex={1} display={tab === 'playlist' ? 'flex' : 'none'}>
            <PlaylistPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('ranking') ? (
          <View flex={1} display={tab === 'ranking' ? 'flex' : 'none'}>
            <RankingPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('album') ? (
          <View flex={1} display={tab === 'album' ? 'flex' : 'none'}>
            <AlbumPane bottomInset={dockInset} />
          </View>
        ) : null}
        {mounted.includes('song') ? (
          <View flex={1} display={tab === 'song' ? 'flex' : 'none'}>
            <NewSongPane bottomInset={dockInset} />
          </View>
        ) : null}
      </YStack>
    </View>
    </LiquidGlassBackdrop>
  );
}
