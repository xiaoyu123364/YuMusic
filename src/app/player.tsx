import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Platform,
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
import { Text, View, XStack, YStack, Slider } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { CommentSheet } from '@/components/ui/comment-sheet';
import { EqualizerPanel } from '@/components/ui/equalizer-panel';
import { GlassPanel } from '@/components/ui/glass';
import { LiquidGlassBackdrop } from '@/components/ui/liquid-glass';
import { LyricsView } from '@/components/ui/lyrics-view';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { showToast, ToastHost } from '@/components/ui/toast';
import { StyledSlider } from '@/components/ui/styled-slider';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { ensureOverlayPermission } from '@/features/android/floating-lyrics';
import { isNativeAvailable } from '@/features/android/native';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { settingsActions, usePlayerCoverLook, useSettings } from '@/features/settings/store';
import { useDesignSpec } from '@/features/theme/design-style';
import type { PlayMode } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';
import { formatClock } from '@/lib/format';
import { shareTrack } from '@/lib/share';
import { MaterialLoading } from '@/components/ui/loading';
import { fetchSongCommentCount } from '@/features/song/comment-api';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

/**
 * Apple Music 式大封面卡片：圆角方形 + 悬浮大阴影，无旋转、无装饰环。
 * 外层负责阴影（避免 overflow:hidden 裁掉 iOS 阴影），内层裁切圆角。
 */
function AlbumArtwork({ coverUrl, size }: { coverUrl: string | null; size: number }) {
  const radius = Math.round(size * 0.055);
  return (
    <View
      width={size}
      height={size}
      borderRadius={radius}
      backgroundColor="transparent"
      style={{
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 16,
      }}>
      <View
        width="100%"
        height="100%"
        borderRadius={radius}
        overflow="hidden"
        backgroundColor="rgba(128, 128, 128, 0.12)">
        <Artwork uri={coverUrl} size={size} />
      </View>
    </View>
  );
}

/**
 * 拟真黑胶旋转唱片：
 * 1. 炭黑同心胶盘凹槽与微光边缘。
 * 2. 居中正圆专辑封面与中心金属轴孔。
 * 3. 播放中持续 360° 无缝匀速旋转；暂停时驻留当前角度，恢复播放时平滑接续。
 */
function SpinningDisc({
  coverUrl,
  playing,
  size,
}: {
  coverUrl: string | null;
  playing: boolean;
  size: number;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, {
          duration: 24000,
          easing: Easing.linear,
        }),
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

  const centerArtSize = Math.round(size * 0.62);
  const ring1 = Math.round(size * 0.90);
  const ring2 = Math.round(size * 0.78);
  const spindleHoleSize = Math.max(22, Math.round(size * 0.08));

  return (
    <View
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor="#0D0D11"
      alignItems="center"
      justifyContent="center"
      style={{
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.45,
        shadowRadius: 32,
        elevation: 18,
      }}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
          },
          spinStyle,
        ]}>
        {/* 外圈微光凹槽 */}
        <View
          position="absolute"
          width={ring1}
          height={ring1}
          borderRadius={ring1 / 2}
          borderWidth={1}
          borderColor="rgba(255, 255, 255, 0.05)"
        />
        {/* 内圈微光凹槽 */}
        <View
          position="absolute"
          width={ring2}
          height={ring2}
          borderRadius={ring2 / 2}
          borderWidth={1}
          borderColor="rgba(255, 255, 255, 0.06)"
        />
        {/* 中心唱片贴纸：圆形封面 */}
        <View
          width={centerArtSize}
          height={centerArtSize}
          borderRadius={centerArtSize / 2}
          overflow="hidden"
          borderWidth={2}
          borderColor="rgba(0, 0, 0, 0.6)"
          backgroundColor="rgba(255, 255, 255, 0.05)">
          <Artwork uri={coverUrl} size={centerArtSize} circle />
        </View>
        {/* 中心金属轴孔 */}
        <View
          position="absolute"
          width={spindleHoleSize}
          height={spindleHoleSize}
          borderRadius={spindleHoleSize / 2}
          backgroundColor="#18181C"
          borderWidth={2.5}
          borderColor="rgba(255, 255, 255, 0.25)"
          alignItems="center"
          justifyContent="center">
          <View
            width={spindleHoleSize * 0.4}
            height={spindleHoleSize * 0.4}
            borderRadius={999}
            backgroundColor="#000000"
          />
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * 播放页封面展示容器：
 * 点击在「Apple Music 大方形卡片」与「放大旋转黑胶唱片」模式之间无缝切换。
 */
