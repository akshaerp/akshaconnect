'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createVerifiedRequestContextFromClaims,
  assertVerifiedRequestContext,
} = require('../services/api/src/core/verifiedRequestContext');
const { createIntegrationBoundaryService } = require('../services/api/src/integration');

function makePorts(overrides = {}) {
  const calls = {
    verify: [],
    searchUsers: [],
    searchRecords: [],
    action: [],
    push: [],
  };

  const ports = {
    identityGateway: {
      async verifyAccessToken(token) {
        calls.verify.push(token);
        return {
          user_id: 2,
          tenant_id: 'VISALAANDHRA',
          current_organization_id: 11,
          current_branch_id: 16,
          session_id: 'session-abc',
        };
      },
      async searchUsers(input) {
        calls.searchUsers.push(input);
        return [];
      },
    },
    businessGateway: {
      async searchRecords(input) {
        calls.searchRecords.push(input);
        return [];
      },
      async executeAction(input) {
        calls.action.push(input);
        return { accepted: true };
      },
    },
    notificationPort: {
      async enqueuePush(input) {
        calls.push.push(input);
        return { queued: true };
      },
    },
    ...overrides,
  };

  return { ports, calls };
}

test('verified request context requires identity, tenant, organization and session claims', () => {
  assert.throws(
    () => createVerifiedRequestContextFromClaims({ user_id: 2, tenant_id: 'T', organization_id: 11 }),
    (error) => error.code === 'IDENTITY_SESSION_REQUIRED'
  );

  const context = createVerifiedRequestContextFromClaims({
    user_id: 2,
    tenant_id: 'T',
    organization_id: 11,
    branch_id: 16,
    session_id: 'S',
  });

  assert.deepEqual(context, {
    user_id: 2,
    tenant_id: 'T',
    active_organization_id: 11,
    active_branch_id: 16,
    session_id: 'S',
  });
  assert.equal(Object.isFrozen(context), true);
});

test('a fabricated plain object is not accepted as a verified request context', () => {
  assert.throws(
    () => assertVerifiedRequestContext({
      user_id: 2,
      tenant_id: 'VISALAANDHRA',
      active_organization_id: 11,
      session_id: 'fake',
    }),
    (error) => error.code === 'VERIFIED_CONTEXT_REQUIRED'
  );
});

test('integration boundary fails closed when a required port is absent', () => {
  const { ports } = makePorts();
  delete ports.businessGateway;
  assert.throws(
    () => createIntegrationBoundaryService(ports),
    (error) => error.code === 'BOUNDARY_PORT_REQUIRED'
  );
});

test('authentication builds context only from identity-gateway verified claims', async () => {
  const { ports, calls } = makePorts();
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('verified-token');

  assert.equal(calls.verify.length, 1);
  assert.equal(calls.verify[0], 'verified-token');
  assert.equal(context.user_id, 2);
  assert.equal(context.tenant_id, 'VISALAANDHRA');
  assert.equal(context.active_organization_id, 11);
  assert.equal(context.active_branch_id, 16);
});

test('user search cannot override trusted tenant or organization context', async () => {
  const { ports, calls } = makePorts();
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('verified-token');

  await service.searchUsers(context, {
    tenant_id: 'EVIL',
    organization_id: 999,
    search_text: 'hari',
    limit: 9999,
  });

  assert.deepEqual(calls.searchUsers[0], {
    tenant_id: 'VISALAANDHRA',
    organization_id: 11,
    requester_user_id: 2,
    search_text: 'hari',
    limit: 100,
  });
});

test('business record search uses trusted actor/scope and generic resource type', async () => {
  const { ports, calls } = makePorts();
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('verified-token');

  await service.searchBusinessRecords(context, {
    tenant_id: 'EVIL',
    organization_id: 999,
    branch_id: 999,
    actor_user_id: 999,
    resource_type: 'sales_order',
    module_code: 'SHOULD_NOT_CROSS',
    function_code: 'SHOULD_NOT_CROSS',
    query: 'SO-1',
  });

  assert.deepEqual(calls.searchRecords[0], {
    tenant_id: 'VISALAANDHRA',
    organization_id: 11,
    branch_id: 16,
    actor_user_id: 2,
    resource_type: 'SALES_ORDER',
    query: 'SO-1',
    limit: 25,
    correlation_id: null,
  });
});

test('business action binds actor/scope to verified context and uses generic identifiers', async () => {
  const { ports, calls } = makePorts();
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('verified-token');

  const result = await service.executeBusinessAction(context, {
    tenant_id: 'EVIL',
    organization_id: 999,
    actor_user_id: 999,
    action_attempt_id: 'attempt-1',
    event_id: 'event-1',
    correlation_id: 'corr-1',
    resource_type: 'sales_order',
    resource_id: 1045,
    action: 'approve',
    client_context: { surface: 'MOBILE' },
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(calls.action[0], {
    contract_version: '1.0',
    action_attempt_id: 'attempt-1',
    event_id: 'event-1',
    correlation_id: 'corr-1',
    tenant_id: 'VISALAANDHRA',
    organization_id: 11,
    branch_id: 16,
    actor_user_id: 2,
    resource_type: 'SALES_ORDER',
    resource_id: '1045',
    action: 'APPROVE',
    client_context: { surface: 'MOBILE' },
  });
});

test('push requests route through the AkshaConnect notification port', async () => {
  const { ports, calls } = makePorts();
  const service = createIntegrationBoundaryService(ports);
  const context = await service.authenticate('verified-token');

  await service.enqueuePush(context, {
    recipient_user_id: 8,
    notification_type: 'MESSAGE',
    title: 'New message',
    body: 'Open AkshaConnect',
    correlation_id: 'corr-push',
  });

  assert.equal(calls.push.length, 1);
  assert.equal(calls.push[0].tenant_id, 'VISALAANDHRA');
  assert.equal(calls.push[0].organization_id, 11);
  assert.equal(calls.push[0].requested_by_user_id, 2);
  assert.equal(calls.push[0].recipient_user_id, 8);
});

test('generic core boundary does not import provider implementation modules or tables', () => {
  const root = path.join(__dirname, '..', 'services', 'api', 'src');
  const files = [
    path.join(root, 'core', 'verifiedRequestContext.js'),
    path.join(root, 'integration', 'portContracts.js'),
    path.join(root, 'integration', 'integrationBoundaryService.js'),
  ];
  const forbidden = [
    'AccessManagement',
    'ApplicationManagement/PushNotifications',
    'CommunicationHub',
    'amUserModel',
    'am_user_org',
    'am_users',
    'hr_employees',
  ];

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    forbidden.forEach((needle) => {
      assert.equal(content.includes(needle), false, `${path.basename(file)} must not contain ${needle}`);
    });
  });
});
