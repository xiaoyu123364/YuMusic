import { useSyncExternalStore } from 'react';

import { moekoeNative, type SystemAccentColors } from '@/features/android/native';

let cached: SystemAccentColors | null | undefined;
let coverAccent: SystemAccentColors | null = null;
let accentVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  accentVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅动态主色版本号，封面 Palette 提取完成时触发重渲染。 */
export function useAccentVersion(): number {
  return useSyncExternalStore(subscribe, () => accentVersion, () => 0);
}

/** 读取并缓存 Android 12+ 系统壁纸动态主色（同步，幂等）。 */
export function loadSystemAccent(): void {
  if (cached !== undefined) {
    return;
  }
  try {
    cached = moekoeNative.getSystemAccentColors();
  } catch {
    cached = null;
  }
}

export function getSystemAccent(): SystemAccentColors | null {
  loadSystemAccent();
  return cached ?? null;
}

/** 提取当前播放歌曲专辑封面的 Palette 主色，作为动态取色的实时来源。 */
export function extractCoverAccent(url: string | null | undefined): void {
  if (!url) {
    return;
  }
  try {
    const colors = moekoeNative.extractPaletteFromImage(url);
    if (colors) {
      coverAccent = colors;
      notify();
    }
  } catch {
    // 忽略提取失败
  }
}

/** 动态主色优先级：封面 Palette > 系统壁纸色。 */
export function getDynamicAccent(): SystemAccentColors | null {
  loadSystemAccent();
  return coverAccent ?? cached ?? null;
}
