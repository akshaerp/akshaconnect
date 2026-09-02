'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { createRequestHandler, VERSION } = require('../services/api/src/app');

async function withServer(run, options = {}) {
  const server = http.createServer(createRequestHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /health returns Phase 1 P1-V6 service status', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'akshaconnect-api');
    assert.equal(payload.phase, '1');
    assert.equal(payload.checkpoint, 'P1-V6');
    assert.equal(payload.version, VERSION);
    assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));
  });
});

test('unknown API path fails closed with 404', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/not-a-route`);
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.status, 'not_found');
  });
});
