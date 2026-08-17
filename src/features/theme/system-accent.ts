import { useSyncExternalStore } from 'react';

import { moekoeNative, type SystemAccentColors } from '@/features/android/native';

let cached: SystemAccentColors | null | undefined;
let coverAccent: SystemAccentColors | null = null;
/** 过渡中实际显示的颜色（从旧色平滑插值到新色）。 */
let smoothAccent: SystemAccentColors | null = null;
let accentVersion = 0;
let transitionFrame = 0;
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

/* ---------- 颜色插值（丝滑过渡） ---------- */

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function lerpHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  );
}

function lerpAccent(
  from: SystemAccentColors,
  to: SystemAccentColors,
  t: number
): SystemAccentColors {
  return {
    primary: lerpHex(from.primary, to.primary, t),
    secondary: lerpHex(from.secondary, to.secondary, t),
    tertiary: lerpHex(from.tertiary, to.tertiary, t),
  };
}

/** easeInOutCubic：先快后慢，模拟颜色「从旧色发散到新色」的视觉。 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 从当前色平滑过渡到目标色，约 480ms，逐帧触发重渲染。 */
function transitionTo(target: SystemAccentColors): void {
  const base = smoothAccent ?? coverAccent ?? cached;
  if (!base || base.primary === target.primary) {
    smoothAccent = target;
    notify();
    return;
  }
  const from: SystemAccentColors = base;

  cancelAnimationFrame(transitionFrame);
  const start = Date.now();
  const duration = 480;

  function step() {
    const t = Math.min(1, (Date.now() - start) / duration);
    smoothAccent = lerpAccent(from, target, easeInOutCubic(t));
    notify();
    if (t < 1) {
      transitionFrame = requestAnimationFrame(step);
    } else {
      smoothAccent = target;
    }
  }

  transitionFrame = requestAnimationFrame(step);
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
      transitionTo(colors);
    }
  } catch {
    // 忽略提取失败
  }
}

/** 动态主色优先级：封面 Palette > 系统壁纸色；返回过渡中的平滑色。 */
export function getDynamicAccent(): SystemAccentColors | null {
  loadSystemAccent();
  return smoothAccent ?? coverAccent ?? cached ?? null;
}
