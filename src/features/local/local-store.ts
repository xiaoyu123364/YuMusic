import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import type { PlayerTrack } from '@/features/player/types';

export type LocalTrack = {
  hash: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string | null;
  durationMs?: number;
  publicUri: string;
  downloadedAt: number;
};

const KEY = 'yumusic.local.music';
const MAX = 500;

let tracks: LocalTrack[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function persist() {
  void SecureStore.setItemAsync(KEY, JSON.stringify(tracks)).catch(() => undefined);
}

export function hydrateLocalMusic(): void {
  if (hydrated) {
    return;
  }
  hydrated = true;
  void SecureStore.getItemAsync(KEY)
    .then((raw) => {
      if (raw) {
        try {
          tracks = JSON.parse(raw) as LocalTrack[];
        } catch {
          tracks = [];
        }
      }
      notify();
    })
    .catch(() => undefined);
}

export function getLocalTracks(): LocalTrack[] {
  return tracks;
}

export function addLocalTrack(track: PlayerTrack, publicUri: string): void {
  tracks = [
    {
      hash: track.hash,
      title: track.title,
      artist: track.artist || '未知歌手',
      album: track.album,
      coverUrl: track.coverUrl,
      durationMs: track.durationMs,
      publicUri,
      downloadedAt: Date.now(),
    },
    ...tracks.filter((item) => item.hash !== track.hash),
  ].slice(0, MAX);
  persist();
  notify();
}

export function removeLocalTrack(hash: string): void {
  tracks = tracks.filter((item) => item.hash !== hash);
  persist();
  notify();
}

export function useLocalTracks(): LocalTrack[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocalTracks,
    () => []
  );
}
