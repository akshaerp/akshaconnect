'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  IDENTITY_PROVIDERS,
  BUSINESS_PROVIDERS,
} = require('../packages/contracts/src/providerModesV1');
const { createConfiguredPorts } = require('../services/api/src/integration/configuredPorts');
const { createIntegrationBoundaryService } = require('../services/api/src/integration/integrationBoundaryService');
const { resolveProviderConfiguration } = require('../services/api/src/integration/providerConfiguration');

function notificationPort() {
  return { enqueuePush: async (input) => input };
}

function localIdentityProvider() {
  return {
    async verifyAccessToken(token) {
      assert.equal(token, 'local-token');
      return {
        user_id: 41,
        tenant_id: 'LOCAL_TENANT',
        active_organization_id: 77,
        active_branch_id: 5,
        session_id: 'local-session-1',
      };
    },
    async searchUsers(input) {
      return [{ user_id: 42, display_name: 'Local User', scope: input }];
    },
  };
}

test('provider configuration supports pure standalone LOCAL/NONE mode', () => {
  const config = resolveProviderConfiguration({
    AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
    AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
  });
  assert.equal(config.identity_provider, IDENTITY_PROVIDERS.LOCAL);
  assert.equal(config.business_provider, BUSINESS_PROVIDERS.NONE);
  assert.equal(config.standalone_mode, true);
  assert.equal(config.erp_required, false);
});

test('invalid provider names fail closed', () => {
  assert.throws(() => resolveProviderConfiguration({
    AKSHACONNECT_IDENTITY_PROVIDER: 'MAGIC',
    AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
  }), (error) => {
    assert.equal(error.code, 'IDENTITY_PROVIDER_INVALID');
    return true;
  });

  assert.throws(() => resolveProviderConfiguration({
    AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
    AKSHACONNECT_BUSINESS_PROVIDER: 'UNKNOWN',
  }), (error) => {
    assert.equal(error.code, 'BUSINESS_PROVIDER_INVALID');
    return true;
  });
});

test('LOCAL identity mode fails composition when local identity provider is absent', () => {
  assert.throws(() => createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
      AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
    },
    notificationPort: notificationPort(),
    fetchImpl: async () => { throw new Error('ERP network must not be used'); },
  }), (error) => {
    assert.equal(error.code, 'LOCAL_IDENTITY_PROVIDER_REQUIRED');
    return true;
  });
});

test('LOCAL/NONE standalone composition needs no ERP configuration or network', async () => {
  let networkCalls = 0;
  const ports = createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
      AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
    },
    localIdentityProvider: localIdentityProvider(),
    notificationPort: notificationPort(),
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('unexpected network call');
    },
  });

  assert.equal(ports.identity_provider, 'LOCAL');
  assert.equal(ports.business_provider, 'NONE');
  assert.equal(ports.standalone_mode, true);
  assert.equal(ports.integration_enabled, false);

  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('local-token');
  assert.equal(context.user_id, 41);
  assert.equal(context.tenant_id, 'LOCAL_TENANT');

  const users = await service.searchUsers(context, {
    search_text: 'local',
    tenant_id: 'MALICIOUS_OVERRIDE',
    organization_id: 999,
  });
  assert.equal(users[0].scope.tenant_id, 'LOCAL_TENANT');
  assert.equal(users[0].scope.organization_id, 77);
  assert.equal(networkCalls, 0);
});

test('NONE business provider leaves collaboration identity valid but ERP features unavailable', async () => {
  const ports = createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
      AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
    },
    localIdentityProvider: localIdentityProvider(),
    notificationPort: notificationPort(),
  });
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('local-token');

  await assert.rejects(() => service.lookupErpRecords(context, {
    module_code: 'SALES',
    function_code: 'ORDER',
    entity_type: 'SALES_ORDER',
  }), (error) => {
    assert.equal(error.code, 'ERP_FEATURE_UNAVAILABLE');
    return true;
  });

  await assert.rejects(() => service.executeErpAction(context, {
    action_attempt_id: 'A1',
    event_id: 'E1',
    correlation_id: 'C1',
    entity_type: 'SALES_ORDER',
    entity_id: 1,
    action_code: 'APPROVE',
  }), (error) => {
    assert.equal(error.code, 'ERP_FEATURE_UNAVAILABLE');
    return true;
  });
});

test('AKSHAERP can remain the identity provider while business integration is NONE', async () => {
  let calls = 0;
  const ports = createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'AKSHAERP',
      AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
      AKSHACONNECT_ERP_BASE_URL: 'https://erp.example.test',
      AKSHACONNECT_ERP_API_CLIENT_ID: 'acn-test',
      AKSHACONNECT_ERP_API_KEY: 'test-key',
    },
    notificationPort: notificationPort(),
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(url, /\/api\/v1\/akshaconnect\/identity\/verify$/);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            success: true,
            message: 'ok',
            data: {
              user_id: 7,
              tenant_id: 'ERP_TENANT',
              active_organization_id: 11,
              session_id: 'erp-session',
            },
            requestId: 'req-1',
          });
        },
      };
    },
  });

  assert.equal(ports.identity_provider, 'AKSHAERP');
  assert.equal(ports.business_provider, 'NONE');
  assert.equal(ports.standalone_mode, false);
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('erp-user-token');
  assert.equal(context.user_id, 7);
  assert.equal(calls, 1);
});

test('AKSHAERP provider requires the P0-V6B Integration Gateway connector configuration', () => {
  assert.throws(() => createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'AKSHAERP',
      AKSHACONNECT_BUSINESS_PROVIDER: 'AKSHAERP',
    },
    notificationPort: notificationPort(),
  }), (error) => {
    assert.ok([
      'ERP_INTEGRATION_BASE_URL_REQUIRED',
      'ERP_INTEGRATION_API_CLIENT_ID_REQUIRED',
      'ERP_INTEGRATION_API_KEY_REQUIRED',
    ].includes(error.code));
    return true;
  });
});

test('P0-V5 provider architecture contains no direct ERP implementation or table coupling', () => {
  const root = path.resolve(__dirname, '..', 'services', 'api', 'src', 'integration');
  const files = [
    'configuredPorts.js',
    'localIdentityAdapter.js',
    'providerConfiguration.js',
    'unavailableErpGateway.js',
  ];
  const forbidden = [
    'AccessManagement/', 'CommunicationHub/', 'ApplicationManagement/',
    'am_users', 'am_user_org', 'hr_employees',
  ];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const needle of forbidden) {
      assert.equal(text.includes(needle), false, `${file} contains forbidden coupling: ${needle}`);
    }
  }
});
