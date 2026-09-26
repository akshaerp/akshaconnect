'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V14.1 Android downloads no longer depend on unsupported VIEW_DOWNLOADS intent', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.doesNotMatch(screen, /android\.intent\.action\.VIEW_DOWNLOADS/);
  assert.doesNotMatch(screen, /Linking\.sendIntent/);
  assert.match(screen, /MediaCollection[\s\S]*copyToMediaStore/);
  assert.match(screen, /saved\?\.contentUri/);
  assert.match(screen, /actionViewIntent\([\s\S]*saved\.contentUri/);
  assert.match(screen, /savedAttachments\?\.\[[\s\S]*item\.attachment_id[\s\S]*\][\s\S]*\? '✓'/);
});

test('V14.1 mobile opens unread conversations at the New messages divider instead of forcing the bottom', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(screen, /const initialUnreadPositionedRef = useRef\(false\)/);
  assert.match(screen, /let dividerId = null;[\s\S]*findUnreadDivider\([\s\S]*setNewMessageDividerId\(dividerId\)/);
  assert.match(screen, /if \(latest\?\.message_id && !dividerId\) \{[\s\S]*markMessageRead\(latest\.message_id\)/);
  assert.match(screen, /onContentSizeChange=\{\(\) => \{[\s\S]*if \(newMessageDividerId\) \{[\s\S]*return;/);
  assert.match(screen, /onLayout=\{\(event\) => \{[\s\S]*initialUnreadPositionedRef\.current[\s\S]*scrollRef\.current\?\.scrollTo\(\{[\s\S]*y: targetY/);
});

test('V14.1 mobile advances the read cursor when the user reaches the bottom and does not force-follow while reading older unread messages', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(screen, /const nearBottomRef = useRef\(true\)/);
  assert.match(screen, /onScroll=\{\(event\) => \{[\s\S]*distanceFromBottom[\s\S]*nowNearBottom[\s\S]*markMessageRead/);
  assert.match(screen, /const shouldFollow = nearBottomRef\.current;[\s\S]*if \(shouldFollow\) \{[\s\S]*markMessageRead\(latestIncoming\.message_id\)[\s\S]*scrollToBottom\(true\)/);
});

test('V14.1 web preserves unread-first landing and waits to mark the latest message read until there is no unread divider', () => {
  const app = read('apps/web/src/App.jsx');

  assert.match(app, /let dividerId = null;[\s\S]*findUnreadDivider\(nextMessages, initialUnreadCount\)/);
  assert.match(app, /target\.scrollIntoView\(\{ block: 'center' \}\)/);
  assert.match(app, /if \(!appendOlder && latest\?\.message_id && !dividerId\) \{[\s\S]*markMessageRead\(latest\.message_id\)/);
  assert.match(app, /const unreadAtOpen = Number\(selected\?\.unread_at_open \|\| 0\);[\s\S]*const startsAtBottom = unreadAtOpen <= 0;[\s\S]*reportViewportState\(startsAtBottom\)/);
});
