'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');


function parse(relative) {
  const source = read(relative);
  assert.doesNotThrow(() => {
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    });
  });
  return source;
}

test('V16-Q keeps conversation search inline with matches/full-chat navigation', () => {
  const screen = parse('apps/mobile/src/screens/ConversationScreen.jsx');
  const search = parse('apps/mobile/src/screens/ConversationSearchBar.jsx');
  parse('apps/mobile/src/screens/MessageReadersModal.jsx');
  parse('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(screen, /ConversationSearchBar/);
  assert.match(screen, /messageSearchMode/);
  assert.match(screen, /openSearchResultAt/);
  assert.match(screen, /navigateMessageSearch/);
  assert.match(screen, /historyHiddenForSearch/);
  assert.doesNotMatch(screen, /visible=\{showMessageSearch\}[\s\S]{0,100}transparent[\s\S]{0,100}animationType="fade"/);

  assert.match(search, />\s*Matches\s*</);
  assert.match(search, />\s*Full chat\s*</);
  assert.match(search, /Previous search result/);
  assert.match(search, /Next search result/);
  assert.match(search, /currentIndex \+ 1/);
});

test('V16-Q fixes one-tap jump by returning the loaded message instead of reading stale state', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(screen, /const target = working\.find/);
  assert.match(screen, /return target;/);
  assert.match(screen, /await jumpToMessage\(message\.reply_to_message_id\)/);
  assert.match(screen, /setThreadParent\(parent\)/);
  assert.match(screen, /scrollToMessageLayout/);
});

test('V16-Q routes thread search hits to the exact reply without thread-header search arrows', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(screen, /threadSearchTargetMessageId/);
  assert.match(screen, /initialMessageId=\{threadSearchTargetMessageId\}/);
  assert.doesNotMatch(screen, /searchNavigation=/);

  assert.match(thread, /initialMessageId = ''/);
  assert.match(thread, /scrollToThreadMessage/);
  assert.match(thread, /highlightMessageId === message\.message_id/);
  assert.doesNotMatch(thread, /Previous search result/);
  assert.doesNotMatch(thread, /Next search result/);
});

test('V16-Q uses a high-contrast message highlight instead of translucent-only highlighting', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  for (const source of [screen, thread]) {
    assert.match(source, /borderColor:\s*colors\.brandOrange/);
    assert.match(source, /backgroundColor:\s*'#FFF6E9'/);
  }
});
