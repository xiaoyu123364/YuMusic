import { File, Paths } from 'expo-file-system';

import { moekoeNative } from '@/features/android/native';
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

/**
 * 下载单曲到「本地音乐」：
 * 1. 先下载到 cache；
 * 2. 再经原生 MediaStore 复制到 /storage/emulated/0/Download/yumusic/；
 * 3. 记录到本地音乐清单。
 * 返回公开路径（失败返回 null）。
 */
export async function downloadTrackToLibrary(track: PlayerTrack): Promise<string | null> {
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
    const publicUri = moekoeNative.saveToPublicDownloads(downloaded.uri, displayName);
    log('download', `保存到公共下载: ${publicUri ?? '(失败)'}`);
    if (!publicUri) {
      return null;
    }

    addLocalTrack(track, publicUri);
    return publicUri;
  } catch (error) {
    logError('download', `下载失败: ${track.title}`, error);
    return null;
  }
}

/** 批量下载到本地音乐，返回成功数量。 */
export async function downloadTracksToLibrary(tracks: PlayerTrack[]): Promise<number> {
  let ok = 0;
  for (const track of tracks) {
    if (await downloadTrackToLibrary(track)) {
      ok += 1;
    }
  }
  return ok;
}
