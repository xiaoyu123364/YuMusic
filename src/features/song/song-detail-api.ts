import { pickNumber, pickText, toRecord } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

import { mapQualityLevel, qualityLabelFor } from '@/features/player/quality';
import type { PlayerTrack } from '@/features/player/types';

export type SongDetail = {
  hash: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  /** 流派 / 语言等信息，接口可能缺失。 */
  genre: string;
  language: string;
  /** 最高可用音质文案（Hi-Res / 无损 FLAC / 沉浸声 等）。 */
  qualityLabel: string;
  /** 最高码率（kbps）。 */
  bitRate: number;
  durationMs: number;
  vip: boolean;
  publishDate: string;
};

function detectBestQuality(record: Record<string, unknown>): { level: ReturnType<typeof mapQualityLevel>; bitRate: number } {
  const bitRate = pickNumber(record.bitrate, record.bit_rate, record.rate, record.bitRate);
  const ext = pickText(record.ext, record.format, record.extName);

  if (pickText(record.hash_high, record.hash_hires)) {
    return { level: 'hires', bitRate: bitRate || 0 };
  }
  if (pickText(record.hash_flac, record.hash_flac_new)) {
    return { level: 'lossless', bitRate: bitRate || 0 };
  }
  if (pickText(record.hash_320, record.hash_320_new)) {
    return { level: 'hq', bitRate: bitRate || 320 };
  }
  return { level: mapQualityLevel(bitRate, ext), bitRate };
}

/** 拉取歌曲元数据（专辑、流派、码率等），供歌曲详情弹窗展示。 */
export async function fetchSongDetail(track: PlayerTrack): Promise<SongDetail> {
  await bootstrapMobileApi();

  const fallback: SongDetail = {
    hash: track.hash,
    title: track.title,
    artist: track.artist,
    album: track.album ?? '',
    coverUrl: track.coverUrl,
    genre: '',
    language: '',
    qualityLabel: track.qualityLabel ?? (track.quality === 'sq' ? '无损' : track.quality === 'hq' ? '320k' : ''),
    bitRate: track.bitRate ?? 0,
    durationMs: track.durationMs ?? 0,
    vip: Boolean(track.vip),
    publishDate: '',
  };

  try {
    const response = await mobileApi.audio({ hash: track.hash });
    const body = toRecord(response.body);
    const data = toRecord(body.data);
    const record = Object.keys(data).length ? data : body;
    const transParam = toRecord(record.trans_param);

    const quality = detectBestQuality(record);
    return {
      hash: track.hash,
      title: pickText(record.audio_name, record.songname, track.title),
      artist: pickText(record.author_name, record.singername, track.artist),
      album: pickText(record.album_name, track.album ?? ''),
      coverUrl:
        sizedImage(pickText(transParam.union_cover, record.sizable_cover, record.img), 480) ??
        track.coverUrl,
      genre: pickText(record.genre, record.classify, record.remark),
      language: pickText(record.language, record.lang),
      qualityLabel: qualityLabelFor(quality.level),
      bitRate: quality.bitRate,
      durationMs: normalizeDurationMs(record.timelength ?? record.duration) || track.durationMs || 0,
      vip: pickNumber(record.privilege, record.pay_type) >= 10 || Boolean(track.vip),
      publishDate: pickText(record.publish_time, record.publish_date).split(' ')[0],
    };
  } catch {
    return fallback;
  }
}
