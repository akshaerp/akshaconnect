'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

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

test('V16-P shared conversation chrome parses and defines the current six-line composer', () => {
  const chrome = parse(
    'apps/mobile/src/screens/ConversationChrome.jsx'
  );

  assert.match(
    chrome,
    /CONVERSATION_COMPOSER_MAX_LINES\s*=\s*6/
  );
  assert.match(
    chrome,
    /CONVERSATION_COMPOSER_LINE_HEIGHT\s*\*\s*CONVERSATION_COMPOSER_MAX_LINES/
  );
  assert.match(chrome, /onContentSizeChange=/);
  assert.match(chrome, /scrollEnabled=/);
  assert.match(chrome, /export function ConversationHeader/);
  assert.match(chrome, /export function ConversationComposer/);
  assert.match(chrome, /export function JumpToLatestButton/);
});

test('V16-P main conversation consumes shared header composer and latest-message control', () => {
  const source = parse(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(source, /<ConversationHeader/);
  assert.match(source, /<ConversationComposer/);
  assert.match(source, /<JumpToLatestButton/);
  assert.match(source, /distanceFromBottom\s*>\s*160/);
  assert.match(source, /setShowJumpToLatest\(false\)/);
  assert.match(
    source,
    /messages\.length\s*<=\s*50\s*&&\s*nearBottomRef\.current/s
  );
});

test('V16-P thread uses the same header and composer instead of the legacy navy controls', () => {
  const source = parse(
    'apps/mobile/src/screens/ThreadModal.jsx'
  );

  assert.match(source, /<ConversationHeader/);
  assert.match(source, /<ConversationComposer/);
  assert.match(source, /<JumpToLatestButton/);
  assert.match(
    source,
    /<StatusBar[\s\S]*backgroundColor=\{colors\.primary\}/
  );
  assert.match(
    source,
    /header:\s*\{[\s\S]*backgroundColor:\s*colors\.primary/
  );
  assert.doesNotMatch(
    source,
    /<View style=\{styles\.composer\}>/
  );
  assert.doesNotMatch(
    source,
    /header:\s*\{[^}]*backgroundColor:\s*colors\.navy/
  );
});

test('V16-P conversation details uses the shared current-style header for user and channel settings', () => {
  const source = parse(
    'apps/mobile/src/screens/ConversationDetailsModal.jsx'
  );

  assert.match(source, /<ConversationHeader/);
  assert.match(source, /subtitle="Conversation details"/);
  assert.match(
    source,
    /<StatusBar[\s\S]*backgroundColor=\{colors\.primary\}/
  );
  assert.match(
    source,
    /header:\s*\{[\s\S]*backgroundColor:\s*colors\.primary/
  );
});

test('V16-P preserves V16-O ownership and V16-N stable thread read plumbing', () => {
  const thread = read(
    'apps/mobile/src/screens/ThreadModal.jsx'
  );
  const conversation = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(thread, /styles\.v16oMessageRowOwn/);
  assert.match(thread, /styles\.v16oMessageRowOther/);
  assert.match(thread, /styles\.v16oMessageBubbleOwn/);
  assert.match(thread, /styles\.v16oMessageBubbleOther/);
  assert.match(conversation, /onRead=\{handleThreadRead\}/);
  assert.doesNotMatch(
    conversation,
    /onRead=\{\(messageId\)\s*=>/
  );
});
