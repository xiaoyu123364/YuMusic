import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { moekoeNative } from '@/features/android/native';
import { getAudioSessionId } from '@/features/player/store';
import { log } from '@/lib/logger';

export type EqualizerPresetId = 'flat' | 'mastering' | 'clarity' | 'hakimi';

export type EqualizerPreset = {
  id: EqualizerPresetId;
  label: string;
  description: string;
};

/** 4 种核心声音风格预设，与原生 Equalizer band 增益一一对应。 */
export const EQUALIZER_PRESETS: readonly EqualizerPreset[] = [
  { id: 'flat', label: '原声', description: '纯净原始输出，不加任何增益调音' },
  { id: 'mastering', label: '母带处理', description: '强化声场开阔度与细节动态' },
  { id: 'clarity', label: '通透饱满', description: '饱满下潜 + 通透空气感' },
  { id: 'hakimi', label: '哈基米曲线', description: '削减齿音杂质，甜美通透' },
];

export function isEqualizerPresetId(value: unknown): value is EqualizerPresetId {
  return (
    value === 'flat' || value === 'mastering' || value === 'clarity' || value === 'hakimi'
  );
}

const STORAGE_KEY = 'moekoe.equalizer.preset';

let presetId: EqualizerPresetId = 'flat';
let hydrated = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(next: EqualizerPresetId) {
  if (presetId === next) {
    return;
  }
  presetId = next;
  for (const listener of listeners) {
    listener();
  }
}

export function useEqualizerPreset(): EqualizerPresetId {
  return useSyncExternalStore(
    subscribe,
    () => presetId,
    () => 'flat'
  );
}

let hydrationPromise: Promise<void> | null = null;

/** 启动时水合已保存的均衡器预设并应用到原生。 */
export function hydrateEqualizer(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (isEqualizerPresetId(stored)) {
          presetId = stored;
          applyToNative(stored);
        }
      } catch {
        // 忽略读取失败
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydrationPromise;
}

// 各预设的频段增益（扁平数组 [freqHz, millibel, ...]），与原生 Equalizer band 插值一一对应。
// +1dB = 100mB。
const PRESET_GAINS: Record<EqualizerPresetId, number[]> = {
  flat: [],
  // 母带处理：低频 30Hz +2dB，中频平直，高频 1.5k/2.5k +1.5dB、4k/8k +1dB
  mastering: [30, 200, 100, 0, 500, 0, 1500, 150, 2500, 150, 4000, 100, 8000, 100],
  // 通透饱满：低频 30/63Hz +4dB，中频 300Hz 0dB，高频 2k/4k +3.5dB、8k +2dB
  clarity: [30, 400, 63, 400, 300, 0, 2000, 350, 4000, 350, 8000, 200],
  // 哈基米曲线：超低频 25Hz +3.5dB、50Hz +1.7dB，中频 160-800Hz -1dB，高频 2.5k/8k +1.2dB
  hakimi: [25, 350, 50, 170, 160, -100, 400, -100, 800, -100, 2500, 120, 8000, 120],
};

function applyToNative(id: EqualizerPresetId) {
  const sessionId = getAudioSessionId();
  const gains = PRESET_GAINS[id];
  log('eq', `应用预设 ${id} sessionId=${sessionId} gains=[${gains.join(',')}]`);
  if (gains.length === 0) {
    const ok = moekoeNative.setEqualizerBands(sessionId, []);
    log('eq', `原声 setEqualizerBands(空) -> ${ok}`);
    moekoeNative.resetEqualizer();
    return;
  }
  const ok = moekoeNative.setEqualizerBands(sessionId, gains);
  log('eq', `setEqualizerBands -> ${ok}`);
}

export function setEqualizerPreset(id: EqualizerPresetId) {
  setState(id);
  void SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => undefined);
  applyToNative(id);
}

export function isEqualizerHydrated(): boolean {
  return hydrated;
}
