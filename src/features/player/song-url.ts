import { mobileApi } from '@/lib/kugou-api';

import { requestBestSource, type QualityLevel } from './quality';
import type { PlayerTrack } from './types';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  return [];
}

export class PlaybackUnavailableError extends Error {}

export type ResolvedSongSource = {
  uri: string;
  durationMs: number;
  /** 实际解析出的最高音质档位。 */
  qualityLevel?: QualityLevel;
  qualityLabel?: string;
  bitRate?: number;
};

/** 解析歌曲真实播放地址（自动匹配最高音质：Hi-Res / 无损 FLAC / 沉浸声）。 */
export async function resolveSongSource(track: PlayerTrack): Promise<ResolvedSongSource> {
  if (track.source === 'local') {
    if (track.localUri) {
      return { uri: track.localUri, durationMs: track.durationMs ?? 0 };
    }
    throw new PlaybackUnavailableError('本地文件已失效');
  }

  if (track.source === 'cloud') {
    return resolveCloudSource(track);
  }

  return requestBestSource(track);
}

/** 云盘歌曲的播放地址走 mcloud 专用接口。 */
async function resolveCloudSource(track: PlayerTrack): Promise<ResolvedSongSource> {
  const response = await mobileApi.user_cloud_url({
    hash: track.hash,
    album_audio_id: track.albumAudioId ?? 0,
    name: track.title,
  });

  const body = toRecord(response.body);
  const data = toRecord(body.data);
  const urls = collectUrls(data.url);

  if (Number(body.status ?? 0) !== 1 || !urls.length) {
    throw new PlaybackUnavailableError('云盘歌曲暂时无法播放');
  }

  return {
    uri: urls[0],
    durationMs: track.durationMs ?? 0,
  };
}
