import { NativeModules, Platform } from 'react-native';

export async function getInstalledAppVersion() {
  if (Platform.OS !== 'android') {
    return {
      platform: String(Platform.OS || '').toUpperCase(),
      versionCode: 0,
      versionName: '',
    };
  }

  const module = NativeModules.AkshaConnectAppInfo;
  if (!module?.getVersion) {
    return {
      platform: 'ANDROID',
      versionCode: 0,
      versionName: '',
    };
  }

  const result = await module.getVersion();

  return {
    platform: 'ANDROID',
    versionCode: Number(result?.versionCode || 0),
    versionName: String(result?.versionName || '').trim(),
  };
}
