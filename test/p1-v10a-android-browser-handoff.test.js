'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V10A Android exposes HTTPS browser intents for company SSO handoff', () => {
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  assert.match(manifest, /<queries>[\s\S]*android\.intent\.action\.VIEW[\s\S]*android:scheme="https"[\s\S]*<\/queries>/);
});

test('V10A Android preserves the AkshaConnect callback deep link', () => {
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  assert.match(manifest, /android:scheme="akshaconnect"/);
  assert.match(manifest, /android:host="auth"/);
  assert.match(manifest, /android:path="\/callback"/);
  assert.match(manifest, /android:launchMode="singleTask"/);
});
