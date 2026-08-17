import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'moekoe.settings.appearance';

export type StoredAppearance = {
  themeMode?: unknown;
  accentId?: unknown;
  desktopLyrics?: unknown;
  monetColor?: unknown;
  barBlur?: unknown;
  floatingBar?: unknown;
  liquidGlass?: unknown;
  predictiveBack?: unknown;
  lyricOverlayBg?: unknown;
  lyricOverlayText?: unknown;
};

export async function readStoredAppearance(): Promise<StoredAppearance | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredAppearance) : null;
  } catch {
    return null;
  }
}

export async function writeStoredAppearance(value: {
  themeMode: string;
  accentId: string;
  desktopLyrics: boolean;
  monetColor: boolean;
  barBlur: boolean;
  floatingBar: boolean;
  liquidGlass: boolean;
  predictiveBack: boolean;
  lyricOverlayBg: string | null;
  lyricOverlayText: string | null;
}): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep runtime state usable.
  }
}
