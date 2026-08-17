import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT_ID, isAccentPresetId, type AccentPresetId } from '@/constants/accents';

import { readStoredAppearance, writeStoredAppearance } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export type SettingsState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  accentId: AccentPresetId;
  /** 桌面歌词悬浮窗（Android 需 SYSTEM_ALERT_WINDOW 权限）。 */
  desktopLyrics: boolean;
  /** Monet 动态取色：从主色派生带色调的柔和表面色。 */
  monetColor: boolean;
  /** 顶栏/底栏 BlurView 毛玻璃。 */
  barBlur: boolean;
  /** 悬浮卡片式底栏（与屏幕边缘保持距离、大圆角）。 */
  floatingBar: boolean;
  /** 液态玻璃边缘高光。 */
  liquidGlass: boolean;
  /** 系统预测性返回手势（Android 15+）。 */
  predictiveBack: boolean;
  /** 桌面歌词悬浮窗背景色（#RRGGBB，null=默认深色）。 */
  lyricOverlayBg: string | null;
  /** 桌面歌词悬浮窗字体色（#RRGGBB，null=跟随明暗，固定不随动态取色）。 */
  lyricOverlayText: string | null;
};

const INITIAL_SETTINGS_STATE: SettingsState = {
  hydrated: false,
  themeMode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  desktopLyrics: false,
  monetColor: true,
  barBlur: true,
  floatingBar: true,
  liquidGlass: true,
  predictiveBack: true,
  lyricOverlayBg: null,
  lyricOverlayText: null,
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const settingsStore = createStore(INITIAL_SETTINGS_STATE);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

let hydrationPromise: Promise<void> | null = null;

/** 在根布局模块作用域调用一次;UI 由 hydrated 门控,不存在与用户操作的竞态。 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readStoredAppearance();
      settingsStore.setState({
        themeMode: stored && isThemeMode(stored.themeMode) ? stored.themeMode : 'system',
        accentId: stored && isAccentPresetId(stored.accentId) ? stored.accentId : DEFAULT_ACCENT_ID,
        desktopLyrics: stored?.desktopLyrics === true,
        monetColor: stored?.monetColor !== false,
        barBlur: stored?.barBlur !== false,
        floatingBar: stored?.floatingBar !== false,
        liquidGlass: stored?.liquidGlass !== false,
        predictiveBack: stored?.predictiveBack !== false,
        lyricOverlayBg: typeof stored?.lyricOverlayBg === 'string' ? stored.lyricOverlayBg : null,
        lyricOverlayText: typeof stored?.lyricOverlayText === 'string' ? stored.lyricOverlayText : null,
        hydrated: true,
      });
    })().catch(() => {
      settingsStore.setState({ hydrated: true });
    });
  }
  return hydrationPromise;
}

function persist() {
  const { themeMode, accentId, desktopLyrics, monetColor, barBlur, floatingBar, liquidGlass, predictiveBack, lyricOverlayBg, lyricOverlayText } =
    settingsStore.getState();
  void writeStoredAppearance({
    themeMode,
    accentId,
    desktopLyrics,
    monetColor,
    barBlur,
    floatingBar,
    liquidGlass,
    predictiveBack,
    lyricOverlayBg,
    lyricOverlayText,
  });
}

export const settingsActions = {
  setThemeMode(themeMode: ThemeMode) {
    settingsStore.setState({ themeMode });
    persist();
  },
  setAccentId(accentId: AccentPresetId) {
    settingsStore.setState({ accentId });
    persist();
  },
  setDesktopLyrics(desktopLyrics: boolean) {
    settingsStore.setState({ desktopLyrics });
    persist();
  },
  setMonetColor(monetColor: boolean) {
    settingsStore.setState({ monetColor });
    persist();
  },
  setBarBlur(barBlur: boolean) {
    settingsStore.setState({ barBlur });
    persist();
  },
  setFloatingBar(floatingBar: boolean) {
    settingsStore.setState({ floatingBar });
    persist();
  },
  setLiquidGlass(liquidGlass: boolean) {
    settingsStore.setState({ liquidGlass });
    persist();
  },
  setPredictiveBack(predictiveBack: boolean) {
    settingsStore.setState({ predictiveBack });
    persist();
  },
  setLyricOverlayBg(color: string | null) {
    settingsStore.setState({ lyricOverlayBg: color });
    persist();
  },
  setLyricOverlayText(color: string | null) {
    settingsStore.setState({ lyricOverlayText: color });
    persist();
  },
};

export function useSettings(): SettingsState {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getState,
    settingsStore.getInitialState
  );
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().themeMode,
    () => INITIAL_SETTINGS_STATE.themeMode
  );
}

export function useAccentId(): AccentPresetId {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().accentId,
    () => INITIAL_SETTINGS_STATE.accentId
  );
}

export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().hydrated,
    () => INITIAL_SETTINGS_STATE.hydrated
  );
}

export function useMonetColor(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().monetColor,
    () => INITIAL_SETTINGS_STATE.monetColor
  );
}

export function useBarBlur(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().barBlur,
    () => INITIAL_SETTINGS_STATE.barBlur
  );
}

export function useFloatingBar(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().floatingBar,
    () => INITIAL_SETTINGS_STATE.floatingBar
  );
}

export function useLiquidGlass(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().liquidGlass,
    () => INITIAL_SETTINGS_STATE.liquidGlass
  );
}
