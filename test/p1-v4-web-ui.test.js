'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

test('P1-V4 preserves the existing Bearer token parser for authenticated APIs', () => {
  const source = read('services/api/src/app.js');
  assert.ok(source.includes('const match = /^Bearer\\s+(.+)$/i.exec(value);'));
});

test('P1-V4 promotes apps/web into the root workspace with start/build scripts', () => {
  const pkg = json('package.json');
  assert.ok(pkg.workspaces.includes('apps/*'));
  assert.match(pkg.scripts['start:web'], /akshaconnect-web/);
  assert.match(pkg.scripts['build:web'], /akshaconnect-web/);
  assert.match(pkg.scripts.verify, /build:web/);
});

test('standalone web package pins React and Vite dependencies', () => {
  const pkg = json('apps/web/package.json');
  assert.equal(pkg.name, '@akshaerp/akshaconnect-web');
  assert.equal(pkg.version, '0.10.0-phase1');
  assert.equal(pkg.dependencies.react, '18.3.1');
  assert.equal(pkg.dependencies['react-dom'], '18.3.1');
  assert.equal(pkg.devDependencies.vite, '6.4.3');
});

test('web API client consumes only P1-V2/P1-V3 AkshaConnect endpoints', () => {
  const source = read('apps/web/src/api.js');
  for (const endpoint of [
    '/api/v1/auth/local/login',
    '/api/v1/auth/session',
    '/api/v1/auth/logout',
    '/api/v1/workspace/members',
    '/api/v1/channels',
    '/api/v1/direct-messages',
  ]) {
    assert.ok(source.includes(endpoint), `missing ${endpoint}`);
  }
  assert.doesNotMatch(source, /\/api\/v1\/messages/i);
});

test('browser session token uses sessionStorage and never persists a password', () => {
  const source = read('apps/web/src/sessionStore.js');
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /sessionStorage\.removeItem/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /password/i);
});

test('minimum UI exposes login, channels, DMs, conversation shell and disabled composer', () => {
  const source = read('apps/web/src/App.jsx');
  assert.match(source, /Sign in to your team/);
  assert.match(source, /Channels/);
  assert.match(source, /Direct messages/);
  assert.match(source, /ConversationPlaceholder/);
  assert.match(source, /aria-label="Message composer"/);
  assert.match(source, /<textarea\s+disabled/);
  assert.match(source, /Messaging activates in P1-V5/);
});

test('web client does not implement message-send behavior before P1-V5', () => {
  const app = read('apps/web/src/App.jsx');
  const api = read('apps/web/src/api.js');
  assert.doesNotMatch(app, /sendMessage|createMessage|postMessage/);
  assert.doesNotMatch(api, /sendMessage|createMessage|postMessage|\/messages/);
});

test('Vite development server uses a same-origin proxy to the local API', () => {
  const source = read('apps/web/vite.config.js');
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /port:\s*4173/);
  assert.match(source, /http:\/\/127\.0\.0\.1:4100/);
  assert.match(source, /'\/api'/);
  assert.match(source, /'\/health'/);
});

test('standalone web source contains no provider-specific ERP implementation contract', () => {
  const sourceFiles = [
    'apps/web/src/App.jsx',
    'apps/web/src/api.js',
    'apps/web/src/sessionStore.js',
    'apps/web/src/main.jsx',
  ];
  const source = sourceFiles.map(read).join('\n');
  assert.doesNotMatch(source, /module_code|function_code|organization_id|branch_id|sec_/i);
  assert.doesNotMatch(source, /akshaerp/i);
});
