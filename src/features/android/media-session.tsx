import { useEffect } from 'react';

import { sizedImage } from '@/lib/format';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { extractCoverAccent } from '@/features/theme/system-accent';
import { log } from '@/lib/logger';

import { addMediaSessionListener, moekoeNative } from './native';

/**
 * MediaSession 桥接控制器（无 UI）。挂载于根布局：
 * - 把 expo-audio 的曲目/播放状态同步到原生 MediaSession，补齐锁屏/通知栏的
 *   上一首/下一首、进度条与封面；
 * - 监听原生回传的切歌/播放暂停/进度事件，转发给播放器 store。
 */
export function MediaSessionController() {
  const player = usePlayer();
  const { positionMs, durationMs } = usePlayerProgress();
  const { track, playing } = player;

  // 原生事件 → 播放器
  useEffect(() => {
    const unsubNext = addMediaSessionListener('onNext', () => {
      log('mediaSession', '收到 onNext，切下一首');
      playerActions.next();
    });
    const unsubPrevious = addMediaSessionListener('onPrevious', () => {
      log('mediaSession', '收到 onPrevious，切上一首');
      playerActions.previous();
    });
    const unsubToggle = addMediaSessionListener('onPlayPause', () => {
      log('mediaSession', '收到 onPlayPause');
      playerActions.toggle();
    });
    const unsubSeek = addMediaSessionListener('onSeekTo', (payload) => {
      const position = (payload as { positionMs?: number } | null)?.positionMs;
      if (typeof position === 'number') {
        playerActions.seekToMs(position);
      }
    });

    return () => {
      unsubNext();
      unsubPrevious();
      unsubToggle();
      unsubSeek();
    };
  }, []);

  // 曲目变化 → 更新元数据（含封面与时长）
  useEffect(() => {
    if (!track) {
      moekoeNative.releaseMediaSession();
      return;
    }

    moekoeNative.updateMediaSession(
      track.title,
      track.artist || '未知歌手',
      track.album ?? '',
      sizedImage(track.coverUrl, 480),
      durationMs || track.durationMs || 0
    );

    // 提取当前封面的 Palette 主色，实时联动全局动态取色。
    extractCoverAccent(sizedImage(track.coverUrl, 480));
  }, [track?.hash, track?.title, track?.artist, track?.album, track?.coverUrl, durationMs]);

  // 播放状态 / 进度 → 同步
  useEffect(() => {
    if (!track) {
      return;
    }

    moekoeNative.setPlaybackState(playing, positionMs, durationMs);
  }, [track?.hash, playing, positionMs, durationMs]);

  return null;
}
