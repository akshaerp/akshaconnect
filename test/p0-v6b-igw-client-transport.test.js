'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHttpJsonTransport } = require('../services/api/src/integration/httpJsonTransport');
const { createAkshaErpHttpAdapters } = require('../services/api/src/integration/erpHttpAdapter');
const { createConfiguredPorts } = require('../services/api/src/integration/configuredPorts');

function notificationPort() {
  return { enqueuePush: async (input) => input };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return payload === null ? '' : JSON.stringify(payload); },
  };
}

test('shared-secret-only AkshaERP configuration no longer satisfies the runtime connector', () => {
  assert.throws(() => createConfiguredPorts({
    env: {
      AKSHACONNECT_IDENTITY_PROVIDER: 'AKSHAERP',
      AKSHACONNECT_BUSINESS_PROVIDER: 'NONE',
      AKSHACONNECT_ERP_BASE_URL: 'https://erp.example.test',
      AKSHACONNECT_ERP_SHARED_SECRET: 'legacy-secret',
    },
    notificationPort: notificationPort(),
    fetchImpl: async () => response(200, { success: true, data: {} }),
  }), (error) => {
    assert.equal(error.code, 'ERP_INTEGRATION_API_CLIENT_ID_REQUIRED');
    return true;
  });
});

test('IGW transport unwraps only the standard success envelope', async () => {
  const transport = createHttpJsonTransport({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'acn',
    apiKey: 'key',
    fetchImpl: async () => response(200, {
      success: true,
      message: 'ok',
      data: { value: 9 },
      requestId: 'req-9',
    }),
  });
  assert.deepEqual(await transport.request({ path: '/api/v1/test' }), { value: 9 });
});

test('malformed 2xx Integration Gateway envelopes fail closed', async () => {
  for (const payload of [
    null,
    {},
    { success: true },
    { success: false, data: {} },
    [],
  ]) {
    const transport = createHttpJsonTransport({
      baseUrl: 'https://erp.example.test',
      apiClientId: 'acn',
      apiKey: 'key',
      fetchImpl: async () => response(200, payload),
    });
    await assert.rejects(() => transport.request({ path: '/api/v1/test' }), (error) => {
      assert.equal(error.code, 'ERP_INTEGRATION_RESPONSE_INVALID');
      return true;
    });
  }
});

test('runtime transport sends IGW credentials and never emits P0-V4 HMAC headers', async () => {
  let options;
  const adapters = createAkshaErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'acn-client',
    apiKey: 'acn-key',
    fetchImpl: async (_, requestOptions) => {
      options = requestOptions;
      return response(200, { success: true, data: [] });
    },
  });
  await adapters.identityGateway.searchUsers({ tenant_id: 'T1', organization_id: 11 });
  assert.equal(options.headers['x-api-client-id'], 'acn-client');
  assert.equal(options.headers['x-api-key'], 'acn-key');
  assert.equal(options.headers['x-aksha-signature'], undefined);
  assert.equal(options.headers['x-aksha-service-id'], undefined);
  assert.equal(options.headers['x-aksha-content-sha256'], undefined);
});

test('user Bearer token is sent only by identity verification', async () => {
  const seen = [];
  const adapters = createAkshaErpHttpAdapters({
    baseUrl: 'https://erp.example.test',
    apiClientId: 'acn-client',
    apiKey: 'acn-key',
    fetchImpl: async (url, options) => {
      seen.push({ path: new URL(url).pathname, authorization: options.headers.authorization || null });
      return response(200, {
        success: true,
        data: new URL(url).pathname.endsWith('/identity/verify')
          ? { user_id: 7, tenant_id: 'T', active_organization_id: 11, session_id: 's' }
          : [],
      });
    },
  });
  await adapters.identityGateway.verifyAccessToken('erp-user-token');
  await adapters.identityGateway.searchUsers({ tenant_id: 'T', organization_id: 11, requester_user_id: 7 });
  await adapters.businessGateway.searchRecords({ tenant_id: 'T', organization_id: 11, actor_user_id: 7, resource_type: 'SALES_ORDER' });
  assert.equal(seen[0].authorization, 'Bearer erp-user-token');
  assert.equal(seen[1].authorization, null);
  assert.equal(seen[2].authorization, null);
});

test('P0-V6B/V6D runtime connector has no active HMAC/shared-secret dependency', () => {
  const integrationRoot = path.resolve(__dirname, '..', 'services', 'api', 'src', 'integration');
  for (const file of ['httpJsonTransport.js', 'erpHttpAdapter.js', 'configuredPorts.js']) {
    const text = fs.readFileSync(path.join(integrationRoot, file), 'utf8');
    assert.equal(text.includes("require('./serviceToServiceSigner')"), false, `${file} must not import HMAC signer`);
    assert.equal(text.includes('AKSHACONNECT_ERP_SHARED_SECRET'), false, `${file} must not consume shared-secret config`);
    assert.equal(text.includes('x-aksha-signature'), false, `${file} must not emit HMAC signature headers`);
  }
});
