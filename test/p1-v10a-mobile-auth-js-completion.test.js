'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('R6 parses the custom-scheme callback without depending on global URL', () => {
  const source = read('apps/mobile/App.jsx');

  assert.match(source, /function parseMobileAuthCallback\(value\)/);
  assert.match(source, /\^akshaconnect:\\\/\\\/auth\\\/callback/);
  assert.doesNotMatch(source, /new URL\(callbackUrl\)/);
  assert.match(source, /requestId: clean\(params\.request_id\)/);
  assert.match(source, /code: clean\(params\.code\)/);
  assert.match(source, /state: clean\(params\.state\)/);
});

test('R6 keeps a warm in-memory pending auth copy while retaining Keychain fallback', () => {
  const source = read('apps/mobile/App.jsx');

  assert.match(source, /const pendingMobileAuthRef = useRef\(null\)/);
  assert.match(source, /pendingMobileAuthRef\.current = pending/);
  assert.match(
    source,
    /pendingMobileAuthRef\.current \|\|\s*await loadPendingMobileAuth\(\)/
  );
});

test('R6 traces every pre-exchange stage without logging auth secrets', () => {
  const source = read('apps/mobile/App.jsx');

  assert.match(source, /JS received native callback event/);
  assert.match(source, /JS callback accepted/);
  assert.match(source, /Pending mobile sign-in state loaded/);
  assert.match(source, /Mobile sign-in state validated/);
  assert.match(source, /Starting mobile authorization exchange/);
  assert.match(source, /Mobile authorization exchange succeeded/);

  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*(?:exchangeSecret|requestId|authorizationCode|deviceToken)/);
});

test('R6 does not destroy retry state on a pre-exchange completion error', () => {
  const source = read('apps/mobile/App.jsx');
  const start = source.indexOf('const completeMobileAuthorization');
  const end = source.indexOf('useEffect(() => {', start);
  const completion = source.slice(start, end);
  const catchStart = completion.indexOf('} catch (error) {');
  const finallyStart = completion.indexOf('} finally {', catchStart);
  const catchBlock = completion.slice(catchStart, finallyStart);

  assert.doesNotMatch(catchBlock, /clearPendingMobileAuth\(/);
  assert.match(catchBlock, /return false/);
});
