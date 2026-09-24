'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTrustedErpBridgeHttpHandler,
} = require('../services/api/src/auth/trustedErpBridgeHttpHandler');

async function withServer(handler, fn) {
  const server = http.createServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function bridgeHandler(overrides = {}) {
  return createTrustedErpBridgeHttpHandler({
    identityProvider: 'AKSHAERP',
    allowedOrigins: 'https://app.akshaerp.com',
    ssoService: {
      async loginFromErpToken(token) {
        assert.equal(token, 'erp-token');
        return {
          access_token: 'connect-token',
          token_type: 'Bearer',
          expires_at: '2026-09-25T00:00:00.000Z',
          session_id: 'session-1',
          identity: {
            identity_id: 'identity-1',
            display_name: 'Admin MFG',
            identity_provider: 'AKSHAERP',
          },
          workspace: {
            workspace_id: 'workspace-1',
            workspace_code: 'AKSHAERP',
            workspace_name: 'AkshaERP Solutions Private Limited',
          },
          membership: {
            workspace_member_id: 'member-1',
            member_role: 'OWNER',
          },
        };
      },
    },
    identityService: {
      async verifyAccessToken(token) {
        assert.equal(token, 'connect-token');
        return {
          workspace_id: 'workspace-1',
          workspace_member_id: 'member-1',
          identity_id: 'identity-1',
        };
      },
    },
    messagingService: {
      async listUnreadCounts() {
        return {
          unread_counts: [
            { conversation_id: 'c1', unread_count: 2 },
            { conversation_id: 'c2', unread_count: 3 },
          ],
        };
      },
    },
    ...overrides,
  });
}

test('launcher session exchange is CORS-limited to the configured ERP origin', async () => {
  await withServer(bridgeHandler(), async (baseUrl) => {
    const body = new URLSearchParams({
      erp_access_token: 'erp-token',
    });

    const response = await fetch(
      `${baseUrl}/api/v1/auth/akshaerp/launcher/session`,
      {
        method: 'POST',
        headers: {
          origin: 'https://app.akshaerp.com',
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://app.akshaerp.com'
    );

    const payload = await response.json();
    assert.equal(payload.access_token, 'connect-token');
    assert.equal(
      payload.membership.workspace_member_id,
      'member-1'
    );
  });
});

test('launcher unread endpoint returns total and conversation counts', async () => {
  await withServer(bridgeHandler(), async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/launcher/unread-counts`,
      {
        headers: {
          origin: 'https://app.akshaerp.com',
          authorization: 'Bearer connect-token',
          accept: 'application/json',
        },
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.total_unread, 5);
    assert.equal(payload.unread_counts.length, 2);
  });
});

test('launcher bridge rejects an untrusted browser origin', async () => {
  await withServer(bridgeHandler(), async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/launcher/unread-counts`,
      {
        headers: {
          origin: 'https://evil.example',
          authorization: 'Bearer connect-token',
        },
      }
    );

    assert.equal(response.status, 403);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null
    );
  });
});

test('launcher bridge answers preflight only for an allowed origin', async () => {
  await withServer(bridgeHandler(), async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/launcher/unread-counts`,
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.akshaerp.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      }
    );

    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://app.akshaerp.com'
    );
    assert.match(
      response.headers.get('access-control-allow-headers'),
      /authorization/
    );
  });
});
