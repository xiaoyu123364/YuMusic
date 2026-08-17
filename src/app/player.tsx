import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  InteractionManager,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slider, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { CommentSheet } from '@/components/ui/comment-sheet';
import { EqualizerPanel } from '@/components/ui/equalizer-panel';import { LyricsView } from '@/components/ui/lyrics-view';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { showToast, ToastHost } from '@/components/ui/toast';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import type { PlayMode } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';
import { shareTrack } from '@/lib/share';
import { MaterialLoading } from '@/components/ui/loading';
import { fetchSongCommentCount } from '@/features/song/comment-api';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

function SpinningDisc({ coverUrl, playing, size }: { coverUrl: string | null; playing: boolean; size: number }) {
  const isDark = useIsDark();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 24000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      alignItems="center"
      justifyContent="center"
      backgroundColor={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.75)'}
      shadowColor="#000000"
      shadowOffset={{ width: 0, height: 18 }}
      shadowOpacity={isDark ? 0.5 : 0.18}
      shadowRadius={30}
      elevation={16}>
      <Animated.View style={spinStyle}>
        <Artwork uri={coverUrl} size={size - 26} circle />
      </Animated.View>
    </YStack>
  );
}

function PlaybackProgress() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const shownPosition = dragValue ?? positionMs;

  return (
    <YStack gap={7}>
      <Slider
        size="$2"
        value={[Math.min(shownPosition, Math.max(durationMs, 1))]}
        max={Math.max(durationMs, 1)}
        step={250}
        disabled={!durationMs}
        onValueChange={(values) => {
          const next = values[0] ?? 0;
          dragValueRef.current = next;
          setDragValue(next);
        }}
        onSlideEnd={() => {
          if (dragValueRef.current !== null) {
            playerActions.seekToMs(dragValueRef.current);
          }
          dragValueRef.current = null;
          setTimeout(() => setDragValue(null), 180);
        }}>
        <Slider.Track backgroundColor={palette.cardAlt} height={4} borderRadius={999}>
          <Slider.TrackActive backgroundColor={palette.accent} />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          size={16}
          circular
          backgroundColor={palette.accent}
          borderWidth={2.5}
          borderColor="#FFFFFF"
          pressStyle={{
            scale: 1.2,
            backgroundColor: palette.accentPressed,
            borderColor: '#FFFFFF',
          }}
          hoverStyle={{ backgroundColor: palette.accent, borderColor: '#FFFFFF' }}
          shadowColor="#000000"
          shadowOpacity={0.2}
          shadowRadius={5}
          shadowOffset={{ width: 0, height: 2 }}
        />
      </Slider>
      <XStack justifyContent="space-between">
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(shownPosition)}
        </Text>
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(durationMs)}
        </Text>
      </XStack>
    </YStack>
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const player = usePlayer();

  const [pageIndex, setPageIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const pagerRef = useRef<ScrollView>(null);

  const { track, playing, loading, buffering, mode, error, lyrics, lyricsStatus } = player;
  const liked = useIsLiked(track?.hash);

  useEffect(() => {
    // 提前加载歌单库,让心形按钮反映真实喜欢状态
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setLyricsMounted(true));
    return () => task.cancel();
  }, []);

  const isLandscape = width > height;

  useEffect(() => {
    if (isLandscape || pageIndex === 1) {
      void playerActions.loadLyrics();
    }
  }, [isLandscape, pageIndex, track?.hash]);

  // 拉取当前歌曲评论总数，供底部「xx 评论」按钮展示。
  useEffect(() => {
    if (!track) {
      return;
    }
    let cancelled = false;
    fetchSongCommentCount(track).then((count) => {
      if (!cancelled) {
        setCommentCount(count);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [track?.hash]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    libraryActions
      .toggleLike(track)
      .then((result) => {
        showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      })
      .catch((cause) => {
        showToast(cause instanceof Error ? cause.message : '操作失败');
      })
      .finally(() => setLikeBusy(false));
  }

  const compact = height < 700;
  const discSize = Math.min(width - 104, compact ? 236 : 300);
  const busy = loading || buffering;

  function handlePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }

  const handleSeekLine = useCallback((line: { timeMs: number }) => {
    playerActions.seekToMs(line.timeMs);
  }, []);

  if (!track) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={16}
        backgroundColor={palette.background}
        paddingTop={insets.top}>
        <Ionicons name="musical-notes-outline" size={44} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={14}>
          还没有正在播放的歌曲
        </Text>
        <XStack
          paddingHorizontal={24}
          height={42}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accentSoft}
          pressStyle={{ opacity: 0.7 }}
          onPress={() => router.back()}>
          <Text color={palette.accent} fontSize={14} fontWeight="600">
            返回
          </Text>
        </XStack>
      </YStack>
    );
  }

  return (
    <View flex={1} backgroundColor={palette.playerBottom}>
      <LinearGradient
        colors={[palette.playerTop, palette.playerBottom]}
        style={StyleSheet.absoluteFill}
      />

      <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={Math.max(insets.bottom, 14) + 20}>
        {/* 顶栏 */}
        <XStack zIndex={1} alignItems="center" justifyContent="space-between" paddingHorizontal={18}>
          <XStack
            width={40}
            height={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            transition="quickest"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => router.dismiss()}>
            <Ionicons name="chevron-down" size={24} color={palette.textSecondary} />
          </XStack>
          <YStack alignItems="center" gap={2}>
            <Text color={palette.textTertiary} fontSize={11} letterSpacing={1.2}>
              正在播放
            </Text>
            <XStack gap={5} alignItems="center">
              {[0, 1].map((dot) => (
                <View
                  key={dot}
                  width={dot === pageIndex ? 14 : 5}
                  height={5}
                  borderRadius={999}
                  backgroundColor={dot === pageIndex ? palette.accent : palette.textTertiary}
                  opacity={dot === pageIndex ? 1 : 0.4}
                  transition="quick"
                />
              ))}
            </XStack>
          </YStack>
          <View width={40} height={40} />
        </XStack>

        {/* 封面 / 歌词：横屏/平板双栏，竖屏左右分页 */}
        {isLandscape ? (
          <XStack flex={1} gap={20} paddingHorizontal={28} alignItems="center">
            <YStack width={width * 0.42} alignItems="center" justifyContent="center" gap={20}>
              <SpinningDisc
                coverUrl={track.coverUrl}
                playing={playing}
                size={Math.min(discSize, height * 0.7)}
              />
              <YStack alignItems="center" gap={7} paddingHorizontal={24} maxWidth={460}>
                <Text
                  color={palette.text}
                  fontSize={20}
                  fontWeight="800"
                  textAlign="center"
                  numberOfLines={1}>
                  {track.title}
                </Text>
                <Text color={palette.textSecondary} fontSize={14} numberOfLines={1}>
                  {track.artist || '未知歌手'}
                </Text>
                {error ? (
                  <XStack
                    alignItems="center"
                    gap={6}
                    marginTop={4}
                    paddingHorizontal={13}
                    paddingVertical={7}
                    borderRadius={999}
                    backgroundColor={palette.dangerSoft}>
                    <Ionicons name="alert-circle" size={13} color={palette.danger} />
                    <Text color={palette.danger} fontSize={12}>
                      {error}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            </YStack>

            <View width={StyleSheet.hairlineWidth} height="70%" backgroundColor={palette.border} />

            <YStack flex={1} paddingTop={8}>
              {lyricsMounted ? (
                <LyricsView lines={lyrics} status={lyricsStatus} onSeekLine={handleSeekLine} />
              ) : null}
            </YStack>
          </XStack>
        ) : (
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handlePagerScroll}
            style={{ flex: 1 }}>
            <YStack width={width} alignItems="center" justifyContent="center" gap={compact ? 20 : 30}>
              <SpinningDisc coverUrl={track.coverUrl} playing={playing} size={discSize} />

              <YStack alignItems="center" gap={7} paddingHorizontal={40} maxWidth={560}>
                <Text
                  color={palette.text}
                  fontSize={compact ? 19 : 22}
                  fontWeight="800"
                  textAlign="center"
                  numberOfLines={1}>
                  {track.title}
                </Text>
                <Text color={palette.textSecondary} fontSize={14} numberOfLines={1}>
                  {track.artist || '未知歌手'}
                </Text>
                {error ? (
                  <XStack
                    alignItems="center"
                    gap={6}
                    marginTop={4}
                    paddingHorizontal={13}
                    paddingVertical={7}
                    borderRadius={999}
                    backgroundColor={palette.dangerSoft}>
                    <Ionicons name="alert-circle" size={13} color={palette.danger} />
                    <Text color={palette.danger} fontSize={12}>
                      {error}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            </YStack>

            <YStack width={width} paddingTop={8}>
              {lyricsMounted ? (
                <LyricsView
                  lines={lyrics}
                  status={lyricsStatus}
                  onSeekLine={handleSeekLine}
                />
              ) : null}
            </YStack>
          </ScrollView>
        )}

        {/* 进度与控制 */}
        <YStack paddingHorizontal={28} gap={compact ? 14 : 20} maxWidth={620} width="100%" alignSelf="center">
          <XStack alignItems="center" justifyContent="center" gap={30}>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              opacity={likeBusy ? 0.5 : 1}
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={handleToggleLike}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={24}
                color={liked ? palette.accent : palette.textSecondary}
              />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => setActionsOpen(true)}>
              <MaterialCommunityIcons name="playlist-plus" size={24} color={palette.textSecondary} />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => {
                if (track) {
                  void shareTrack(track);
                }
              }}>
              <Ionicons name="share-social-outline" size={22} color={palette.textSecondary} />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => setEqOpen(true)}>
              <MaterialCommunityIcons name="equalizer" size={22} color={palette.textSecondary} />
            </XStack>
          </XStack>

          <PlaybackProgress />

          <XStack alignItems="center" justifyContent="space-between">
            <XStack
              width={42}
              height={42}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => playerActions.cycleMode()}>
              <MaterialCommunityIcons name={MODE_ICON[mode]} size={22} color={palette.textSecondary} />
            </XStack>

            <XStack
              width={52}
              height={52}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.previous()}>
              <Ionicons name="play-skip-back" size={28} color={palette.text} />
            </XStack>

            <XStack
              width={74}
              height={74}
              borderRadius={37}
              overflow="hidden"
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ scale: 0.94, opacity: 0.9 }}
              onPress={() => playerActions.toggle()}>
              <LinearGradient
                colors={[palette.gradientStart, palette.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {busy ? (
                <MaterialLoading size={16} color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={30}
                  color="#FFFFFF"
                  style={playing ? undefined : { marginLeft: 3 }}
                />
              )}
            </XStack>

            <XStack
              width={52}
              height={52}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.next()}>
              <Ionicons name="play-skip-forward" size={28} color={palette.text} />
            </XStack>

            <XStack
              width={42}
              height={42}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => setQueueOpen(true)}>
              <MaterialCommunityIcons name="playlist-music" size={24} color={palette.textSecondary} />
            </XStack>
          </XStack>

          <XStack
            alignSelf="center"
            alignItems="center"
            gap={5}
            paddingHorizontal={15}
            paddingVertical={8}
            borderRadius={999}
            backgroundColor={palette.cardAlt}
            transition="quickest"
            pressStyle={{ opacity: 0.7, scale: 0.97 }}
            onPress={() => setCommentsOpen(true)}>
            <MaterialCommunityIcons
              name="comment-text-multiple-outline"
              size={15}
              color={palette.textSecondary}
            />
            <Text color={palette.textSecondary} fontSize={12.5} fontWeight="600">
              {commentCount > 0 ? `${commentCount} 评论` : '评论'}
            </Text>
            <MaterialCommunityIcons name="chevron-up" size={15} color={palette.textTertiary} />
          </XStack>
        </YStack>
      </YStack>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
      <CommentSheet open={commentsOpen} onOpenChange={setCommentsOpen} track={track} />
      <Modal
        visible={eqOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEqOpen(false)}>
        <Pressable style={styles.eqOverlay} onPress={() => setEqOpen(false)}>
          <Pressable style={styles.eqContainer} onPress={(event) => event.stopPropagation()}>
            <YStack
              backgroundColor={palette.card}
              borderRadius={22}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              overflow="hidden">
              <YStack padding={18} gap={14}>
                <XStack alignItems="center" justifyContent="space-between">
                  <Text color={palette.text} fontSize={18} fontWeight="800">
                    音效 / 均衡器
                  </Text>
                  <XStack
                    width={30}
                    height={30}
                    borderRadius={15}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={palette.cardAlt}
                    transition="quickest"
                    pressStyle={{ opacity: 0.6, scale: 0.92 }}
                    onPress={() => setEqOpen(false)}>
                    <Ionicons name="close" size={16} color={palette.textSecondary} />
                  </XStack>
                </XStack>
                <EqualizerPanel />
              </YStack>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
      <TrackActionsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        track={track}
        initialView="pick"
      />
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  eqOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  eqContainer: {
    width: '100%',
    maxWidth: 420,
  },
});
