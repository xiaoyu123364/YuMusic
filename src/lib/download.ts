import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

import { isNativeAvailable, moekoeNative } from '@/features/android/native';
import { addLocalTrack } from '@/features/local/local-store';
import { resolveSongSource } from '@/features/player/song-url';
import type { PlayerTrack } from '@/features/player/types';
import { log, logError } from '@/lib/logger';

const DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  Referer: 'https://www.kugou.com/',
};

function extFromUrl(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = match?.[1]?.toLowerCase();
  if (ext === 'mp4' || ext === 'm4a' || ext === 'mp3' || ext === 'flac' || ext === 'aac' || ext === 'wav') {
    return ext;
  }
  return 'mp3';
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'song';
}

function mimeFor(ext: string): string {
  switch (ext) {
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/m4a';
    case 'aac':
      return 'audio/aac';
    case 'wav':
      return 'audio/wav';
    case 'mp4':
      return 'audio/mp4';
    default:
      return 'audio/mpeg';
  }
}

function utiFor(ext: string): string {
  switch (ext) {
    case 'mp3':
      return 'public.mp3';
    case 'flac':
      return 'public.audio-lossless';
    case 'm4a':
    case 'mp4':
      return 'public.mpeg-4-audio';
    case 'aac':
      return 'public.aac-audio';
    case 'wav':
      return 'public.wav';
    default:
      return 'public.audio';
  }
}

/**
 * 下载单曲到「本地音乐」，按平台分流：
 * - Android：经原生 MediaStore 复制到公共 Download/yumusic/，并记录到本地音乐清单。
 * - iOS / 无原生：iOS 没有「公共下载目录」概念，改为下载到缓存后加入本地音乐
 *   （应用内可播放），并调起系统分享面板，用户可保存到「文件」App / AirDrop / 第三方。
 *
 * @param share 是否额外调起系统分享面板。单曲下载默认 true；批量下载传 false
 *   以避免连续弹出多个分享框（批量仅入本地音乐，分享可后续单首操作）。
 * @returns 成功返回可播放的本地 URI；失败返回 null。
 */
export async function downloadTrackToLibrary(
  track: PlayerTrack,
  share = true
): Promise<string | null> {
  try {
    const source = await resolveSongSource(track);
    const ext = extFromUrl(source.uri);
    const fileName = `${sanitize(`${track.artist} - ${track.title}`)}.${ext}`;

    const cacheFile = new File(Paths.cache, fileName);
    const task = File.createDownloadTask(source.uri, cacheFile, { headers: DOWNLOAD_HEADERS });
    const downloaded = await task.downloadAsync();
    if (!downloaded) {
      return null;
    }

    const displayName = sanitize(`${track.artist} - ${track.title}`);

    // Android：保存到公共下载目录（MediaStore），并记入本地音乐。
    if (Platform.OS === 'android' && isNativeAvailable()) {
      const publicUri = moekoeNative.saveToPublicDownloads(downloaded.uri, displayName);
      log('download', `保存到公共下载: ${publicUri ?? '(失败)'}`);
      if (!publicUri) {
        return null;
      }
      addLocalTrack(track, publicUri);
      return publicUri;
    }

    // iOS / 非 Android：加入本地音乐（缓存路径，应用内可播），并走系统分享导出。
    addLocalTrack(track, downloaded.uri);
    if (share) {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloaded.uri, {
            mimeType: mimeFor(ext),
            dialogTitle: `保存 / 分享《${displayName}》`,
            UTI: utiFor(ext),
          });
        }
      } catch (shareError) {
        // 用户取消分享或分享失败不影响已下载到本地音乐的结果。
        logError('download', 'iOS 系统分享被取消或失败', shareError);
      }
    }
    return downloaded.uri;
  } catch (error) {
    logError('download', `下载失败: ${track.title}`, error);
    return null;
  }
}

/** 批量下载到本地音乐，返回成功数量（不逐首弹分享框）。 */
export async function downloadTracksToLibrary(tracks: PlayerTrack[]): Promise<number> {
  let ok = 0;
  for (const track of tracks) {
    if (await downloadTrackToLibrary(track, false)) {
      ok += 1;
    }
  }
  return ok;
}
