import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View as RNView } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { GooglePolygonSpinner } from '@/components/ui/google-polygon-spinner';
import { LiquidGlassBackdrop, LiquidGlassSurface } from '@/components/ui/liquid-glass';
import { PlaylistCard } from '@/components/ui/playlist-card';
import { RankCard } from '@/components/ui/rank-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth, WideBreakpoint } from '@/constants/theme';
import { loadHomeData, type HomeBanner, type HomeData, type HomeSong } from '@/features/home/load-home-data';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { formatApiError } from '@/lib/api-parse';

type ScreenState = {
  homeData: HomeData | null;
  initialLoading: boolean;
  refreshing: boolean;
  errorMessage: string;
};

const DAILY_COLUMN_SIZE = 3;

function chunkSongs<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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

function SkeletonRow() {
  const palette = usePalette();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0.5, { duration: 800 })),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, { width: '100%', paddingHorizontal: 16 }]}>
      <XStack gap={12} alignItems="center" paddingVertical={8}>
        <View width={48} height={48} borderRadius={8} backgroundColor={palette.cardAlt} />
        <YStack flex={1} gap={8}>
          <View height={16} width="70%" borderRadius={4} backgroundColor={palette.cardAlt} />
          <View height={12} width="40%" borderRadius={4} backgroundColor={palette.cardAlt} />
        </YStack>
      </XStack>
    </Animated.View>
  );
}

function LoadingSkeletons() {
  const palette = usePalette();
  return (
    <YStack flex={1} backgroundColor={palette.background} paddingTop={100} gap={24}>
      <XStack justifyContent="center" paddingBottom={16}>
        <GooglePolygonSpinner size={44} color={palette.accent} />
      </XStack>
      <YStack paddingHorizontal={16} gap={16}>
        <View height={40} width={150} borderRadius={8} backgroundColor={palette.cardAlt} />
        <View height={200} width="100%" borderRadius={16} backgroundColor={palette.cardAlt} />
      </YStack>
      <YStack gap={12}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </YStack>
    </YStack>
  );
}

function HeroBannerCard({
  banner,
  width,
  height,
  onPress,
}: {
  banner: HomeBanner;
  width: number;
  height: number;
  onPress: () => void;
}) {
  return (
    <SpringPressable onPress={onPress}>
      <View width={width} height={height} borderRadius={24} overflow="hidden">
        <Image
          source={banner.imageUrl ?? undefined}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LiquidGlassSurface radius={24} refractionHeight={height} style={StyleSheet.absoluteFill} />
        <YStack flex={1} justifyContent="flex-end" padding={16}>
          <XStack alignItems="center" gap={12}>
            <XStack
              width={36}
              height={36}
              borderRadius={18}
              backgroundColor="rgba(0,0,0,0.5)"
              alignItems="center"
              justifyContent="center">
              <Ionicons name="play" size={18} color="#FFF" style={{ marginLeft: 2 }} />
            </XStack>
            <YStack flex={1} minWidth={0} overflow="hidden">
              <Text color="#FFF" fontSize={12} fontWeight="600" opacity={0.8} numberOfLines={1} flexShrink={1}>
                精选推荐
              </Text>
              <Text color="#FFF" fontSize={16} fontWeight="800" numberOfLines={1} flexShrink={1}>
                {banner.title}
              </Text>
            </YStack>
          </XStack>
        </YStack>
      </View>
    </SpringPressable>
  );
}

function SmallGridSongCard({
  song,
  active,
  width,
  onPress,
  onMore,
}: {
  song: HomeSong;
  active: boolean;
  width: number;
  onPress: () => void;
  onMore: () => void;
}) {
  const palette = usePalette();
  return (
    <SpringPressable onPress={onPress}>
      <XStack
        width={width}
        alignItems="center"
        gap={12}
        padding={8}
        borderRadius={12}
        backgroundColor={active ? palette.accentSoft : 'transparent'}>
        <Artwork uri={song.coverUrl} radius={8} size={48} />
        <YStack flex={1} gap={2} minWidth={0} overflow="hidden">
          <Text
            color={active ? palette.accent : palette.text}
            fontSize={14}
            fontWeight="600"
            numberOfLines={1}
            flexShrink={1}>
            {song.title}
          </Text>
          <Text color={palette.textSecondary} fontSize={12} numberOfLines={1} flexShrink={1}>
            {song.artist || '未知歌手'}
          </Text>
        </YStack>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onMore();
          }}
          style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={16} color={palette.textTertiary} />
        </Pressable>
      </XStack>
    </SpringPressable>
  );
}

