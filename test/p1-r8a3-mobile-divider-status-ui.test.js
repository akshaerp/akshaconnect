'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('R8A.3 mobile captures unread count before opening a conversation', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /const unreadCountsRef = useRef\(unreadCounts\)/);
  assert.match(app, /unreadCountsRef\.current = unreadCounts/);
  assert.match(app, /const unreadAtOpen = conversationId/);
  assert.match(app, /setSelectedConversation\(\{\s*\.\.\.selection,\s*unreadAtOpen,/s);
});

test('R8A.3 mobile shows New messages divider for unread-at-open history', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(screen, /function findUnreadDivider\(rows, unreadCount, currentMemberId\)/);
  assert.match(screen, /initialUnreadCount:\s*Number\(conversation\?\.unreadAtOpen \|\| 0\)/);
  assert.match(screen, /setNewMessageDividerId\(\s*findUnreadDivider/s);
  assert.match(screen, />\s*New messages\s*</);
});

test('R8A.3 web status dot is beside the avatar and has no surround ring', () => {
  const app = read('apps/web/src/App.jsx');
  const styles = read('apps/web/src/styles.css');

  assert.match(app, /className="dm-avatar-status"/);
  assert.match(styles, /\.dm-avatar-status\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(styles, /\.presence-dot\s*\{[\s\S]*position:\s*static/);
  assert.match(styles, /\.presence-dot\s*\{[\s\S]*border:\s*0/);
  assert.match(styles, /\.presence-dot\s*\{[\s\S]*box-shadow:\s*none/);
  assert.doesNotMatch(styles, /\.dm-avatar-presence\s*\{/);
});