function PlayerCover({
  coverUrl,
  playing,
  size,
}: {
  coverUrl: string | null;
  playing: boolean;
  size: number;
}) {
  const coverLook = usePlayerCoverLook();
  const discSize = Math.round(size * 1.05);

  return (
    <Pressable
      onPress={() => {
        settingsActions.togglePlayerCoverLook();
      }}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.96 : 1 }],
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      {coverLook === 'disc' ? (
        <SpinningDisc coverUrl={coverUrl} playing={playing} size={discSize} />
      ) : (
        <AlbumArtwork coverUrl={coverUrl} size={size} />
      )}
    </Pressable>
  );
}

function PlaybackProgress() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const { playing } = usePlayer();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const shownPosition = dragValue ?? positionMs;

  return (
    <YStack gap={7}>
      <Slider
        size="$2"
        value={[Math.min(shownPosition, Math.max(durationMs, 1))]}
        max={Math.max(durationMs, 1)}
        step={1}
        disabled={!durationMs}
        onValueChange={(values) => {
          dragValueRef.current = values[0];
          setDragValue(values[0]);
        }}
        onSlideEnd={() => {
          if (dragValueRef.current !== null) {
            playerActions.seekToMs(dragValueRef.current);
          }
          dragValueRef.current = null;
          setTimeout(() => setDragValue(null), 180);
        }}>
        <Slider.Track backgroundColor="transparent" height={6} borderRadius={999} overflow="hidden">
          <GlassPanel kind="liquid" variant="bar" radius={999} />
          <Slider.TrackActive backgroundColor={palette.accent} opacity={0.7} />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          size={18}
          circular
          backgroundColor="transparent"
          borderWidth={StyleSheet.hairlineWidth}
          borderColor={palette.border}
          overflow="hidden"
          shadowColor="#000000"
          shadowOpacity={0.15}
          shadowRadius={6}
          shadowOffset={{ width: 0, height: 2 }}
        >
          <GlassPanel kind="liquid" variant="control" radius={9} />
        </Slider.Thumb>
      </Slider>
      <XStack justifyContent="space-between">
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(shownPosition)}
        </Text>
        {/* Apple Music 惯例：右侧展示剩余时间（负号前缀） */}
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {durationMs > 0 ? `-${formatClock(Math.max(0, durationMs - shownPosition))}` : formatClock(durationMs)}
        </Text>
      </XStack>
    </YStack>
  );
}