function LargeRecentCard({
  song,
  active,
  width,
  onPress,
}: {
  song: HomeSong;
  active: boolean;
  width: number;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <SpringPressable onPress={onPress}>
      <YStack width={width} gap={8}>
        <Artwork uri={song.coverUrl} radius={16} size={width} />
        <YStack gap={2} minWidth={0} overflow="hidden">
          <Text
            color={active ? palette.accent : palette.text}
            fontSize={14}
            fontWeight="600"
            numberOfLines={1}
            flexShrink={1}>
            {song.title}
          </Text>
          <Text color={palette.textSecondary} fontSize={12} numberOfLines={1} flexShrink={1}>
            {song.artist || '未知歌手'}
          </Text>
        </YStack>
      </YStack>
    </SpringPressable>
  );
}

export default function HomeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const { width } = useWindowDimensions();
  const { track } = usePlayer();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    homeData: null,
    initialLoading: true,
    refreshing: false,
    errorMessage: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  const contentWidth = Math.min(width, MaxContentWidth) - 32;
  const playlistColumns = contentWidth >= WideBreakpoint ? 3 : 2;
  const playlistCardWidth = Math.floor(
    (contentWidth - 14 * (playlistColumns - 1)) / playlistColumns
  );
  const bannerWidth = Math.min(contentWidth, 560);
  const bannerHeight = Math.round(bannerWidth * 0.5);
  const recentCardWidth = Math.min(140, Math.floor(contentWidth * 0.4));
  const gridCardWidth = contentWidth >= WideBreakpoint ? Math.floor(contentWidth / 2) - 8 : contentWidth - 16;

  async function refreshHome(mode: 'initial' | 'refresh' = 'initial') {
    const requestId = ++requestIdRef.current;
    startTransition(() => {
      setState((current) => ({
        ...current,
        initialLoading: !current.homeData,
        refreshing: Boolean(current.homeData),
        errorMessage: '',
      }));
    });
    try {
      const homeData = await loadHomeData();
      if (requestId !== requestIdRef.current) return;
      startTransition(() => {
        setState({ homeData, initialLoading: false, refreshing: false, errorMessage: '' });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      startTransition(() => {
        setState((current) => ({
          homeData: current.homeData,
          initialLoading: false,
          refreshing: false,
          errorMessage: formatApiError(error),
        }));
      });
    }
  }

  useEffect(() => {
    void refreshHome('initial');
  }, []);

  if (!state.homeData && state.initialLoading) {
    return (
      <LiquidGlassBackdrop>
        <LoadingSkeletons />
      </LiquidGlassBackdrop>
    );
  }

  if (!state.homeData) {
    return (
      <LiquidGlassBackdrop>
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          gap={18}
          paddingHorizontal={32}
          backgroundColor={palette.background}>
          <Ionicons name="cloud-offline-outline" size={44} color={palette.textTertiary} />
          <YStack alignItems="center" gap={6}>
            <Text color={palette.text} fontSize={17} fontWeight="700">内容加载失败</Text>
            <Text color={palette.textTertiary} fontSize={13} textAlign="center">
              {state.errorMessage || '网络似乎不太顺畅，请稍后重试'}
            </Text>
          </YStack>
          <SpringPressable onPress={() => void refreshHome('initial')}>
            <XStack
              paddingHorizontal={26}
              height={44}
              alignItems="center"
              borderRadius={999}
              backgroundColor={palette.accent}>
              <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">重新加载</Text>
            </XStack>
          </SpringPressable>
        </YStack>
      </LiquidGlassBackdrop>
    );
  }

  const { homeData } = state;
  const activeHash = track?.hash;
  const dailyColumns = chunkSongs(homeData.dailySongs, DAILY_COLUMN_SIZE);

  return (
    <LiquidGlassBackdrop>
      <View flex={1} backgroundColor={palette.background}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl
              refreshing={state.refreshing}
              onRefresh={() => void refreshHome('refresh')}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
              progressViewOffset={insets.top}
            >
              <GooglePolygonSpinner size={34} color={palette.accent} />
            </RefreshControl>
          }
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 14, paddingBottom: dockInset },
          ]}>
          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={16}>
            <Text color={palette.text} fontSize={34} fontWeight="800" letterSpacing={0.37}>现在就听</Text>
            <SpringPressable onPress={() => router.push('/search')}>
              <XStack
                alignItems="center"
                gap={6}
                height={36}
                paddingHorizontal={14}
                borderRadius={18}
                backgroundColor={palette.card}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}>
                <Ionicons name="search" size={16} color={palette.accent} />
                <XStack
                  width={24}
                  height={24}
                  alignItems="center"
                  justifyContent="center"
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push('/recognize');
                  }}>
                  <Ionicons name="mic" size={16} color={palette.accent} />
                </XStack>
              </XStack>
            </SpringPressable>
          </XStack>

          {state.errorMessage ? (
            <XStack
              alignItems="center"
              gap={8}
              paddingHorizontal={14}
              paddingVertical={10}
              borderRadius={14}
              backgroundColor={palette.dangerSoft}
              marginHorizontal={16}>
              <Ionicons name="alert-circle" size={15} color={palette.danger} />
              <Text flex={1} color={palette.danger} fontSize={12.5}>部分内容刷新失败，正在展示上次内容</Text>
            </XStack>
          ) : null}

          {homeData.banners.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={bannerWidth + 12}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {homeData.banners.map((banner) => (
                <HeroBannerCard
                  key={banner.id}
                  banner={banner}
                  width={bannerWidth}
                  height={bannerHeight}
                  onPress={() => {
                    if (banner.playlistGid) {
                      router.push({
                        pathname: '/playlist/[id]',
                        params: { id: banner.playlistGid, name: banner.title, cover: banner.imageUrl ?? '' },
                      });
                      return;
                    }
                    if (banner.linkUrl) {
                      router.push({ pathname: '/web', params: { url: banner.linkUrl, title: banner.title } });
                    }
                  }}
                />
              ))}
            </ScrollView>
          ) : null}

          {homeData.newSongs.length ? (
            <YStack gap={12} paddingHorizontal={16}>
              <SectionHeader title="最近播放 / 重温经典" subtitle="沉浸在你喜爱的音乐中" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14 }}>
                {homeData.newSongs.map((song, index) => (
                  <LargeRecentCard
                    key={`recent-${song.hash}`}
                    song={song}
                    active={song.hash === activeHash}
                    width={recentCardWidth}
                    onPress={() => void playerActions.playTracks(homeData.newSongs, index)}
                  />
                ))}
              </ScrollView>
            </YStack>
          ) : null}

          {homeData.dailySongs.length ? (
            <YStack gap={12} paddingHorizontal={16}>
              <SectionHeader
                title="每日精选 / 为你推荐"
                subtitle="Apple Music 编辑精选"
                actionLabel="播放全部"
                onAction={() => void playerActions.playTracks(homeData.dailySongs, 0)}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={gridCardWidth + 12}
                decelerationRate="fast"
                contentContainerStyle={{ gap: 12 }}>
                {dailyColumns.map((column, columnIndex) => (
                  <YStack key={`daily-column-${columnIndex}`} width={gridCardWidth} gap={4}>
                    {column.map((song, rowIndex) => {
                      const index = columnIndex * DAILY_COLUMN_SIZE + rowIndex;
                      return (
                        <SmallGridSongCard
                          key={`${song.hash}-${index}`}
                          song={song}
                          active={song.hash === activeHash}
                          width={gridCardWidth}
                          onPress={() => void playerActions.playTracks(homeData.dailySongs, index)}
                          onMore={() => setActionTrack(song)}
                        />
                      );
                    })}
                  </YStack>
                ))}
              </ScrollView>
            </YStack>
          ) : null}

          {homeData.playlists.length ? (
            <YStack gap={12} paddingHorizontal={16}>
              <SectionHeader title="热门歌单" subtitle="精选歌单推荐" />
              <XStack flexWrap="wrap" gap={14}>
                {homeData.playlists.map((playlist) => (
                  <SpringPressable
                    key={playlist.gid}
                    onPress={() =>
                      router.push({
                        pathname: '/playlist/[id]',
                        params: { id: playlist.gid, name: playlist.title, cover: playlist.coverUrl ?? '' },
                      })
                    }>
                    <RNView
                      style={{
                        width: playlistCardWidth,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.27,
                        shadowRadius: 4.65,
                        elevation: 6,
                        borderRadius: 18,
                        backgroundColor: palette.card,
                      }}>
                      <PlaylistCard
                        title={playlist.title}
                        coverUrl={playlist.coverUrl}
                        playCountText={playlist.playCountText}
                        width={playlistCardWidth}
                        onPress={() => {}}
                      />
                    </RNView>
                  </SpringPressable>
                ))}
              </XStack>
            </YStack>
          ) : null}

          {homeData.rankCards.length ? (
            <YStack gap={12} paddingHorizontal={16}>
              <SectionHeader title="排行榜" subtitle="全球热门单曲" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                {homeData.rankCards.map((card) => (
                  <SpringPressable key={card.id}>
                    <RankCard
                      title={card.title}
                      coverUrl={card.coverUrl}
                      songs={card.songs}
                      activeHash={activeHash}
                      onPressSong={(index) => void playerActions.playTracks(card.songs, index)}
                      onPlayAll={() => void playerActions.playTracks(card.songs, 0)}
                    />
                  </SpringPressable>
                ))}
              </ScrollView>
            </YStack>
          ) : null}
        </ScrollView>

        <TrackActionsSheet
          open={Boolean(actionTrack)}
          onOpenChange={(open) => {
            if (!open) setActionTrack(null);
          }}
          track={actionTrack}
        />
      </View>
    </LiquidGlassBackdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: 32,
  },
});
