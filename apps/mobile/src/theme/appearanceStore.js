import { useColorScheme } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';

const STORE_PATH =
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/akshaconnect-appearance-v1.json`;

export const APP_TEXT_SIZE_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'standard',
    label: 'Standard',
    scale: 1,
    description: 'Original compact text size',
  }),
  Object.freeze({
    key: 'comfortable',
    label: 'Comfortable',
    scale: 1.06,
    description: 'Slightly larger for everyday reading',
  }),
  Object.freeze({
    key: 'large',
    label: 'Large',
    scale: 1.18,
    description: 'Larger text for easier reading',
  }),
]);

export const APP_THEME_OPTIONS = Object.freeze([
  Object.freeze({ key: 'system', label: 'System' }),
  Object.freeze({ key: 'light', label: 'Light' }),
  Object.freeze({ key: 'dark', label: 'Dark' }),
]);

export const LIGHT_PALETTE = Object.freeze({
  mode: 'light',
  shell: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  input: '#FAFBFD',
  border: '#DCE4EE',
  textPrimary: '#0E2455',
  textSecondary: '#526782',
  textMuted: '#8090A6',
  ownBubble: '#EAF4FF',
  ownBubbleBorder: '#C9E1FA',
  otherBubble: '#FFFFFF',
  otherBubbleBorder: '#DCE5ED',
  ownMessageText: '#18324A',
  otherMessageText: '#243B53',
  ownTimestamp: '#315D82',
  timestamp: '#667B91',
  divider: '#DCE4EE',
  searchSurface: '#FFFFFF',
  overlay: 'rgba(12,32,61,0.38)',
});

export const DARK_PALETTE = Object.freeze({
  mode: 'dark',
  shell: '#0E1726',
  surface: '#152234',
  surfaceRaised: '#1B2B40',
  input: '#122033',
  border: '#2B4058',
  textPrimary: '#F3F7FB',
  textSecondary: '#C2D0DF',
  textMuted: '#92A6BA',
  ownBubble: '#123D63',
  ownBubbleBorder: '#1E5B8E',
  otherBubble: '#1B2B40',
  otherBubbleBorder: '#2B4058',
  ownMessageText: '#F1F7FD',
  otherMessageText: '#EDF3F9',
  ownTimestamp: '#C6DDF1',
  timestamp: '#A9B9C8',
  divider: '#2B4058',
  searchSurface: '#152234',
  overlay: 'rgba(0,0,0,0.58)',
});

const DEFAULT_TEXT_SIZE_MODE = 'comfortable';
const DEFAULT_THEME_MODE = 'system';

let currentTextMode = DEFAULT_TEXT_SIZE_MODE;
let currentThemeMode = DEFAULT_THEME_MODE;
let hydrated = false;
let hydrationPromise = null;
const listeners = new Set();

function optionForTextMode(mode) {
  return (
    APP_TEXT_SIZE_OPTIONS.find((option) => option.key === mode) ||
    APP_TEXT_SIZE_OPTIONS.find((option) => option.key === DEFAULT_TEXT_SIZE_MODE)
  );
}

function normalizeThemeMode(mode) {
  return APP_THEME_OPTIONS.some((option) => option.key === mode)
    ? mode
    : DEFAULT_THEME_MODE;
}

function snapshot() {
  const option = optionForTextMode(currentTextMode);
  return Object.freeze({
    textSizeMode: option.key,
    textScale: option.scale,
    themeMode: currentThemeMode,
  });
}

function emit() {
  const next = snapshot();
  for (const listener of listeners) {
    try {
      listener(next);
    } catch {}
  }
}

async function persistAppearance() {
  try {
    await ReactNativeBlobUtil.fs.writeFile(
      STORE_PATH,
      JSON.stringify({
        version: 2,
        text_size_mode: currentTextMode,
        theme_mode: currentThemeMode,
      }),
      'utf8'
    );
  } catch {}
}

export async function loadAppAppearance() {
  if (hydrated) return snapshot();
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      if (await ReactNativeBlobUtil.fs.exists(STORE_PATH)) {
        const raw = await ReactNativeBlobUtil.fs.readFile(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const requestedText = String(parsed?.text_size_mode || '').trim();
        const requestedTheme = String(parsed?.theme_mode || '').trim();

        if (APP_TEXT_SIZE_OPTIONS.some((option) => option.key === requestedText)) {
          currentTextMode = requestedText;
        }
        currentThemeMode = normalizeThemeMode(requestedTheme);
      }
    } catch {
      currentTextMode = DEFAULT_TEXT_SIZE_MODE;
      currentThemeMode = DEFAULT_THEME_MODE;
    } finally {
      hydrated = true;
      hydrationPromise = null;
    }

    emit();
    return snapshot();
  })();

  return hydrationPromise;
}

export async function setAppTextSizeMode(mode) {
  const option = optionForTextMode(mode);
  currentTextMode = option.key;
  hydrated = true;
  emit();
  await persistAppearance();
  return snapshot();
}

export async function setAppThemeMode(mode) {
  currentThemeMode = normalizeThemeMode(mode);
  hydrated = true;
  emit();
  await persistAppearance();
  return snapshot();
}

export function subscribeAppAppearance(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppAppearance() {
  const systemScheme = useColorScheme();
  const [value, setValue] = useState(snapshot());

  useEffect(() => {
    const unsubscribe = subscribeAppAppearance(setValue);
    loadAppAppearance().catch(() => {});
    return unsubscribe;
  }, []);

  return useMemo(() => {
    const resolvedTheme =
      value.themeMode === 'system'
        ? (systemScheme === 'dark' ? 'dark' : 'light')
        : value.themeMode;

    return {
      ...value,
      resolvedTheme,
      darkMode: resolvedTheme === 'dark',
      palette: resolvedTheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE,
    };
  }, [systemScheme, value]);
}

export function scaleTextMetric(value, scale) {
  const numeric = Number(value);
  const multiplier = Number(scale);

  if (!Number.isFinite(numeric)) return value;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return numeric;

  return Math.round(numeric * multiplier * 10) / 10;
}
