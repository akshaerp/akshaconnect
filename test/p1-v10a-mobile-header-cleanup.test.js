'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('authenticated shell no longer renders the legacy dark AccountBar', () => {
  const source = read('apps/mobile/App.jsx');
  assert.doesNotMatch(source, /function AccountBar\s*\(/);
  assert.doesNotMatch(source, /<AccountBar\b/);
  assert.doesNotMatch(source, /styles\.accountBar\b/);
});

test('authenticated status bar uses the clean white safe-area header', () => {
  const source = read('apps/mobile/App.jsx');
  assert.match(
    source,
    /<StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" \/>/
  );
});

test('HomeScreen brand header is the organization switch control', () => {
  const source = read('apps/mobile/src/screens/HomeScreen.jsx');
  assert.match(source, /onOpenAccountSwitcher/);
  assert.match(source, /accessibilityLabel="Switch organization"/);
  assert.match(source, /onPress=\{onOpenAccountSwitcher\}/);
  assert.match(source, /tenant\.tenant_name/);
  assert.match(source, /organizationChevron/);
});

test('existing long-lived mobile access refresh remains in App', () => {
  const source = read('apps/mobile/App.jsx');
  assert.match(source, /const refreshDeviceAccess = useCallback\(async \(\) =>/);
  assert.match(source, /expiresAt - 5 \* 60 \* 1000/);
  assert.match(source, /refreshDeviceAccess\(\)\.catch\(\(\) => \{\}\)/);
});
