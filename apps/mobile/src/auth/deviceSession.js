import * as Keychain from 'react-native-keychain';

const SERVICE =
  'com.akshaerp.akshaconnect.mobile-device-session';
const USERNAME = 'akshaconnect-device-session';
const VERSION = 2;

function normalizeServerUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function accountIdFor(value = {}) {
  return clean(value.accountId) || [
    clean(value.tenantId || value.tenant_id || 'local'),
    clean(value.identityId || value.identity_id || 'identity'),
    clean(value.serverUrl),
  ].join('|');
}

function normalizeAccount(value = {}) {
  const serverUrl = normalizeServerUrl(value.serverUrl);
  const deviceToken = clean(value.deviceToken);
  if (!serverUrl || !deviceToken || !/^https?:\/\//i.test(serverUrl)) return null;

  const account = {
    accountId: accountIdFor({ ...value, serverUrl }),
    serverUrl,
    deviceToken,
    tenantId: clean(value.tenantId || value.tenant_id) || null,
    tenantCode: clean(value.tenantCode || value.tenant_code) || null,
    tenantName: clean(value.tenantName || value.tenant_name) || null,
    identityId: clean(value.identityId || value.identity_id) || null,
    displayName: clean(value.displayName || value.display_name) || null,
    primaryEmail: clean(value.primaryEmail || value.primary_email) || null,
    providerCode: clean(value.providerCode || value.provider_code || 'LOCAL').toUpperCase(),
    workspaceId: clean(value.workspaceId || value.workspace_id) || null,
    workspaceName: clean(value.workspaceName || value.workspace_name) || null,
    lastUsedAt: clean(value.lastUsedAt) || new Date().toISOString(),
  };

  return account;
}

function normalizeRegistry(value) {
  if (!value || typeof value !== 'object') {
    return { version: VERSION, activeAccountId: null, accounts: [] };
  }

  // Backward compatibility with the V1 single-credential payload.
  if (value.version === 1 && value.serverUrl && value.deviceToken) {
    const account = normalizeAccount(value);
    return {
      version: VERSION,
      activeAccountId: account?.accountId || null,
      accounts: account ? [account] : [],
    };
  }

  const accounts = (Array.isArray(value.accounts) ? value.accounts : [])
    .map(normalizeAccount)
    .filter(Boolean);

  const accountIds = new Set(accounts.map((item) => item.accountId));
  const requestedActive = clean(value.activeAccountId);

  return {
    version: VERSION,
    activeAccountId:
      requestedActive && accountIds.has(requestedActive)
        ? requestedActive
        : accounts[0]?.accountId || null,
    accounts,
  };
}

async function writeRegistry(registry) {
  await Keychain.setGenericPassword(
    USERNAME,
    JSON.stringify(normalizeRegistry(registry)),
    { service: SERVICE }
  );
  return normalizeRegistry(registry);
}

export async function loadDeviceAccounts() {
  const stored = await Keychain.getGenericPassword({ service: SERVICE });
  if (!stored) return normalizeRegistry(null);

  try {
    const registry = normalizeRegistry(JSON.parse(stored.password));
    if (!registry.accounts.length) {
      await Keychain.resetGenericPassword({ service: SERVICE });
      return normalizeRegistry(null);
    }
    return registry;
  } catch {
    await Keychain.resetGenericPassword({ service: SERVICE });
    return normalizeRegistry(null);
  }
}

export async function saveDeviceAccount(value) {
  const account = normalizeAccount(value);
  if (!account) throw new Error('Mobile device credential is invalid');

  const registry = await loadDeviceAccounts();
  const accounts = registry.accounts.filter(
    (item) => item.accountId !== account.accountId
  );
  accounts.unshift(account);

  const saved = await writeRegistry({
    version: VERSION,
    activeAccountId: account.accountId,
    accounts,
  });

  return saved.accounts.find((item) => item.accountId === account.accountId);
}

export async function setActiveDeviceAccount(accountId) {
  const registry = await loadDeviceAccounts();
  const id = clean(accountId);
  if (!registry.accounts.some((item) => item.accountId === id)) {
    throw new Error('Saved AkshaConnect account was not found');
  }

  const accounts = registry.accounts.map((item) => (
    item.accountId === id
      ? { ...item, lastUsedAt: new Date().toISOString() }
      : item
  ));

  await writeRegistry({
    ...registry,
    activeAccountId: id,
    accounts,
  });

  return accounts.find((item) => item.accountId === id);
}

export async function removeDeviceAccount(accountId) {
  const registry = await loadDeviceAccounts();
  const id = clean(accountId);
  const accounts = registry.accounts.filter((item) => item.accountId !== id);
  const activeAccountId =
    registry.activeAccountId === id
      ? accounts[0]?.accountId || null
      : registry.activeAccountId;

  if (!accounts.length) {
    await Keychain.resetGenericPassword({ service: SERVICE });
    return normalizeRegistry(null);
  }

  return writeRegistry({ version: VERSION, activeAccountId, accounts });
}

export async function clearAllDeviceAccounts() {
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function loadActiveDeviceAccount() {
  const registry = await loadDeviceAccounts();
  return registry.accounts.find(
    (item) => item.accountId === registry.activeAccountId
  ) || registry.accounts[0] || null;
}

// Compatibility wrappers retained for older tests/callers.
export async function saveDeviceSession({ serverUrl, deviceToken }) {
  return saveDeviceAccount({ serverUrl, deviceToken, providerCode: 'LOCAL' });
}

export async function loadDeviceSession() {
  return loadActiveDeviceAccount();
}

export async function clearDeviceSession() {
  const account = await loadActiveDeviceAccount();
  if (!account) return;
  await removeDeviceAccount(account.accountId);
}

export const DEVICE_SESSION_SERVICE = SERVICE;
