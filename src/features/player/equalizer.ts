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
  { id: 'mastering', label: '母带处理', description: '强化声场开阔度与细节动态，带母带级响度处理' },
  { id: 'clarity', label: '通透饱满', description: '澎湃低频下潜 + 通透空气感，全频段饱满' },
  { id: 'hakimi', label: '哈基米曲线', description: '哈曼目标曲线调音，甜美高频延伸' },
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
  mastering: [30, 150, 63, 100, 250, 0, 630, 100, 1000, 150, 1600, 200, 2500, 200, 4000, 150, 8000, 150, 12500, 100],
  // 通透饱满：低频 30/63Hz +4dB，中频 300Hz 0dB，高频 2k/4k +3.5dB、8k +2dB
  clarity: [30, 300, 40, 450, 63, 500, 80, 450, 250, 100, 800, 300, 2000, 350, 4000, 400, 8000, 250, 12500, 100],
  // 哈基米曲线：超低频 25Hz +3.5dB、50Hz +1.7dB，中频 160-800Hz -1dB，高频 2.5k/8k +1.2dB
  hakimi: [20, 400, 25, 400, 50, 200, 160, -100, 400, -100, 800, -50, 2500, 100, 8000, 150, 12500, 400, 16000, 450, 20000, 500],
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
