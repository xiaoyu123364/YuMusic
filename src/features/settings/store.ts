import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT_ID, isAccentPresetId, type AccentPresetId } from '@/constants/accents';

import { readStoredAppearance, writeStoredAppearance } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

/** 全局设计风格：苹果液态玻璃 / 安卓 Material Expressive 毛玻璃 / 自定义混搭。 */
export type DesignStyle = 'apple' | 'material' | 'custom';

/** 控件材质：原生液态玻璃 / BlurView 毛玻璃 / 素面半透明卡片。 */
export type GlassKind = 'liquid' | 'frost' | 'plain';

/** 滑杆样式：M3E 波浪「毛毛虫」/ 平滑胶囊。 */
export type SliderLook = 'wavy' | 'smooth';

export type SettingsState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  accentId: AccentPresetId;
  /** 设计风格（苹果 / 安卓17 / 自定义）。 */
  designStyle: DesignStyle;
  /** 自定义：按钮/开关/选项卡等控件材质。 */
  customControlGlass: GlassKind;
  /** 自定义：顶栏/底栏/迷你播放器材质。 */
  customBarGlass: GlassKind;
  /** 自定义：进度条/音量条样式。 */
  customSliderLook: SliderLook;
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
  designStyle: 'apple',
  customControlGlass: 'liquid',
  customBarGlass: 'liquid',
  customSliderLook: 'smooth',
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

function isDesignStyle(value: unknown): value is DesignStyle {
  return value === 'apple' || value === 'material' || value === 'custom';
}

function isGlassKind(value: unknown): value is GlassKind {
  return value === 'liquid' || value === 'frost' || value === 'plain';
}

function isSliderLook(value: unknown): value is SliderLook {
  return value === 'wavy' || value === 'smooth';
}

let hydrationPromise: Promise<void> | null = null;

/** 在根布局模块作用域调用一次;UI 由 hydrated 门控,不存在与用户操作的竞态。 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readStoredAppearance();
      // Apple Music 改版一次性迁移：旧默认「动态」主色 → 「Apple红」。
      // 用户之后仍可在设置里自由切回动态取色。
      const migratedAccent =
        stored && stored.accentId === 'dynamic' ? 'apple' : undefined;
      settingsStore.setState({
        themeMode: stored && isThemeMode(stored.themeMode) ? stored.themeMode : 'system',
        accentId: migratedAccent
          ? 'apple'
          : stored && isAccentPresetId(stored.accentId)
            ? stored.accentId
            : DEFAULT_ACCENT_ID,
        designStyle: stored && isDesignStyle(stored.designStyle) ? stored.designStyle : 'apple',
        customControlGlass:
          stored && isGlassKind(stored.customControlGlass) ? stored.customControlGlass : 'liquid',
        customBarGlass:
          stored && isGlassKind(stored.customBarGlass) ? stored.customBarGlass : 'liquid',
        customSliderLook:
          stored && isSliderLook(stored.customSliderLook) ? stored.customSliderLook : 'smooth',
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
  const s = settingsStore.getState();
  void writeStoredAppearance({
    themeMode: s.themeMode,
    accentId: s.accentId,
    designStyle: s.designStyle,
    customControlGlass: s.customControlGlass,
    customBarGlass: s.customBarGlass,
    customSliderLook: s.customSliderLook,
    desktopLyrics: s.desktopLyrics,
    monetColor: s.monetColor,
    barBlur: s.barBlur,
    floatingBar: s.floatingBar,
    liquidGlass: s.liquidGlass,
    predictiveBack: s.predictiveBack,
    lyricOverlayBg: s.lyricOverlayBg,
    lyricOverlayText: s.lyricOverlayText,
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
  setDesignStyle(designStyle: DesignStyle) {
    settingsStore.setState({ designStyle });
    persist();
  },
  setCustomControlGlass(customControlGlass: GlassKind) {
    settingsStore.setState({ customControlGlass });
    persist();
  },
  setCustomBarGlass(customBarGlass: GlassKind) {
    settingsStore.setState({ customBarGlass });
    persist();
  },
  setCustomSliderLook(customSliderLook: SliderLook) {
    settingsStore.setState({ customSliderLook });
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

export function useDesignStyle(): DesignStyle {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().designStyle,
    () => INITIAL_SETTINGS_STATE.designStyle
  );
}

export function useCustomControlGlass(): GlassKind {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().customControlGlass,
    () => INITIAL_SETTINGS_STATE.customControlGlass
  );
}

export function useCustomBarGlass(): GlassKind {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().customBarGlass,
    () => INITIAL_SETTINGS_STATE.customBarGlass
  );
}

export function useCustomSliderLook(): SliderLook {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().customSliderLook,
    () => INITIAL_SETTINGS_STATE.customSliderLook
  );
}
