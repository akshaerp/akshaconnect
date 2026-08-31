'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const required = [
  'apps/web',
  'apps/mobile',
  'services/api',
  'services/realtime',
  'services/notification-worker',
  'packages/contracts',
  'packages/sdk',
  'packages/ui',
  'packages/validation',
  'database/migrations',
  'database/seeds',
  'infrastructure/docker',
  'docs/architecture',
  'docs/testing',
];

test('Phase 0 repository structure is present', () => {
  for (const relativePath of required) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} must exist`);
  }
});
