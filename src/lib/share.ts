import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import type { PlayerTrack } from '@/features/player/types';
import { resolveSongSource } from '@/features/player/song-url';
import { encodeShareCode } from '@/lib/share-code';
import { log, logError } from '@/lib/logger';

/** 单曲分享（分享码）：生成 YM+hash 码 + 文案，走系统分享面板。 */
export async function shareTrack(track: PlayerTrack): Promise<boolean> {
  const code = encodeShareCode(track.hash);
  const message =
    `你的好友分享了《${track.artist} - ${track.title}》给你，快去听听吧！\n` +
    `分享码：${code}\n` +
    `打开 YuMusic，在搜索框粘贴此码即可播放`;

  try {
    const result = await Share.share({ message }, { dialogTitle: '分享歌曲' });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

/** 多选分享（分享码）：把多首歌曲的分享码合并为一条文案分享出去。 */
export async function shareTracksAsCodes(tracks: PlayerTrack[]): Promise<boolean> {
  log('share', `批量生成 ${tracks.length} 个分享码`);
  if (!tracks.length) {
    return false;
  }

  const lines = tracks
    .map((track) => `《${track.artist} - ${track.title}》 分享码：${encodeShareCode(track.hash)}`)
    .join('\n');
  const message =
    `你的好友分享了 ${tracks.length} 首歌给你，快去听听吧！\n` +
    `${lines}\n` +
    `打开 YuMusic，在搜索框粘贴任一分享码即可播放`;

  try {
    const result = await Share.share({ message }, { dialogTitle: '分享歌曲' });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

function extFromUrl(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = match?.[1]?.toLowerCase();
  if (ext === 'mp4' || ext === 'm4a' || ext === 'mp3' || ext === 'flac' || ext === 'aac' || ext === 'wav') {
    return ext;
  }
  return 'mp3';
}

function mimeFor(ext: string): string {
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'wav') return 'audio/wav';
  return 'audio/mpeg';
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'song';
}

// 酷狗音频 CDN 需要 Referer / User-Agent，否则下载 403。
const DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  Referer: 'https://www.kugou.com/',
};

/** 下载单首歌曲到缓存目录，返回 file:// uri（失败返回 null）。 */
async function downloadTrackToCache(track: PlayerTrack): Promise<string | null> {
  try {
    const source = await resolveSongSource(track);
    const ext = extFromUrl(source.uri);
    const fileName = `${sanitize(`${track.artist} - ${track.title}`)}.${ext}`;
    const destination = new File(Paths.cache, fileName);
    const task = File.createDownloadTask(source.uri, destination, { headers: DOWNLOAD_HEADERS });
    const file = await task.downloadAsync();
    log('share', `音频下载完成: ${file?.uri ?? '(空)'}`);
    return file ? file.uri : null;
  } catch (error) {
    logError('share', `音频下载失败: ${track.title}`, error);
    return null;
  }
}

/** 单曲分享（音频文件）：下载音频后调起系统分享面板，可直接发到微信/QQ。 */
export async function shareAudioFile(track: PlayerTrack): Promise<boolean> {
  try {
    const fileUri = await downloadTrackToCache(track);
    if (!fileUri) {
      return shareTrack(track);
    }

    if (await Sharing.isAvailableAsync()) {
      const ext = extFromUrl(fileUri);
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeFor(ext),
        dialogTitle: `分享《${track.title}》`,
        UTI: ext === 'mp3' ? 'public.mp3' : 'public.mpeg-4-audio',
      });
      return true;
    }

    return shareTrack(track);
  } catch (error) {
    logError('share', '音频文件分享失败', error);
    return shareTrack(track);
  }
}
