import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { log } from '@/lib/logger';

/**
 * 原生模块类型契约。实际运行时通过 expo-modules-core 的 requireNativeModule 读取
 * （Expo 原生模块注册在 expo 自己的代理里，不能用 RN 的 NativeModules 访问），
 * 未预构建（如 iOS/Web/尚未 expo prebuild 的开发环境）时整体降级为空实现。
 */
export type SystemAccentColors = {
  primary: string;
  secondary: string;
  tertiary: string;
};

type EventSubscription = { remove: () => void };

type NativeExpoMoekoe = {
  canDrawOverlays: () => boolean;
  requestOverlayPermission: () => void;
  showLyricOverlay: () => void;
  hideLyricOverlay: () => void;
  updateLyricOverlay: (
    text: string,
    subText: string,
    isDark: boolean,
    bgColor?: string | null,
    textColor?: string | null
  ) => void;
  updateMediaSession: (
    title: string,
    artist: string,
    album: string,
    artworkUrl: string | null,
    durationMs: number
  ) => void;
  setPlaybackState: (playing: boolean, positionMs: number, durationMs: number) => void;
  releaseMediaSession: () => void;
  getSystemAccentColors: () => SystemAccentColors | null;
  extractPaletteFromImage: (url: string) => SystemAccentColors | null;
  applyEqualizerPreset: (audioSessionId: number, presetIndex: number) => boolean;
  setEqualizerBands: (audioSessionId: number, gains: number[]) => boolean;
  resetEqualizer: () => void;
  requestSpectrumPermission: () => boolean;
  startSpectrum: (audioSessionId: number) => boolean;
  stopSpectrum: () => void;
  shareAudioFiles: (files: string[]) => boolean;
  saveToPublicDownloads: (sourcePath: string, displayName: string) => string | null;
  installApk: (filePath: string) => boolean;
  addListener: (event: string, listener: (payload?: unknown) => void) => EventSubscription;
  removeListener: (event: string, listener: (payload?: unknown) => void) => void;
};

export type MediaSessionEventName =
  | 'onNext'
  | 'onPrevious'
  | 'onPlayPause'
  | 'onSeekTo'
  | 'onStop';

const isAndroid = Platform.OS === 'android';

/** 打印原生模块可访问性诊断，帮助定位「原生模块=false」的真正原因。 */
export function logNativeDiagnostics() {
  const expoModules = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const names = expoModules ? Object.keys(expoModules) : [];
  const hasMoekoe = names.includes('ExpoMoekoeNative');
  const raw = requireOptionalNativeModule<Record<string, unknown>>('ExpoMoekoeNative');

  log('native', `requireOptionalNativeModule('ExpoMoekoeNative') = ${raw ? '非空' : 'null'}`);
  log('native', `expo.modules 存在=${Boolean(expoModules)} 模块总数=${names.length}`);
  log('native', `expo.modules 含 ExpoMoekoeNative=${hasMoekoe}`);
  log(
    'native',
    `全部模块名: ${names.slice(0, 60).join(', ')}${names.length > 60 ? `…(+${names.length - 60})` : ''}`
  );
  if (raw) {
    log('native', `模块键: ${Object.keys(raw).join(', ')}`);
    log('native', `typeof canDrawOverlays = ${typeof raw.canDrawOverlays}`);
  }
}

function resolveNative(): NativeExpoMoekoe | null {
  if (!isAndroid) {
    return null;
  }

  try {
    const candidate = requireOptionalNativeModule<NativeExpoMoekoe>('ExpoMoekoeNative');
    if (candidate && typeof candidate.canDrawOverlays === 'function') {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

const native = resolveNative();

const noop = () => undefined;

export const moekoeNative: NativeExpoMoekoe = native ?? {
  canDrawOverlays: () => false,
  requestOverlayPermission: noop,
  showLyricOverlay: noop,
  hideLyricOverlay: noop,
  updateLyricOverlay: noop,
  updateMediaSession: noop,
  setPlaybackState: noop,
  releaseMediaSession: noop,
  getSystemAccentColors: () => null,
  extractPaletteFromImage: () => null,
  applyEqualizerPreset: () => false,
  setEqualizerBands: () => false,
  resetEqualizer: noop,
  requestSpectrumPermission: () => false,
  startSpectrum: () => false,
  stopSpectrum: noop,
  shareAudioFiles: () => false,
  saveToPublicDownloads: () => null,
  installApk: () => false,
  addListener: () => ({ remove: noop }),
  removeListener: noop,
};

/** 原生模块是否可用（Android 且已 expo prebuild / EAS 原生构建）。 */
export function isNativeAvailable(): boolean {
  return native !== null;
}

export function addMediaSessionListener(
  event: MediaSessionEventName,
  listener: (payload?: unknown) => void
): () => void {
  if (!native) {
    return noop;
  }

  try {
    const subscription = native.addListener(event, listener);
    return () => subscription.remove();
  } catch {
    return noop;
  }
}

/** 订阅频谱数据（onSpectrumData 事件），返回取消订阅函数。 */
export function addSpectrumListener(listener: (amplitudes: number[]) => void): () => void {
  if (!native) {
    return noop;
  }

  try {
    const subscription = native.addListener('onSpectrumData', (payload) => {
      const amplitudes = (payload as { amplitudes?: number[] } | null)?.amplitudes;
      if (Array.isArray(amplitudes)) {
        listener(amplitudes);
      }
    });
    return () => subscription.remove();
  } catch {
    return noop;
  }
}
