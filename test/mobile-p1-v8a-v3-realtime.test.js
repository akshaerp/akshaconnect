const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V10A keeps the authenticated mobile realtime transport provider-neutral', () => {
  const realtime = read(
    'apps/mobile/src/realtime/client.js'
  );
  const app = read('apps/mobile/App.jsx');

  assert.match(realtime, /\/ws/);
  assert.match(realtime, /type:\s*['"]auth['"]/);
  assert.match(realtime, /access_token:\s*token/);
  assert.match(app, /message\.created/);

  // Company/provider selection now belongs to the authentication layer in App.jsx.
  // The realtime transport itself must remain independent of ERP/tenant authority.
  assert.doesNotMatch(
    realtime,
    /AKSHAERP_|module_code|function_code|organization_id|tenant_id/i
  );
});

test('P1-V8A V3 keeps bearer credentials out of the WebSocket URL', () => {
  const realtime = read(
    'apps/mobile/src/realtime/client.js'
  );

  assert.match(realtime, /websocketUrl/);
  assert.match(realtime, /wss:\/\//);
  assert.match(realtime, /ws:\/\//);
  assert.doesNotMatch(
    realtime,
    /[?&](token|access_token)=/i
  );
});

test('P1-V8A V3 manages realtime with mobile application lifecycle', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /AppState/);
  assert.match(app, /createRealtimeClient/);
  assert.match(app, /appState !== 'active'/);
  assert.match(app, /realtime\.stop\(\)/);
  assert.match(app, /realtimeStatus/);
});

test('P1-V8A V3 merges realtime message.created into the open conversation by durable id', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(screen, /realtimeEvents/);
  assert.match(screen, /message\.created/);
  assert.match(screen, /payload\.conversation_id/);
  assert.match(screen, /payload\.message/);
  assert.match(screen, /new Map\(\)/);
  assert.match(screen, /message\.message_id/);
});

test('P1-V8A V3 reconciles durable history after reconnect and exposes connection state', () => {
  const app = read('apps/mobile/App.jsx');
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );
  const home = read(
    'apps/mobile/src/screens/HomeScreen.jsx'
  );

  assert.match(app, /reconcileEpoch/);
  assert.match(app, /hasConnectedRef/);
  assert.match(screen, /loadLatest\(\{\s*reconcile:\s*true/);
  assert.match(screen, /Live/);
  assert.match(home, /Reconnecting/);
  assert.match(home, /Offline/);
});

test('P1-V8A V3 mobile unread state uses the existing durable unread/read-cursor APIs', () => {
  const api = read(
    'apps/mobile/src/api/client.js'
  );
  const app = read('apps/mobile/App.jsx');

  assert.match(api, /\/api\/v1\/unread-counts/);
  assert.match(api, /read-cursor/);
  assert.match(api, /last_read_message_id/);
  assert.match(app, /listUnreadCounts/);
  assert.match(app, /unreadCounts/);
  assert.match(app, /read_cursor\.updated/);
});

test('P1-V8A V3 foreground notifications and unread badges ignore own realtime echoes', () => {
  const app = read('apps/mobile/App.jsx');
  const home = read(
    'apps/mobile/src/screens/HomeScreen.jsx'
  );

  assert.match(app, /ownMessage/);
  assert.match(app, /activelyReading/);
  assert.match(app, /setNotificationToast/);
  assert.match(app, /notificationPreview/);
  assert.match(home, /rowUnreadPill/);
  assert.match(home, /sectionUnreadPill/);
  assert.match(home, /unreadCounts/);
});

test('P1-V8A V3 marks the latest open-conversation message read and clears local unread state', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );
  const app = read('apps/mobile/App.jsx');

  assert.match(screen, /markRead/);
  assert.match(screen, /markMessageRead/);
  assert.match(screen, /onConversationRead/);
  assert.match(app, /handleConversationRead/);
  assert.match(app, /\[conversationId\]: 0/);
});

