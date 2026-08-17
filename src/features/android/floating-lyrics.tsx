import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { playerActions, usePlayer, usePlayerProgressSelector } from '@/features/player/store';
import { useIsDark } from '@/hooks/use-palette';
import { useSettings } from '@/features/settings/store';

import { isNativeAvailable, moekoeNative } from './native';

/** 检查悬浮窗权限；未授权时跳转系统授权页（ACTION_MANAGE_OVERLAY_PERMISSION）。 */
export async function ensureOverlayPermission(): Promise<boolean> {
  if (!isNativeAvailable()) {
    return false;
  }

  if (moekoeNative.canDrawOverlays()) {
    return true;
  }

  moekoeNative.requestOverlayPermission();
  return false;
}

/**
 * 桌面歌词悬浮窗控制器（无 UI）。挂载于根布局：
 * - 开关开启且已授权时显示悬浮窗，并随播放进度实时刷新当前歌词行；
 * - 用户从系统授权页返回时，若已授权则自动补显。
 */
export function FloatingLyricsController() {
  const { desktopLyrics, lyricOverlayBg, lyricOverlayText } = useSettings();
  const isDark = useIsDark();
  const { track, lyrics, lyricsStatus } = usePlayer();
  const positionMs = usePlayerProgressSelector((state) => state.positionMs);
  const lastGrantedRef = useRef(false);

  // 开关变化：显隐 + 授权
  useEffect(() => {
    if (!desktopLyrics || Platform.OS !== 'android') {
      moekoeNative.hideLyricOverlay();
      lastGrantedRef.current = false;
      return;
    }

    void (async () => {
      const granted = await ensureOverlayPermission();
      lastGrantedRef.current = granted;
      if (granted) {
        moekoeNative.showLyricOverlay();
      }
    })();
  }, [desktopLyrics]);

  // 从系统授权页返回后补显
  useEffect(() => {
    if (!desktopLyrics || Platform.OS !== 'android') {
      return;
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !lastGrantedRef.current && moekoeNative.canDrawOverlays()) {
        lastGrantedRef.current = true;
        moekoeNative.showLyricOverlay();
      }
    });

    return () => subscription.remove();
  }, [desktopLyrics]);

  // 开启时确保歌词已加载
  useEffect(() => {
    if (desktopLyrics && track && lyricsStatus === 'idle') {
      void playerActions.loadLyrics();
    }
  }, [desktopLyrics, track?.hash, lyricsStatus]);

  // 实时刷新当前歌词行
  useEffect(() => {
    if (!desktopLyrics || !track) {
      return;
    }

    const index = findActiveLyricIndex(lyrics, positionMs);
    const current = index >= 0 ? lyrics[index]?.text ?? '' : '';
    moekoeNative.updateLyricOverlay(
      current || track.title,
      current ? `${track.title} · ${track.artist || ''}` : track.artist || '',
      isDark,
      lyricOverlayBg,
      lyricOverlayText
    );
  }, [desktopLyrics, track, lyrics, positionMs, isDark, lyricOverlayBg, lyricOverlayText]);

  return null;
}
