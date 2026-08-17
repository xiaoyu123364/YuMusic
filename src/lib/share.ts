import { Share } from 'react-native';

import type { PlayerTrack } from '@/features/player/types';
import { encodeShareCode } from '@/lib/share-code';
import { log } from '@/lib/logger';

/** 单曲分享：生成分享码 + 文案，走系统分享面板（微信/QQ/复制等）。 */
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

/** 多选分享：把多首歌曲的分享码合并为一条文案分享出去。 */
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
