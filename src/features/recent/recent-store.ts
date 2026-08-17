import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import type { PlayerTrack } from '@/features/player/types';

export type RecentTrack = PlayerTrack & { playedAt: number };

const KEY = 'yumusic.recent.plays';
const MAX = 100;

let tracks: RecentTrack[] = [];
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

export function hydrateRecentPlays(): void {
  if (hydrated) {
    return;
  }
  hydrated = true;
  void SecureStore.getItemAsync(KEY)
    .then((raw) => {
      if (raw) {
        try {
          tracks = JSON.parse(raw) as RecentTrack[];
        } catch {
          tracks = [];
        }
      }
      notify();
    })
    .catch(() => undefined);
}

export function getRecentPlays(): RecentTrack[] {
  return tracks;
}

/** 记录一次播放（按 hash 去重，最多保留 MAX 条）。 */
export function recordRecentPlay(track: PlayerTrack): void {
  if (!track.hash) {
    return;
  }
  tracks = [
    { ...track, playedAt: Date.now() },
    ...tracks.filter((item) => item.hash !== track.hash),
  ].slice(0, MAX);
  persist();
  notify();
}

export function clearRecentPlays(): void {
  tracks = [];
  persist();
  notify();
}

export function useRecentPlays(): RecentTrack[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getRecentPlays,
    () => []
  );
}