/** 音量条：作用于当前音频流（expo-audio volume），材质跟随设计风格。 */
function VolumeControl() {
  const palette = usePalette();
  const [volume, setVolume] = useState(() => playerActions.getVolume());

  function apply(next: number) {
    setVolume(next);
    playerActions.setVolume(next);
  }

  return (
    <XStack alignItems="center" gap={12} width="100%">
      <MaterialCommunityIcons
        name={volume === 0 ? 'volume-off' : volume < 45 ? 'volume-low' : 'volume-high'}
        size={18}
        color={palette.textTertiary}
      />
      <View flex={1}>
        <Slider
          size="$2"
          value={[volume]}
          max={100}
          step={1}
          onValueChange={(values) => apply(values[0])}
        >
          <Slider.Track backgroundColor="transparent" height={6} borderRadius={999} overflow="hidden">
            <GlassPanel kind="liquid" variant="bar" radius={999} />
            <Slider.TrackActive backgroundColor={palette.accent} opacity={0.7} />
          </Slider.Track>
          <Slider.Thumb
            index={0}
            size={18}
            circular
            backgroundColor="transparent"
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={palette.border}
            overflow="hidden"
            shadowColor="#000000"
            shadowOpacity={0.15}
            shadowRadius={6}
            shadowOffset={{ width: 0, height: 2 }}
          >
            <GlassPanel kind="liquid" variant="control" radius={9} />
          </Slider.Thumb>
        </Slider>
      </View>
      <MaterialCommunityIcons name="volume-high" size={24} color={palette.textTertiary} />
    </XStack>
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const player = usePlayer();
  const design = useDesignSpec();
  const { desktopLyrics } = useSettings();

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

  async function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    try {
      // 确保歌单库已加载，避免 toggleLike 因 "没有找到我喜欢歌单" 而静默失败
      await libraryActions.ensure();
      const result = await libraryActions.toggleLike(track);
      showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setLikeBusy(false);
    }
  }

  function handleToggleDesktopLyrics() {
    if (desktopLyrics) {
      settingsActions.setDesktopLyrics(false);
      return;
    }
    if (Platform.OS !== 'android' || !isNativeAvailable()) {
      showToast('桌面歌词仅在 Android 原生构建可用');
      return;
    }
    settingsActions.setDesktopLyrics(true);
    void ensureOverlayPermission().then((granted) => {
      if (!granted) {
        showToast('请在系统设置中开启「显示在其他应用上层」');
      }
    });
  }

  const compact = height < 700;
  const discSize = Math.min(width - 88, compact ? 264 : 330);
  const busy = loading || buffering;

  // 选取液态玻璃材质：如果原生液态玻璃可用则用 liquid，否则回退 frost
  const glassKind = design.liquidReady ? 'liquid' as const : 'frost' as const;

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
    <LiquidGlassBackdrop>
      <View flex={1} backgroundColor={palette.playerBottom}>
        <LinearGradient
          colors={[palette.playerTop, palette.playerBottom]}
          style={StyleSheet.absoluteFill}
        />

        <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={Math.max(insets.bottom, 14) + 10}>
          {/* 顶栏：液态玻璃胶囊 */}
          <XStack zIndex={1} alignItems="center" justifyContent="space-between" paddingHorizontal={18}>
            <XStack
              width={40}
              height={40}
              borderRadius={20}
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              transition="quickest"
              pressStyle={{ opacity: 0.6, scale: 0.92 }}
              onPress={() => router.dismiss()}>
              <GlassPanel kind={glassKind} radius={20} variant="control" />
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
            {/* 桌面歌词快捷切换（原在设置页） */}
            <XStack
              width={40}
              height={40}
              borderRadius={20}
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              transition="quickest"
              pressStyle={{ opacity: 0.6, scale: 0.92 }}
              onPress={handleToggleDesktopLyrics}>
              <GlassPanel kind={glassKind} radius={20} variant="control" />
              <MaterialCommunityIcons
                name={desktopLyrics ? 'message-text' : 'message-text-outline'}
                size={20}
                color={desktopLyrics ? palette.accent : palette.textSecondary}
              />
            </XStack>
          </XStack>

          {/* 封面 / 歌词：横屏/平板双栏，竖屏左右分页 */}
          {isLandscape ? (
            <XStack flex={1} gap={20} paddingHorizontal={28} alignItems="center">
              <YStack width={width * 0.42} alignItems="center" justifyContent="center" gap={18}>
                <PlayerCover
                  coverUrl={track.coverUrl}
                  playing={playing}
                  size={Math.min(discSize, height * 0.7)}
                />
                <YStack gap={4} paddingHorizontal={12} maxWidth={460} alignSelf="center">
                  <Text
                    color={palette.text}
                    fontSize={19}
                    fontWeight="700"
                    numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text color={palette.textSecondary} fontSize={15} numberOfLines={1}>
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
                  <LyricsView
                    lines={lyrics}
                    status={lyricsStatus}
                    onSeekLine={handleSeekLine}
                    fadeTopColor={palette.playerTop}
                    fadeBottomColor={palette.playerBottom}
                  />
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
              <YStack width={width} alignItems="center" justifyContent="center">
                <PlayerCover coverUrl={track.coverUrl} playing={playing} size={discSize} />
              </YStack>

              <YStack width={width} paddingTop={8}>
                {lyricsMounted ? (
                  <LyricsView
                    lines={lyrics}
                    status={lyricsStatus}
                    onSeekLine={handleSeekLine}
                    fadeTopColor={palette.playerTop}
                    fadeBottomColor={palette.playerBottom}
                  />
                ) : null}
              </YStack>
            </ScrollView>
          )}

          {/* ── 液态玻璃控制面板 ── */}
          <YStack
            marginHorizontal={14}
            borderRadius={28}
            overflow="hidden"
            paddingHorizontal={22}
            paddingVertical={compact ? 14 : 18}
            gap={compact ? 10 : 14}
            maxWidth={620}
            width="auto"
            alignSelf="center"
            style={{
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 12,
            }}>
            {/* 玻璃背景层 */}
            <GlassPanel kind="liquid" radius={28} />

            {/* 歌曲信息 */}
            <YStack gap={1}>
              <Text color={palette.text} fontSize={compact ? 19 : 21} fontWeight="700" numberOfLines={1}>
                {track.title}
              </Text>
              <Text color={palette.textSecondary} fontSize={15} fontWeight="500" numberOfLines={1}>
                {track.artist || '未知歌手'}
              </Text>
              {error ? (
                <XStack
                  alignSelf="flex-start"
                  alignItems="center"
                  gap={6}
                  marginTop={5}
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

            {/* 进度条（已迁至玻璃面板内） */}
            <PlaybackProgress />

            {/* 走带控制 */}
            <XStack alignItems="center" justifyContent="center" gap={18} paddingHorizontal={16}>
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
                <Ionicons name="play-skip-back" size={32} color={palette.text} />
              </XStack>

              <XStack
                width={76}
                height={64}
                alignItems="center"
                justifyContent="center"
                transition="quickest"
                pressStyle={{ scale: 0.92, opacity: 0.85 }}
                onPress={() => playerActions.toggle()}>
                {busy ? (
                  <MaterialLoading size={22} color={palette.text} />
                ) : (
                  <Ionicons
                    name={playing ? 'pause' : 'play'}
                    size={42}
                    color={palette.text}
                    style={playing ? undefined : { marginLeft: 4 }}
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
                <Ionicons name="play-skip-forward" size={32} color={palette.text} />
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

            {/* 音量条（已迁至玻璃面板内） */}
            <VolumeControl />

            {/* 次级功能行 */}
            <XStack alignItems="center" justifyContent="center" gap={12} paddingHorizontal={6}>
              <XStack
                width={44}
                height={40}
                alignItems="center"
                justifyContent="center"
                opacity={likeBusy ? 0.5 : 1}
                transition="quickest"
                pressStyle={{ opacity: 0.55, scale: 0.88 }}
                onPress={handleToggleLike}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={23}
                  color={liked ? palette.accent : palette.textSecondary}
                />
              </XStack>
              <XStack
                width={44}
                height={40}
                alignItems="center"
                justifyContent="center"
                transition="quickest"
                pressStyle={{ opacity: 0.55, scale: 0.88 }}
                onPress={() => setActionsOpen(true)}>
                <MaterialCommunityIcons name="playlist-plus" size={23} color={palette.textSecondary} />
              </XStack>
              <XStack
                width={44}
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
                width={44}
                height={40}
                alignItems="center"
                justifyContent="center"
                transition="quickest"
                pressStyle={{ opacity: 0.55, scale: 0.88 }}
                onPress={() => setEqOpen(true)}>
                <MaterialCommunityIcons name="equalizer" size={22} color={palette.textSecondary} />
              </XStack>
              <XStack
                alignItems="center"
                gap={4}
                paddingHorizontal={12}
                paddingVertical={7}
                borderRadius={999}
                transition="quickest"
                pressStyle={{ opacity: 0.7, scale: 0.97 }}
                onPress={() => setCommentsOpen(true)}>
                <MaterialCommunityIcons
                  name="comment-text-multiple-outline"
                  size={14}
                  color={palette.textSecondary}
                />
                <Text color={palette.textSecondary} fontSize={12} fontWeight="600">
                  {commentCount > 0 ? `${commentCount}` : '评论'}
                </Text>
              </XStack>
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
    </LiquidGlassBackdrop>
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
