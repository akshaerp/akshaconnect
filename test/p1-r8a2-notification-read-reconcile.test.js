'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('R8A.2 clears only displayed notifications for the conversation that was read', () => {
  const source = read('apps/mobile/src/notifications/nativeNotifications.js');

  assert.match(source, /getDisplayedNotifications/);
  assert.match(source, /cancelDisplayedNotifications\(matchingIds\)/);
  assert.match(source, /dataConversationId === cleanId/);
  assert.match(source, /androidTag === expectedTag/);
  assert.match(source, /notification\?\.id === expectedId/);
  assert.doesNotMatch(source, /cancelAllNotifications/);
});

test('R8A.2 foreground notification identity is conversation scoped', () => {
  const source = read('apps/mobile/src/notifications/nativeNotifications.js');

  assert.match(source, /CONVERSATION_NOTIFICATION_PREFIX = 'conversation-'/);
  assert.match(source, /id: conversationNotificationId\(selection\.conversationId\)/);
});

test('R8A.2 read cursor reconciliation clears that conversation only', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /clearConversationNotifications\(payload\.conversation_id\)\.catch/);
  assert.match(app, /clearConversationNotifications\(conversationId\)\.catch/);
  assert.match(app, /current\?\.selection\?\.conversationId === conversationId/);
});

test('R8A.2 FCM has a stable Android tag per conversation', () => {
  const sender = read('services/api/src/push/firebasePushSender.js');

  assert.match(sender, /data\?\.conversationId/);
  assert.match(sender, /androidNotification\.tag/);
  assert.match(sender, /akshaconnect-conversation-\$\{conversationId\}/);
  assert.match(sender, /notification:\s*androidNotification/);
});

test('R8A.2 Android internal build advances to v10', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');

  assert.match(gradle, /versionCode 11/);
  assert.match(gradle, /versionName "0\.3\.0-v11"/);
});
