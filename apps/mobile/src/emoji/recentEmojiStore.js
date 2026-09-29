import ReactNativeBlobUtil from 'react-native-blob-util';

const STORE_PATH = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/akshaconnect-recent-emojis-v1.json`;
const MAX_RECENT = 8;

export async function loadRecentEmojis() {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(STORE_PATH))) return [];
    const parsed = JSON.parse(await ReactNativeBlobUtil.fs.readFile(STORE_PATH, 'utf8'));
    return Array.isArray(parsed?.emojis) ? parsed.emojis.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export async function saveRecentEmojis(emojis = []) {
  const normalized = [...new Set((emojis || []).filter(Boolean))].slice(0, MAX_RECENT);
  try {
    await ReactNativeBlobUtil.fs.writeFile(
      STORE_PATH,
      JSON.stringify({ version: 1, emojis: normalized }),
      'utf8'
    );
  } catch {}
  return normalized;
}
