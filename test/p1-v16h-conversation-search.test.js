'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-H exposes authorized conversation search endpoint', () => {
  const app = read('services/api/src/app.js');
  const service = read('services/api/src/messaging/messagingService.js');
  assert.match(app, /conversations\\\/\(\[\^\/\]\+\)\\\/search/);
  assert.match(app, /searchConversationMessages/);
  assert.match(service, /requireConversationAccess\(actor, conversationId\)/);
});

test('V16-H searches decrypted message material in service repository layer', () => {
  const repo = read('services/api/src/messaging/messagingRepository.js');
  assert.match(repo, /async function searchConversationMessages/);
  assert.match(repo, /materializeMessage\(row\)/);
  assert.match(repo, /haystack\.includes\(needle\)/);
});

test('V16-H mobile and web search results route to message or thread', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const web = read('apps/web/src/App.jsx');
  for (const source of [mobile, web]) {
    assert.match(source, /runMessageSearch/);
    assert.match(source, /openSearchResult/);
    assert.match(source, /reply_to_message_id/);
    assert.match(source, /jumpToMessage/);
  }
});
