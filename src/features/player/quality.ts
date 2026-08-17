import { normalizeDurationMs } from '@/lib/format';
import { mobileApi } from '@/lib/kugou-api';

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

/** 音质档位，从高到低。 */
export type QualityLevel = 'hires' | 'lossless' | 'hifi' | 'sq' | 'hq' | 'standard';

const QUALITY_RANK: Record<QualityLevel, number> = {
  hires: 6,
  lossless: 5,
  hifi: 4,
  sq: 3,
  hq: 2,
  standard: 1,
};

/** 根据码率与扩展名推断音质档位。 */
export function mapQualityLevel(bitRate: number, ext: string): QualityLevel {
  const normalized = ext.toLowerCase();
  if (normalized.includes('hires') || normalized.includes('dsd') || bitRate >= 1400) {
    return 'hires';
  }
  if (
    normalized.includes('flac') ||
    normalized.includes('ape') ||
    normalized.includes('wav') ||
    bitRate >= 900
  ) {
    return 'lossless';
  }
  if (
    normalized.includes('hifi') ||
    normalized.includes('atmos') ||
    normalized.includes('dolby') ||
    normalized.includes('全景') ||
    normalized.includes('沉浸')
  ) {
    return 'hifi';
  }
  if (bitRate >= 300) {
    return 'hq';
  }
  return 'standard';
}

export function qualityLabelFor(level: QualityLevel): string {
  switch (level) {
    case 'hires':
      return 'Hi-Res';
    case 'lossless':
      return '无损 FLAC';
    case 'hifi':
      return '沉浸声';
    case 'sq':
      return '无损';
    case 'hq':
      return '320k';
    default:
      return '标准';
  }
}

export function compareQuality(a: QualityLevel, b: QualityLevel): number {
  return QUALITY_RANK[a] - QUALITY_RANK[b];
}

export type BestSourceResult = {
  uri: string;
  durationMs: number;
  qualityLevel: QualityLevel;
  qualityLabel: string;
  bitRate: number;
};

function parseBitRate(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function bestUrlFrom(records: UnknownRecord[]): { uri: string; ext: string; bitRate: number } | null {
  // 多个候选（含 backup）里取码率最高者，实现“默认匹配最高音质档位”。
  let best: { uri: string; ext: string; bitRate: number } | null = null;
  for (const record of records) {
    const urls = [
      ...collectUrls(record.url),
      ...collectUrls(record.backup_url),
      ...collectUrls(record.backupUrl),
      ...collectUrls(record.play_url),
    ];
    if (!urls.length) {
      continue;
    }
    const ext = String(record.ext ?? record.format ?? record.type ?? '').toLowerCase();
    const bitRate = parseBitRate(record.bitrate ?? record.bit_rate ?? record.bitRate ?? record.rate);
    const candidate = { uri: urls[0], ext, bitRate };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.bitRate > best.bitRate) {
      best = candidate;
    } else if (candidate.bitRate === best.bitRate && candidate.ext && !best.ext) {
      best = candidate;
    }
  }
  return best;
}

/**
 * 请求歌曲最高可用音质：
 * 1. 优先走 song_url_new（VIP 账号可解锁无损/Hi-Res/沉浸声）；
 * 2. 失败或无地址时回退 song_url（完整音质，不再限制 free_part 试听）。
 */
export async function requestBestSource(track: PlayerTrack): Promise<BestSourceResult> {
  const newResult = await tryNewEndpoint(track);
  if (newResult) {
    return newResult;
  }

  const response = await mobileApi.song_url({
    hash: track.hash,
    album_id: track.albumId ?? 0,
    album_audio_id: track.albumAudioId ?? 0,
  });

  const body = toRecord(response.body);
  const urls = [
    ...collectUrls(body.url),
    ...collectUrls(body.backupUrl),
    ...collectUrls(body.backup_url),
  ];

  if (!urls.length) {
    // 无完整音质时再试一次 free_part 试听，避免连试听都放不了。
    return requestTrialFallback(track);
  }

  const ext = String(body.extName ?? body.ext ?? body.format ?? '').toLowerCase();
  const bitRate = parseBitRate(body.bitRate ?? body.bitrate ?? body.rate);
  const level = mapQualityLevel(bitRate, ext);

  return {
    uri: urls[0],
    durationMs: normalizeDurationMs(body.timeLength) || track.durationMs || 0,
    qualityLevel: level,
    qualityLabel: qualityLabelFor(level),
    bitRate,
  };
}

async function tryNewEndpoint(track: PlayerTrack): Promise<BestSourceResult | null> {
  try {
    const response = await mobileApi.song_url_new({
      hash: track.hash,
      album_id: track.albumId ?? 0,
      album_audio_id: track.albumAudioId ?? 0,
    });
    const body = toRecord(response.body);
    const data = toRecord(body.data);

    const candidates: UnknownRecord[] = [];
    if (body.url || body.backup_url) {
      candidates.push(body);
    }
    if (data.url || data.backup_url) {
      candidates.push(data);
    }
    // 部分返回把候选放在数组里
    if (Array.isArray(data.url)) {
      candidates.push(...(data.url as unknown[]).map((item) => toRecord(item)));
    }

    const best = bestUrlFrom(candidates);
    if (!best) {
      return null;
    }

    const level = mapQualityLevel(best.bitRate, best.ext);
    return {
      uri: best.uri,
      durationMs: normalizeDurationMs(body.timeLength ?? data.timeLength) || track.durationMs || 0,
      qualityLevel: level,
      qualityLabel: qualityLabelFor(level),
      bitRate: best.bitRate,
    };
  } catch {
    return null;
  }
}

async function requestTrialFallback(track: PlayerTrack): Promise<BestSourceResult> {
  const response = await mobileApi.song_url({
    hash: track.hash,
    album_id: track.albumId ?? 0,
    album_audio_id: track.albumAudioId ?? 0,
    free_part: 1,
  });

  const body = toRecord(response.body);
  const urls = [
    ...collectUrls(body.url),
    ...collectUrls(body.backupUrl),
    ...collectUrls(body.backup_url),
  ];

  if (!urls.length) {
    const status = Number(body.status ?? 0);
    throw new Error(status === 3 ? '这首歌暂无版权，无法播放' : '这首歌需要 VIP，暂时无法播放');
  }

  return {
    uri: urls[0],
    durationMs: normalizeDurationMs(body.timeLength) || track.durationMs || 0,
    qualityLevel: 'standard',
    qualityLabel: qualityLabelFor('standard'),
    bitRate: 0,
  };
}
