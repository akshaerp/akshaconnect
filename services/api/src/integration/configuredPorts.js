'use strict';

const { boundaryError } = require('../core/boundaryError');
const { createAkshaErpHttpAdapters } = require('./erpHttpAdapter');
const { assertPort } = require('./portContracts');
const { createLocalIdentityAdapter } = require('./localIdentityAdapter');
const { createUnavailableBusinessGateway } = require('./unavailableBusinessGateway');
const { resolveProviderConfiguration, isEnabled } = require('./providerConfiguration');
const {
  IDENTITY_PROVIDERS,
  BUSINESS_PROVIDERS,
} = require('../../../../packages/contracts/src/providerModesV1');

function disabledGateway(name, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, async () => {
    throw boundaryError(
      'ERP_INTEGRATION_DISABLED',
      `${name}.${method} is unavailable because the legacy AkshaERP integration flag is disabled`,
      503
    );
  }])));
}

function createAkshaErpAdapters(env, fetchImpl) {
  return createAkshaErpHttpAdapters({
    baseUrl: env.AKSHACONNECT_ERP_BASE_URL,
    apiClientId: env.AKSHACONNECT_ERP_API_CLIENT_ID,
    apiKey: env.AKSHACONNECT_ERP_API_KEY,
    timeoutMs: env.AKSHACONNECT_ERP_TIMEOUT_MS || 5000,
    fetchImpl,
  });
}

function createConfiguredPorts({
  env = process.env,
  fetchImpl = global.fetch,
  notificationPort,
  localIdentityProvider,
} = {}) {
  const pushPort = assertPort('notificationPort', notificationPort);
  const providerConfig = resolveProviderConfiguration(env);

  // Preserve the historical P0-V4 activation flag behavior for installations
  // that have not yet moved to explicit identity/business provider variables.
  if (providerConfig.mode === 'LEGACY_V4' && !providerConfig.erp_required) {
    return Object.freeze({
      identityGateway: disabledGateway('identityGateway', ['verifyAccessToken', 'searchUsers']),
      businessGateway: disabledGateway('businessGateway', ['searchRecords', 'executeAction']),
      notificationPort: pushPort,
      integration_enabled: false,
      identity_provider: 'DISABLED',
      business_provider: BUSINESS_PROVIDERS.NONE,
      standalone_mode: false,
    });
  }

  let akshaErpAdapters = null;
  if (providerConfig.erp_required) {
    akshaErpAdapters = createAkshaErpAdapters(env, fetchImpl);
  }

  let identityGateway;
  if (providerConfig.identity_provider === IDENTITY_PROVIDERS.LOCAL) {
    identityGateway = createLocalIdentityAdapter(localIdentityProvider);
  } else if (providerConfig.identity_provider === IDENTITY_PROVIDERS.AKSHAERP) {
    identityGateway = akshaErpAdapters.identityGateway;
  } else {
    throw boundaryError('IDENTITY_PROVIDER_INVALID', 'Unsupported identity provider');
  }

  const businessGateway = providerConfig.business_provider === BUSINESS_PROVIDERS.AKSHAERP
    ? akshaErpAdapters.businessGateway
    : createUnavailableBusinessGateway();

  return Object.freeze({
    identityGateway,
    businessGateway,
    notificationPort: pushPort,
    integration_enabled: providerConfig.erp_required,
    identity_provider: providerConfig.identity_provider,
    business_provider: providerConfig.business_provider,
    standalone_mode: providerConfig.standalone_mode,
  });
}

module.exports = {
  isEnabled,
  createConfiguredPorts,
};
