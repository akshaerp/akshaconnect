'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ERP_INTEGRATION_PATHS,
} = require('../packages/contracts/src/integrationTransportV1');
const { signServiceRequest } = require('../services/api/src/integration/serviceToServiceSigner');
const { createErpHttpAdapters } = require('../services/api/src/integration/erpHttpAdapter');
const { createConfiguredPorts } = require('../services/api/src/integration/configuredPorts');

function notificationPort() {
  return { enqueuePush: async (input) => input };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return payload === null ? '' : JSON.stringify(payload); },
  };
}

function success(data) {
  return { success: true, message: 'ok', data, requestId: 'req-1' };
}

test('ERP integration is disabled by default and fails closed', async () => {
  const ports = createConfiguredPorts({ env: {}, notificationPort: notificationPort() });
  assert.equal(ports.integration_enabled, false);
  await assert.rejects(() => ports.identityGateway.verifyAccessToken('token'), (error) => {
    assert.equal(error.code, 'ERP_INTEGRATION_DISABLED');
    return true;
  });
});

test('enabled ERP integration requires a base URL and Integration Gateway credentials', () => {
  assert.throws(() => createConfiguredPorts({
    env: { AKSHACONNECT_ERP_INTEGRATION_ENABLED: 'Y' },
    notificationPort: notificationPort(),
    fetchImpl: async () => jsonResponse(200, success({})),
  }), (error) => [
    'ERP_INTEGRATION_BASE_URL_REQUIRED',
    'ERP_INTEGRATION_API_CLIENT_ID_REQUIRED',
    'ERP_INTEGRATION_API_KEY_REQUIRED',
  ].includes(error.code));
});

test('historical P0-V4 service request signing helper remains deterministic', () => {
  const headers = signServiceRequest({
    method: 'POST',
    path: '/api/v1/example',
    bodyText: '{"a":1}',
    sharedSecret: 'test-secret',
    serviceId: 'akshaconnect',
    contractVersion: '1.0',
    timestamp: '2026-08-31T15:00:00.000Z',
    nonce: 'nonce-1',
  });
  assert.equal(headers['x-aksha-service-id'], 'akshaconnect');
  assert.equal(headers['x-aksha-contract-version'], '1.0');
  assert.match(headers['x-aksha-signature'], /^[a-f0-9]{64}$/);
  assert.notEqual(headers['x-aksha-signature'], 'test-secret');
});

test('identity verification uses the versioned ERP path, IGW credentials and bearer token', async () => {
  let request;
  const adapters = createErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'akshaconnect-test',
    apiKey: 'test-api-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(200, success({
        user_id: 7,
        tenant_id: 'TENANT',
        active_organization_id: 11,
        session_id: 's1',
      }));
    },
  });
  const result = await adapters.identityGateway.verifyAccessToken('user-token');
  assert.equal(result.user_id, 7);
  assert.equal(request.url, `https://erp.example.test${ERP_INTEGRATION_PATHS.VERIFY_ACCESS_TOKEN}`);
  assert.equal(request.options.headers.authorization, 'Bearer user-token');
  assert.equal(request.options.headers['x-api-client-id'], 'akshaconnect-test');
  assert.equal(request.options.headers['x-api-key'], 'test-api-key');
  assert.equal(request.options.headers['x-aksha-signature'], undefined);
});

test('user search, record lookup and action execution use versioned transport paths', async () => {
  const seen = [];
  const adapters = createErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'akshaconnect-test',
    apiKey: 'test-api-key',
    fetchImpl: async (url, options) => {
      seen.push({ url, body: JSON.parse(options.body) });
      return jsonResponse(200, success({ ok: true }));
    },
  });
  await adapters.identityGateway.searchUsers({ organization_id: 11 });
  await adapters.erpGateway.lookupRecords({ organization_id: 11 });
  await adapters.erpGateway.executeAction({ organization_id: 11, action_code: 'APPROVE' });
  assert.deepEqual(seen.map((x) => new URL(x.url).pathname), [
    ERP_INTEGRATION_PATHS.SEARCH_USERS,
    ERP_INTEGRATION_PATHS.LOOKUP_RECORDS,
    ERP_INTEGRATION_PATHS.EXECUTE_ACTION,
  ]);
});

test('remote non-success status fails closed without trusting remote text', async () => {
  const adapters = createErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'akshaconnect-test',
    apiKey: 'test-api-key',
    fetchImpl: async () => jsonResponse(403, {
      success: false,
      errorCode: 'IGW_SCOPE_DENIED',
      message: 'detail must not escape',
      requestId: 'req-denied',
    }),
  });
  await assert.rejects(() => adapters.erpGateway.lookupRecords({}), (error) => {
    assert.equal(error.code, 'ERP_INTEGRATION_HTTP_ERROR');
    assert.equal(error.remote_status, 403);
    assert.equal(error.remote_code, 'IGW_SCOPE_DENIED');
    assert.equal(error.remote_request_id, 'req-denied');
    assert.equal(error.message, 'AkshaERP integration returned HTTP 403');
    return true;
  });
});

test('transport network errors become a generic unavailable boundary error', async () => {
  const adapters = createErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'akshaconnect-test',
    apiKey: 'test-api-key',
    fetchImpl: async () => { throw new Error('socket detail should not escape'); },
  });
  await assert.rejects(() => adapters.erpGateway.executeAction({}), (error) => {
    assert.equal(error.code, 'ERP_INTEGRATION_UNAVAILABLE');
    assert.equal(error.message, 'AkshaERP integration request failed');
    return true;
  });
});

test('P0-V4/V6B transport code contains no direct ERP module or table coupling', () => {
  const root = path.resolve(__dirname, '..', 'services', 'api', 'src', 'integration');
  const files = fs.readdirSync(root).filter((name) => name.endsWith('.js'));
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
