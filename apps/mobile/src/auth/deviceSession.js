import * as Keychain from 'react-native-keychain';

const SERVICE =
  'com.akshaerp.akshaconnect.mobile-device-session';

const USERNAME =
  'akshaconnect-device-session';


function normalizeServerUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}


function normalizeCredential(
  value
) {
  const serverUrl =
    normalizeServerUrl(
      value?.serverUrl
    );

  const deviceToken =
    String(
      value?.deviceToken || ''
    ).trim();

  if (
    !serverUrl ||
    !deviceToken ||
    !/^https?:\/\//i.test(serverUrl)
  ) {
    return null;
  }

  return {
    version: 1,
    serverUrl,
    deviceToken,
  };
}


export async function saveDeviceSession({
  serverUrl,
  deviceToken,
}) {
  const value =
    normalizeCredential({
      serverUrl,
      deviceToken,
    });

  if (!value) {
    throw new Error(
      'Mobile device credential is invalid'
    );
  }

  await Keychain.setGenericPassword(
    USERNAME,
    JSON.stringify(value),
    {
      service: SERVICE,
    }
  );

  return value;
}


export async function loadDeviceSession() {
  const stored =
    await Keychain.getGenericPassword({
      service: SERVICE,
    });

  if (!stored) {
    return null;
  }

  try {
    const value =
      normalizeCredential(
        JSON.parse(
          stored.password
        )
      );

    if (!value) {
      await clearDeviceSession();
      return null;
    }

    return value;
  } catch {
    await clearDeviceSession();
    return null;
  }
}


export async function clearDeviceSession() {
  await Keychain.resetGenericPassword({
    service: SERVICE,
  });
}


export const DEVICE_SESSION_SERVICE =
  SERVICE;