test('P1-V8A V3 Android foreground notifications use the native notification shade and sound channel', () => {
  const app = read('apps/mobile/App.jsx');
  const nativeNotifications = read(
    'apps/mobile/src/notifications/nativeNotifications.js'
  );

  assert.match(nativeNotifications, /@notifee\/react-native/);
  assert.match(nativeNotifications, /AndroidImportance\.HIGH/);
  assert.match(nativeNotifications, /sound:\s*['"]default['"]/);
  assert.match(nativeNotifications, /displayNotification/);
  assert.match(nativeNotifications, /requestPermission/);
  assert.match(app, /displayNativeMessageNotification/);
  assert.match(app, /subscribeToNativeNotificationPress/);
});

test('P1-V8A V3B1 notification navigation reconciles durable history', () => {
  const app = read('apps/mobile/App.jsx');
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    app,
    /openFromNativeNotification[\s\S]*setSelectedConversation\(selection\)[\s\S]*setReconcileEpoch\(\(value\) => value \+ 1\)/
  );

  assert.match(
    app,
    /handleOpenConversation\(notificationToast\.selection\);[\s\S]*setReconcileEpoch\(\(value\) => value \+ 1\)/
  );

  assert.match(
    screen,
    /lastReconcileEpochRef\s*=\s*useRef\(0\)/
  );

  assert.match(
    screen,
    /loadLatest\(\{\s*reconcile:\s*true/
  );
});

test('R8A open-chat incoming messages render realtime content without unread or notification noise', () => {
  const app = read('apps/mobile/App.jsx');

  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  const flowStart = app.indexOf(
    'const activeConversation = selectedConversationRef.current'
  );

  assert.ok(flowStart >= 0);

  const flowEnd = app.indexOf(
    'displayNativeMessageNotification',
    flowStart
  );

  assert.ok(flowEnd > flowStart);

  const flow = app.slice(
    flowStart,
    flowEnd + 200
  );

  assert.match(
    flow,
    /presenceStateRef\.current === PRESENCE_ACTIVE/
  );

  assert.match(
    flow,
    /if\s*\(activelyReading\)\s*\{[\s\S]*return;[\s\S]*\}/
  );

  assert.match(
    flow,
    /setUnreadCounts/
  );

  assert.match(
    flow,
    /displayNativeMessageNotification/
  );

  assert.match(
    screen,
    /arrivalDividerReadyRef/
  );

  assert.match(
    screen,
    /newMessageDividerId/
  );

  assert.match(
    screen,
    /incomingFromOthers/
  );

  assert.match(
    screen,
    /current\s*\|\|\s*firstExternalIncoming\.message_id/
  );

  assert.match(
    screen,
    />\s*New messages\s*</
  );

  assert.match(
    screen,
    /newMessagesRow/
  );
});

test('P1-V8A V3C1 keeps Android composer above keyboard and latest chat visible', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /Platform\.OS === 'ios'[\s\S]*\? 'padding'[\s\S]*: 'height'/
  );

  assert.match(
    screen,
    /keyboardVerticalOffset=\{0\}/
  );

  assert.match(
    screen,
    /Keyboard\.addListener/
  );

  assert.match(
    screen,
    /keyboardDidShow/
  );

  assert.match(
    screen,
    /keyboardDismissMode/
  );

  assert.match(
    screen,
    /onFocus=\{\(\) => \{[\s\S]*scrollToBottom\(false\)/
  );
});


test('R8A.1 mobile realtime explicitly leaves presence and renews the foreground lease', () => {
  const realtime = read(
    'apps/mobile/src/realtime/client.js'
  );

  assert.match(realtime, /PRESENCE_HEARTBEAT_MS/);
  assert.match(realtime, /schedulePresenceHeartbeat/);
  assert.match(realtime, /type:\s*'presence\.leave'/);
  assert.match(realtime, /leavePresence\(\);[\s\S]*current\.close/);
});
