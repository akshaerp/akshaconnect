'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PORT_METHODS } = require('../services/api/src/integration/portContracts');
const { createIntegrationBoundaryService } = require('../services/api/src/integration/integrationBoundaryService');
const { createVerifiedRequestContextFromClaims } = require('../services/api/src/core/verifiedRequestContext');

function context() {
  return createVerifiedRequestContextFromClaims({
    user_id: 17,
    tenant_id: 'TENANT_A',
    organization_id: 44,
    branch_id: 8,
    session_id: 'session-v6d',
  });
}

function ports(calls) {
  return {
    identityGateway: {
      verifyAccessToken: async () => ({
        user_id: 17,
        tenant_id: 'TENANT_A',
        organization_id: 44,
        branch_id: 8,
        session_id: 'session-v6d',
      }),
      searchUsers: async () => [],
    },
    businessGateway: {
      searchRecords: async (input) => {
        calls.search.push(input);
        return [{ resource_type: input.resource_type, resource_id: '1' }];
      },
      executeAction: async (input) => {
        calls.action.push(input);
        return { accepted: true };
      },
    },
    notificationPort: { enqueuePush: async () => ({ queued: true }) },
  };
}

test('P0-V6D port contract is provider-neutral', () => {
  assert.deepEqual(PORT_METHODS.businessGateway, ['searchRecords', 'executeAction']);
  assert.equal(Object.prototype.hasOwnProperty.call(PORT_METHODS, 'erpGateway'), false);
});

test('generic record search drops provider-specific caller fields', async () => {
  const calls = { search: [], action: [] };
  const service = createIntegrationBoundaryService(ports(calls));
  const result = await service.searchBusinessRecords(context(), {
    resource_type: 'purchase_order',
    query: 'PO-1',
    module_code: 'PUR',
    function_code: 'PUR_PURCHASE_ORDER',
    entity_type: 'PURCHASE_ORDER',
    user_id: 999,
  });

  assert.equal(result[0].resource_type, 'PURCHASE_ORDER');
  assert.deepEqual(calls.search[0], {
    tenant_id: 'TENANT_A',
    organization_id: 44,
    branch_id: 8,
    actor_user_id: 17,
    resource_type: 'PURCHASE_ORDER',
    query: 'PO-1',
    limit: 25,
    correlation_id: null,
  });
});

test('generic action accepts opaque string resource identifiers', async () => {
  const calls = { search: [], action: [] };
  const service = createIntegrationBoundaryService(ports(calls));
  const result = await service.executeBusinessAction(context(), {
    action_attempt_id: 'attempt-v6d',
    event_id: 'event-v6d',
    correlation_id: 'corr-v6d',
    resource_type: 'CUSTOM_TICKET',
    resource_id: 'EXT-ABC-001',
    action: 'close',
  });

  assert.equal(result.accepted, true);
  assert.equal(calls.action[0].resource_id, 'EXT-ABC-001');
  assert.equal(calls.action[0].resource_type, 'CUSTOM_TICKET');
  assert.equal(calls.action[0].action, 'CLOSE');
});

test('generic core files contain no ERP-shaped port or module/function contract', () => {
  const base = path.resolve(__dirname, '..', 'services', 'api', 'src', 'integration');
  const coreBoundaryFiles = ['portContracts.js', 'integrationBoundaryService.js'];
  const forbidden = [
    'erpGateway',
    'lookupErpRecords',
    'executeErpAction',
    'module_code',
    'function_code',
    'entity_type',
    'sec_effective_user_actions',
    'SAL_SALES_ORDER',
  ];

  for (const file of coreBoundaryFiles) {
    const text = fs.readFileSync(path.join(base, file), 'utf8');
    for (const needle of forbidden) {
      assert.equal(text.includes(needle), false, `${file} contains provider-specific core coupling: ${needle}`);
    }
  }
});

test('AkshaERP provider details remain isolated in provider adapter/composition files', () => {
  const base = path.resolve(__dirname, '..', 'services', 'api', 'src', 'integration');
  const adapter = fs.readFileSync(path.join(base, 'erpHttpAdapter.js'), 'utf8');
  const composition = fs.readFileSync(path.join(base, 'configuredPorts.js'), 'utf8');

  assert.equal(adapter.includes('AKSHAERP_CONNECTOR_PATHS'), true);
  assert.equal(composition.includes('BUSINESS_PROVIDERS.AKSHAERP'), true);
  assert.equal(composition.includes('businessGateway'), true);
});
