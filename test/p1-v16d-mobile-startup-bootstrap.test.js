'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-D API exposes one authenticated mobile workspace bootstrap request', () => {
  const app = read('services/api/src/app.js');
  assert.match(app, /\/api\/v1\/mobile\/workspace-bootstrap/);
  assert.match(app, /verifyAccessToken\([\s\S]*bearerToken\(req\)/);
  assert.match(app, /Promise\.all\(\[/);
  assert.match(app, /collaborationService\.listChannels\(claims\)/);
  assert.match(app, /collaborationService\.listDirectMessages\(claims\)/);
  assert.match(app, /messagingService\.listUnreadCounts\(claims\)/);
});

test('V16-D mobile startup coalesces channel DM and unread requests', () => {
  const client = read('apps/mobile/src/api/client.js');
  assert.match(client, /workspaceBootstrapInflight/);
  assert.match(client, /loadWorkspaceBootstrap/);
  assert.match(client, /\/api\/v1\/mobile\/workspace-bootstrap/);
  assert.match(client, /bootstrap\.channels/);
  assert.match(client, /bootstrap\.direct_messages/);
  assert.match(client, /bootstrap\.unread_counts/);
});

test('V16-D bootstrap has rolling-deployment fallback to legacy endpoints', () => {
  const client = read('apps/mobile/src/api/client.js');
  assert.match(client, /Number\(error\?\.status\) === 404/);
  assert.match(client, /\/api\/v1\/channels/);
  assert.match(client, /\/api\/v1\/direct-messages/);
  assert.match(client, /\/api\/v1\/unread-counts/);
});

test('V16-D remains source-only and requires no database migration', () => {
  const sqlDir = path.join(root, 'database/migrations/post_v1/acn');
  const names = fs.readdirSync(sqlDir);
  assert.equal(names.some((name) => /v16_d/i.test(name)), false);
});
