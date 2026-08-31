'use strict';

const { boundaryError } = require('../core/boundaryError');
const { createErpHttpAdapters } = require('./erpHttpAdapter');
const { assertPort } = require('./portContracts');

function isEnabled(value) {
  return ['Y', 'YES', 'TRUE', '1', 'ON'].includes(String(value || '').trim().toUpperCase());
}

function disabledGateway(name, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, async () => {
    throw boundaryError(
      'ERP_INTEGRATION_DISABLED',
      `${name}.${method} is unavailable because AkshaERP integration is disabled`,
      503
    );
  }])));
}

function createConfiguredPorts({ env = process.env, fetchImpl = global.fetch, notificationPort } = {}) {
  const pushPort = assertPort('notificationPort', notificationPort);
  if (!isEnabled(env.AKSHACONNECT_ERP_INTEGRATION_ENABLED)) {
    return Object.freeze({
      identityGateway: disabledGateway('identityGateway', ['verifyAccessToken', 'searchUsers']),
      erpGateway: disabledGateway('erpGateway', ['lookupRecords', 'executeAction']),
      notificationPort: pushPort,
      integration_enabled: false,
    });
  }

  const adapters = createErpHttpAdapters({
    baseUrl: env.AKSHACONNECT_ERP_BASE_URL,
    sharedSecret: env.AKSHACONNECT_ERP_SHARED_SECRET,
    serviceId: env.AKSHACONNECT_SERVICE_ID || 'akshaconnect',
    contractVersion: env.AKSHACONNECT_ERP_CONTRACT_VERSION || '1.0',
    timeoutMs: env.AKSHACONNECT_ERP_TIMEOUT_MS || 5000,
    fetchImpl,
  });

  return Object.freeze({
    ...adapters,
    notificationPort: pushPort,
    integration_enabled: true,
  });
}

module.exports = {
  isEnabled,
  createConfiguredPorts,
};
