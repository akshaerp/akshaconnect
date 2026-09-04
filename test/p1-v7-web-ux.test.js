'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx');
const cssPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'messages.css');
const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

test('P1-V7 responsive drawer replaces horizontal-only mobile navigation', () => {
  assert.match(app, /mobileSidebarOpen/);
  assert.match(app, /mobile-menu-button/);
  assert.match(app, /mobile-sidebar-overlay/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /app-shell\.mobile-sidebar-open \.workspace-sidebar/);
  assert.match(css, /transform: translateX\(-105%\)/);
});

test('P1-V7 exposes explicit realtime connection state without changing transport auth', () => {
  assert.match(app, /connectionLabel\(realtimeStatus\)/);
  assert.match(app, /connection-banner/);
  assert.match(app, /Realtime connection interrupted\. Reconnecting automatically/);
  assert.doesNotMatch(app, /access_token=.*\/ws|\/ws\?[^\n]*token/i);
});

test('P1-V7 unread presentation includes section totals and document title count', () => {
  assert.match(app, /channelUnread/);
  assert.match(app, /dmUnread/);
  assert.match(app, /document\.title = totalUnread > 0/);
  assert.match(app, /section-unread-total/);
  assert.match(app, /unread_at_open/);
  assert.match(app, /New messages/);
});

test('P1-V7 history groups nearby sender messages and adds date separators', () => {
  assert.match(app, /function sameMessageGroup/);
  assert.match(app, /5 \* 60 \* 1000/);
  assert.match(app, /message-date-separator/);
  assert.match(app, /grouped-message/);
  assert.match(app, /Today/);
  assert.match(app, /Yesterday/);
});

test('P1-V7 preserves user scroll position when realtime arrives above the fold', () => {
  assert.match(app, /nearBottomRef/);
  assert.match(app, /distance < 90/);
  assert.match(app, /showNewMessageJump/);
  assert.match(app, /New messages ↓/);
  assert.match(app, /scrollToBottom/);
});

test('P1-V7 notification toast opens its authorized conversation', () => {
  assert.match(app, /selection: channel \?/);
  assert.match(app, /notificationToast\.selection/);
  assert.match(app, /selectConversation\(notificationToast\.selection\)/);
});

test('P1-V7 adds keyboard dismissal and composer growth/limit feedback', () => {
  assert.match(app, /event\.key !== 'Escape'/);
  assert.match(app, /setShowChannelCreate\(false\)/);
  assert.match(app, /scrollHeight/);
  assert.match(app, /8,000 characters/);
});

test('P1-V7 still does not fabricate delivery/read receipt presentation', () => {
  assert.doesNotMatch(app, /Delivered ✓|Read ✓/);
});

test('P1-V7 V1A preserves the unread-at-open snapshot until the divider is rendered', () => {
  assert.match(app, /findUnreadDivider\(nextMessages, initialUnreadCount\)/);
  assert.match(app, /load\(\{ initialUnreadCount: Number\(selected\?\.unread_at_open \|\| 0\) \}\)/);
  assert.doesNotMatch(app, /initialLoadRef/);
  assert.match(app, /message\.message_id === unreadDividerMessageId/);
});

test('P1-V7 V1A read state follows visible viewport instead of browser focus alone', () => {
  assert.match(app, /conversationReadStateRef/);
  assert.match(app, /activeAndReadable/);
  assert.match(app, /document\.visibilityState === 'visible'/);
  assert.match(app, /readState\.atBottom/);
  assert.doesNotMatch(app, /document\.hasFocus\(\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /markMessageRead\(latest\.message_id\)/);
});

test('P1-V7 V1C shows an arrival divider for realtime messages in the already-selected conversation', () => {
  assert.match(app, /const ownRealtimeMessage = event\.message\.sender_type === 'HUMAN'/);
  assert.match(app, /if \(!ownRealtimeMessage\) \{\s*setUnreadDividerMessageId\(\(current\) => current \|\| event\.message\.message_id\);/);
  assert.match(app, /const readableNow = document\.visibilityState === 'visible' && nearBottomRef\.current/);
  assert.match(app, /if \(readableNow && event\.message\.message_id\) \{\s*markMessageRead\(event\.message\.message_id\);/);
  assert.match(app, /setUnreadDividerMessageId\(null\);\s*window\.requestAnimationFrame\(\(\) => scrollToBottom\('smooth'\)\)/);
});
