'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('V16-N mobile thread read handler has stable identity across parent rerenders', () => {
  const source = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(
    source,
    /const handleThreadRead = useCallback\(\s*\(messageId\) => \{/,
    'thread read handler must be memoized with useCallback'
  );

  assert.match(
    source,
    /onRead=\{handleThreadRead\}/,
    'ThreadModal must receive the stable memoized handler'
  );

  assert.doesNotMatch(
    source,
    /onRead=\{\(messageId\)\s*=>/,
    'ThreadModal must not receive a fresh inline onRead function each parent render'
  );

  assert.match(
    source,
    /threadParent\?\.message_id,\s*token,\s*\]\s*\);/s,
    'memoized handler must change when the active thread parent changes'
  );
});

test('V16-N thread read acknowledgement does not rewrite an already-read parent row', () => {
  const source = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(
    source,
    /Number\(item\.thread_unread_count \|\| 0\) === 0[\s\S]*?return item;/,
    'already-zero thread unread state must preserve the existing message object'
  );
});

test('V16-N guard keeps ThreadModal read callback stable without parent-edit reload loops', () => {
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(
    thread,
    /onRead\?\.\(latest\.message_id\)/,
    'ThreadModal must acknowledge the latest loaded thread reply'
  );

  assert.match(
    thread,
    /\[\s*visible,\s*parentId,\s*conversationId,\s*token,\s*serverUrl,\s*initialUnreadCount,\s*currentMemberId,\s*onRead\s*,?\s*\]\s*\);/s,
    'ThreadModal load effect must remain stable across realtime parent-message edits'
  );

  assert.match(
    thread,
    /if \(message\.message_id === parentId\) \{[\s\S]*?setParent\(message\);[\s\S]*?continue;/,
    'Realtime parent edits must update local thread state without reloading the thread'
  );
});
