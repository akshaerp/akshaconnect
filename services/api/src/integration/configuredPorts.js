'use strict';

const { boundaryError } = require('../core/boundaryError');
const { createErpHttpAdapters } = require('./erpHttpAdapter');
const { assertPort } = require('./portContracts');
const { createLocalIdentityAdapter } = require('./localIdentityAdapter');
const { createUnavailableErpGateway } = require('./unavailableErpGateway');
const { resolveProviderConfiguration, isEnabled } = require('./providerConfiguration');
const {
  IDENTITY_PROVIDERS,
  BUSINESS_PROVIDERS,
} = require('../../../../packages/contracts/src/providerModesV1');

function disabledGateway(name, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, async () => {
    throw boundaryError(
      'ERP_INTEGRATION_DISABLED',
      `${name}.${method} is unavailable because AkshaERP integration is disabled`,
      503
    );
  }])));
}

function createErpAdapters(env, fetchImpl) {
  return createErpHttpAdapters({
    baseUrl: env.AKSHACONNECT_ERP_BASE_URL,
    sharedSecret: env.AKSHACONNECT_ERP_SHARED_SECRET,
    serviceId: env.AKSHACONNECT_SERVICE_ID || 'akshaconnect',
    contractVersion: env.AKSHACONNECT_ERP_CONTRACT_VERSION || '1.0',
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

  // Preserve the exact P0-V4 disabled semantics for installations that have
  // not yet opted into provider configuration.
  if (providerConfig.mode === 'LEGACY_V4' && !providerConfig.erp_required) {
    return Object.freeze({
      identityGateway: disabledGateway('identityGateway', ['verifyAccessToken', 'searchUsers']),
      erpGateway: disabledGateway('erpGateway', ['lookupRecords', 'executeAction']),
      notificationPort: pushPort,
      integration_enabled: false,
      identity_provider: 'DISABLED',
      business_provider: BUSINESS_PROVIDERS.NONE,
      standalone_mode: false,
    });
  }

  let erpAdapters = null;
  if (providerConfig.erp_required) erpAdapters = createErpAdapters(env, fetchImpl);

  let identityGateway;
  if (providerConfig.identity_provider === IDENTITY_PROVIDERS.LOCAL) {
    identityGateway = createLocalIdentityAdapter(localIdentityProvider);
  } else if (providerConfig.identity_provider === IDENTITY_PROVIDERS.AKSHAERP) {
    identityGateway = erpAdapters.identityGateway;
  } else {
    throw boundaryError('IDENTITY_PROVIDER_INVALID', 'Unsupported identity provider');
  }

  const erpGateway = providerConfig.business_provider === BUSINESS_PROVIDERS.AKSHAERP
    ? erpAdapters.erpGateway
    : createUnavailableErpGateway();

  return Object.freeze({
    identityGateway,
    erpGateway,
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
