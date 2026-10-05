'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('V20.1 client keeps canonical selected mentions alive through send filtering', () => {
  const source = read('apps/mobile/src/mentions/mentionUtils.js');

  assert.match(source, /candidate\?\.display_text/);
  assert.match(source, /rawDisplayText\.startsWith\(prefix\)/);
  assert.match(source, /\.map\(normalizeMention\)/);

  // The old defect only considered display_name/channel_name/label.
  assert.doesNotMatch(
    source,
    /candidate\?\.display_name \|\|\s*candidate\?\.channel_name \|\|\s*candidate\?\.label \|\|\s*''/
  );
});

test('V20.1 web mention normalizer preserves canonical display_text mentions', () => {
  const source = read('apps/web/src/App.jsx');

  assert.match(source, /function normalizeWebMention\(candidate\)/);
  assert.match(source, /candidate\?\.display_text/);
  assert.match(source, /rawDisplayText\.startsWith\(prefix\)/);
});

test('Message Info has no periodic visible polling and supports manual pull refresh', () => {
  const source = read('apps/mobile/src/screens/MessageReadersModal.jsx');

  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(source, /RefreshControl/);
  assert.match(source, /load\(\{ manual: true \}\)/);
  assert.match(source, /load\(\{ silent: true \}\)/);
  assert.match(source, /Pull down to refresh delivery status/);
});
