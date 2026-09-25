import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.akshaerp.akshaconnect.pending-mobile-auth';
const USERNAME = 'akshaconnect-pending-mobile-auth';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export async function savePendingMobileAuth(value = {}) {
  const payload = {
    requestId: clean(value.requestId),
    state: clean(value.state),
    exchangeSecret: clean(value.exchangeSecret),
    serverUrl: clean(value.serverUrl).replace(/\/+$/, ''),
    tenantId: clean(value.tenantId),
    email: clean(value.email).toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  if (
    !payload.requestId ||
    !payload.state ||
    !payload.exchangeSecret ||
    !payload.serverUrl
  ) {
    throw new Error('Mobile sign-in state is incomplete');
  }

  await Keychain.setGenericPassword(
    USERNAME,
    JSON.stringify(payload),
    { service: SERVICE }
  );

  return payload;
}

export async function loadPendingMobileAuth() {
  const stored = await Keychain.getGenericPassword({ service: SERVICE });
  if (!stored) return null;

  try {
    const value = JSON.parse(stored.password);
    return value && typeof value === 'object' ? value : null;
  } catch {
    await clearPendingMobileAuth();
    return null;
  }
}

export async function clearPendingMobileAuth() {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
