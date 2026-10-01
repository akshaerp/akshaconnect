'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-I mobile composer has emoji picker and durable recent emojis', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const chrome = read('apps/mobile/src/screens/ConversationChrome.jsx');
  const store = read('apps/mobile/src/emoji/recentEmojiStore.js');
  assert.match(chrome, /accessibilityLabel="Choose emoji"/);
  assert.match(chrome, /COMPOSER_EMOJIS/);
  assert.match(mobile, /COMPOSER_EMOJIS/);
  assert.match(mobile, /loadRecentEmojis/);
  assert.match(mobile, /saveRecentEmojis/);
  assert.match(store, /akshaconnect-recent-emojis-v1\.json/);
});

test('V16-I web composer persists recent emojis locally', () => {
  const web = read('apps/web/src/App.jsx');
  assert.match(web, /Choose emoji/);
  assert.match(web, /COMPOSER_EMOJIS/);
  assert.match(web, /localStorage\.setItem\('akshaconnect\.recent-emojis'/);
});
