'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-V appearance persists Standard Comfortable Large plus System Light Dark themes', () => {
  const store = read('apps/mobile/src/theme/appearanceStore.js');
  const settings = read('apps/mobile/src/screens/SettingsScreen.jsx');
  const app = read('apps/mobile/App.jsx');

  assert.match(store, /APP_TEXT_SIZE_OPTIONS/);
  assert.match(store, /key:\s*'comfortable'/);
  assert.match(store, /DEFAULT_TEXT_SIZE_MODE = 'comfortable'/);
  assert.match(store, /APP_THEME_OPTIONS/);
  assert.match(store, /key:\s*'system'/);
  assert.match(store, /key:\s*'light'/);
  assert.match(store, /key:\s*'dark'/);
  assert.match(store, /LIGHT_PALETTE/);
  assert.match(store, /DARK_PALETTE/);
  assert.match(store, /ownTimestamp:/);
  assert.match(store, /theme_mode:/);
  assert.match(settings, /Theme/);
  assert.match(settings, /APP_THEME_OPTIONS\.map/);
  assert.match(settings, /setAppThemeMode/);
  assert.match(app, /useAppAppearance/);
  assert.match(app, /darkMode \? "light-content" : "dark-content"/);
});

test('V16-V own-message timestamps and bubbles use theme-aware contrast in chat and thread', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(conversation, /palette\.ownTimestamp/);
  assert.match(conversation, /palette\.ownBubble/);
  assert.match(conversation, /palette\.ownMessageText/);
  assert.match(thread, /palette\.ownTimestamp/);
  assert.match(thread, /palette\.ownBubble/);
  assert.match(thread, /palette\.ownMessageText/);
});

test('V16-V pins are visible in chat and can be pinned or unpinned from both actions and pin list', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const details = read('apps/mobile/src/screens/ConversationDetailsModal.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(conversation, /listConversationPins/);
  assert.match(conversation, /pinConversationMessage/);
  assert.match(conversation, /unpinConversationMessage/);
  assert.match(conversation, /📌 Pinned/);
  assert.match(conversation, /Unpin message/);
  assert.match(details, /unpinConversationMessage/);
  assert.match(details, />\s*Unpin message\s*</);
  assert.match(details, /onPinsChanged/);
  assert.match(thread, /📌 Pinned/);
});

test('V16-V saved messages are private local per identity workspace member and open exact message', () => {
  const store = read('apps/mobile/src/saved/savedMessageStore.js');
  const saved = read('apps/mobile/src/screens/SavedMessagesScreen.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(store, /akshaconnect-saved-messages-v1\.json/);
  assert.match(store, /identityId/);
  assert.match(store, /workspaceId/);
  assert.match(store, /workspaceMemberId/);
  assert.match(store, /saveMessageLocally/);
  assert.match(store, /removeSavedMessageLocally/);
  assert.match(saved, /Private to this AkshaConnect account on this device/);
  assert.match(saved, /initialMessageId:\s*row\.message_id/);
  assert.match(home, /label="Saved"/);
  assert.match(home, /SavedMessagesScreen/);
  assert.match(conversation, /Save message/);
  assert.match(conversation, /Remove saved message/);
  assert.match(conversation, /🔖 Saved/);
});

test('V16-V keeps D UX refinements and current Message Info contract', () => {
  const chrome = read('apps/mobile/src/screens/ConversationChrome.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const search = read('apps/mobile/src/screens/ConversationSearchBar.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const info = read('apps/mobile/src/screens/MessageReadersModal.jsx');

  assert.match(chrome, /All emoji/);
  assert.match(chrome, /\.\.\.COMPOSER_EMOJIS/);
  assert.match(conversation, /contentOffset\.y <= 120/);
  assert.match(conversation, /maintainVisibleContentPosition/);
  assert.doesNotMatch(conversation, />\s*Load older messages\s*</);
  assert.match(conversation, /!showMessageSearch \? \([\s\S]*?<ConversationComposer/);
  assert.match(search, /shellMatches:\s*\{\s*flex:\s*1/);
  assert.match(thread, /initialUnreadCount = 0/);
  assert.match(thread, /ConversationEmojiPicker/);
  assert.doesNotMatch(thread, /Previous search result/);
  assert.doesNotMatch(thread, /Next search result/);

  assert.match(info, /Message info/);
  assert.match(info, /Read by/);
  assert.match(info, /Delivered to/);
  assert.match(info, /RefreshControl/);
  assert.doesNotMatch(info, /setInterval\s*\(/);
});

test('V16-V preserves E2 messaging correctness contracts', () => {
  const app = read('apps/mobile/App.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const settings = read('apps/mobile/src/screens/SettingsScreen.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(app, /clearConversationNotificationsReliably/);
  assert.match(home, /if \(status === 'LIVE'\) return 'Online'/);
  assert.match(home, /return 'Offline'/);
  assert.match(settings, /AkshaConnectDateTimePicker/);
  assert.match(settings, /openCustomExpiryPicker/);
  assert.match(settings, /Choose date & time/);
  assert.doesNotMatch(settings, /customExpiryFromLocalText/);
  assert.doesNotMatch(settings, /YYYY-MM-DD HH:MM/);
  assert.match(conversation, /New messages/);
  assert.match(thread, /New messages/);
  assert.match(thread, /findThreadUnreadDivider/);
  assert.doesNotMatch(thread, /parentMessage,\s*\n\s*onRead,/);
});
