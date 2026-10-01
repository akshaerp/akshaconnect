'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function parseJsx(rel) {
  parser.parse(read(rel), {
    sourceType: 'module',
    plugins: ['jsx'],
  });
}

test('V16-U changed mobile sources pass Babel JSX parsing', () => {
  [
    'apps/mobile/App.jsx',
    'apps/mobile/src/screens/HomeScreen.jsx',
    'apps/mobile/src/screens/SettingsScreen.jsx',
    'apps/mobile/src/screens/ConversationScreen.jsx',
    'apps/mobile/src/screens/ThreadModal.jsx',
  ].forEach(parseJsx);
});

test('V16-U main chat and thread expose a New messages boundary without premature read acknowledgement', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(conversation, />\s*New messages\s*</);
  assert.match(conversation, /initialConversation\?\.unreadAtOpen/);
  assert.match(conversation, /initialUnreadCount=\{Number\(threadParent\?\.thread_unread_count \|\| 0\)\}/);

  assert.match(thread, /function findThreadUnreadDivider/);
  assert.match(thread, /setNewMessageDividerId\(dividerId\)/);
  assert.match(thread, /if \(latest\?\.message_id && !dividerId\)/);
  assert.match(thread, />New messages</);
  assert.match(thread, /initialUnreadPositionedRef/);
});

test('V16-U presence uses Online Offline language and carries custom status to list and header', () => {
  const app = read('apps/mobile/App.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(app, /normalizePresenceProfiles/);
  assert.match(app, /presenceProfilesByMember/);
  assert.match(app, /custom_status:\s*clean\(payload\.custom_status\)/);

  assert.match(home, /if \(status === 'LIVE'\) return 'Online'/);
  assert.match(home, /return 'Offline'/);
  assert.doesNotMatch(home, /return 'Not available'/);
  assert.match(home, /presenceProfile\?\.custom_status/);

  assert.match(conversation, /if \(status === 'LIVE'\) return 'Online'/);
  assert.match(conversation, /peerCustomStatus/);
  assert.match(conversation, /const customStatus = showPeerPresence \? peerCustomStatus : ''/);
  assert.match(conversation, /customStatus=\{customStatus\}/);

  const chrome = read('apps/mobile/src/screens/ConversationChrome.jsx');
  assert.match(chrome, /customStatus = ''/);
  assert.match(chrome, /\{customStatus\}/);
});

test('V16-U custom status accepts a future custom local date and time', () => {
  const settings = read('apps/mobile/src/screens/SettingsScreen.jsx');

  assert.match(settings, /function customExpiryFromLocalText/);
  assert.match(settings, /Custom: YYYY-MM-DD HH:MM/);
  assert.match(settings, /applyCustomExpiry/);
  assert.match(settings, /setStatusExpiry\(parsed\)/);
});

test('V16-U read notification cleanup retries and never blocks the read cursor', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /async function clearConversationNotificationsReliably/);
  assert.match(app, /const delays = \[0, 250, 900\]/);
  assert.match(app, /clearConversationNotificationsReliably\(conversationId\)\.catch/);
  assert.match(app, /clearConversationNotificationsReliably\(payload\.conversation_id\)\.catch/);
});

test('V16-U concurrent parent edits do not re-open the thread request or flash a transient 404', () => {
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(thread, /Number\(requestError\?\.status \|\| 0\) === 404 && parent/);
  assert.doesNotMatch(
    thread,
    /serverUrl,\s*parentMessage,\s*onRead,\s*\]\);/
  );
  assert.match(conversation, /setQuoteReplyMessage\(\(current\) =>/);
  assert.match(conversation, /mutation\.type === 'message\.deleted'/);
});
