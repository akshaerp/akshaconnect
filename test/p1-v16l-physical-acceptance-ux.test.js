'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V16-L mobile message actions render reactions as one compact toolbar', () => {
  const sheet = read('apps/mobile/src/screens/MessageActionSheet.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(sheet, /accessibilityLabel="Quick reactions"/);
  assert.match(sheet, /styles\.reactionBar/);
  assert.match(sheet, /reaction\.selected/);
  assert.match(conversation, /reactions=\{QUICK_REACTIONS\.map/);
  assert.doesNotMatch(conversation, /detail:\s*'React to message'/);
});

test('V16-L message actions use compact action icons rather than six full reaction rows', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const sheet = read('apps/mobile/src/screens/MessageActionSheet.jsx');

  assert.match(conversation, /icon:\s*'↩'/);
  assert.match(conversation, /icon:\s*'↪'/);
  assert.match(conversation, /icon:\s*'⧉'/);
  assert.match(conversation, /icon:\s*'➜'/);
  assert.match(sheet, /minHeight:\s*46/);
  assert.doesNotMatch(sheet, /actionDetail/);
});

test('V16-L composer keeps emoji control inside the text field to preserve chat width', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /style=\{styles\.composerInputShell\}/);
  assert.match(conversation, /styles\.inlineEmojiButton/);
  assert.match(conversation, /paddingRight:\s*42/);
  assert.match(conversation, /minWidth:\s*54/);
});

test('V16-L quoted reply remains visibly embedded and jumps to the original message', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /message\.quoted_message/);
  assert.match(conversation, /accessibilityLabel="Jump to quoted message"/);
  assert.match(conversation, /onJumpToMessage\?\.\(message\.quote_message_id\)/);
});

test('V16-L reaction 404 explains server/API parity instead of a generic request failure', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /status === 404/);
  assert.match(conversation, /server has not been upgraded to the V16 reaction API/);
  assert.match(conversation, /reaction migration/);
});
