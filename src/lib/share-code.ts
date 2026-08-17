import { pickNumber, pickStringLike, pickText, toRecord } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, stripEmTags } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';
import type { PlayerTrack } from '@/features/player/types';

/**
 * 分享码：形如 `YM1145D7FF7F2101CF0687672805D14CF1`。
 * 前缀 `YM` 用于在搜索框识别（区别于普通关键词），后接 32 位歌曲 hash。
 * 由于 hash 本身含字母，天然满足「不能是纯数字」的要求。
 */
const SHARE_PREFIX = 'YM';

/** 把歌曲 hash 编码成分享码。 */
export function encodeShareCode(hash: string): string {
  return `${SHARE_PREFIX}${hash.toUpperCase()}`;
}

/** 从任意文本里解析出分享码对应的 hash；不是分享码返回 null。 */
export function decodeShareCode(input: string): string | null {
  const match = input.trim().match(/^YM[-#:·\s]?([0-9A-Fa-f]{32})$/i);
  return match ? match[1].toUpperCase() : null;
}

export function isShareCode(query: string): boolean {
  return decodeShareCode(query) !== null;
}

/**
 * 根据 hash 拉取完整歌曲信息（title/artist/封面/时长/albumAudioId），
 * 供分享码识别后直接构建可播放曲目。失败返回 null。
 */
export async function resolveTrackByHash(hash: string): Promise<PlayerTrack | null> {
  await bootstrapMobileApi();
  try {
    const response = await mobileApi.audio({ hash });
    const body = toRecord(response.body);
    const data = toRecord(body.data);
    const record = Object.keys(data).length ? data : body;
    const transParam = toRecord(record.trans_param);

    const title = stripEmTags(pickText(record.audio_name, record.songname, record.song_name));
    if (!title) {
      return null;
    }

    return {
      hash,
      title,
      artist:
        stripEmTags(pickText(record.author_name, record.singername, record.singer_name)) ||
        '未知歌手',
      album: stripEmTags(pickText(record.album_name)) || undefined,
      coverUrl:
        sizedImage(pickText(transParam.union_cover, record.sizable_cover, record.img), 240) ?? null,
      albumAudioId:
        pickStringLike(record.audio_id, record.mixsongid, record.MixSongID) || undefined,
      durationMs: normalizeDurationMs(record.timelength ?? record.duration),
      vip: pickNumber(record.privilege, record.pay_type) >= 10 || undefined,
    };
  } catch {
    return null;
  }
}
