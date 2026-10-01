'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (rel) =>
  fs.readFileSync(path.join(root, rel), 'utf8');

function parse(rel) {
  const source = read(rel);
  assert.doesNotThrow(() => {
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    });
  });
  return source;
}

test('V16-S emoji picker always keeps full catalogue and is shared by main chat and thread', () => {
  const chrome = parse('apps/mobile/src/screens/ConversationChrome.jsx');
  const conversation = parse('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = parse('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(chrome, /export const COMPOSER_EMOJIS/);
  assert.match(chrome, /ConversationEmojiPicker/);
  assert.match(chrome, /\.\.\.\(recentEmojis \|\| \[\]\)/);
  assert.match(chrome, /\.\.\.COMPOSER_EMOJIS/);

  assert.match(conversation, /ConversationEmojiPicker/);
  assert.match(conversation, /allEmojis=\{COMPOSER_EMOJIS\}/);
  assert.match(conversation, /loadRecentEmojis/);
  assert.match(conversation, /saveRecentEmojis/);

  assert.match(thread, /ConversationEmojiPicker/);
  assert.match(thread, /onEmojiPress=/);
  assert.match(thread, /loadRecentEmojis/);
  assert.match(thread, /saveRecentEmojis/);
});

test('V16-S automatically loads earlier messages near the top and removes the manual Load older button', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /contentOffset\.y <= 120/);
  assert.match(conversation, /loadingOlderRef\.current/);
  assert.match(conversation, /maintainVisibleContentPosition/);
  assert.match(conversation, /Loading earlier messages/);
  assert.doesNotMatch(conversation, />\s*Load older messages\s*</);
});

test('V16-S search uses the screen as a dedicated search surface without the composer or blue blank region', () => {
  const conversation = parse('apps/mobile/src/screens/ConversationScreen.jsx');
  const search = parse('apps/mobile/src/screens/ConversationSearchBar.jsx');

  assert.match(conversation, /!showMessageSearch \? \([\s\S]*?<ConversationComposer/);
  assert.match(conversation, /backgroundColor:\s*colors\.shell/);
  assert.match(search, /mode === 'matches' \? styles\.shellMatches/);
  assert.match(search, /shellMatches:\s*\{\s*flex:\s*1/);
  assert.match(search, /resultsCard:\s*\{\s*flex:\s*1/);
  assert.doesNotMatch(search, /maxHeight:\s*270/);
});

test('V16-S keeps search arrows in the search surface but removes them from the thread header', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const search = read('apps/mobile/src/screens/ConversationSearchBar.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(search, /Previous search result/);
  assert.match(search, /Next search result/);
  assert.match(screen, /initialMessageId=\{threadSearchTargetMessageId\}/);
  assert.doesNotMatch(screen, /searchNavigation=/);
  assert.doesNotMatch(thread, /searchNavigation/);
  assert.doesNotMatch(thread, /Previous search result/);
  assert.doesNotMatch(thread, /Next search result/);
});

test('V16-S adds persistent app text-size choices with a slightly larger default', () => {
  const store = parse('apps/mobile/src/theme/appearanceStore.js');
  const text = parse('apps/mobile/src/theme/AppText.jsx');
  const input = parse('apps/mobile/src/theme/AppTextInput.jsx');
  const settings = parse('apps/mobile/src/screens/SettingsScreen.jsx');

  assert.match(store, /akshaconnect-appearance-v1\.json/);
  assert.match(store, /key:\s*'standard'/);
  assert.match(store, /key:\s*'comfortable'/);
  assert.match(store, /scale:\s*1\.06/);
  assert.match(store, /key:\s*'large'/);
  assert.match(store, /DEFAULT_TEXT_SIZE_MODE = 'comfortable'/);
  assert.match(text, /useAppAppearance/);
  assert.match(input, /forwardRef/);
  assert.match(settings, /SectionTitle title="APPEARANCE"/);
  assert.match(settings, /setAppTextSizeMode/);
  assert.match(settings, /APP_TEXT_SIZE_OPTIONS\.map/);
});

test('V16-S applies scalable app text to the principal authenticated communication surfaces', () => {
  const files = [
    'apps/mobile/src/screens/HomeScreen.jsx',
    'apps/mobile/src/screens/SettingsScreen.jsx',
    'apps/mobile/src/screens/ConversationScreen.jsx',
    'apps/mobile/src/screens/ConversationDetailsModal.jsx',
    'apps/mobile/src/screens/ThreadModal.jsx',
    'apps/mobile/src/screens/ConversationSearchBar.jsx',
    'apps/mobile/src/screens/MessageReadersModal.jsx',
    'apps/mobile/src/screens/MessageActionSheet.jsx',
    'apps/mobile/src/screens/ConversationChrome.jsx',
  ];

  for (const rel of files) {
    const source = read(rel);
    assert.match(
      source,
      /AppText/,
      `${rel} must consume scalable AppText`
    );
  }
});


test('V16-S reader details avoids misleading Read by 0 while loading or unavailable', () => {
  const readers = parse('apps/mobile/src/screens/MessageReadersModal.jsx');

  assert.match(readers, /const firstLoadPending/);
  assert.match(readers, /firstLoadPending \|\| error/);
  assert.match(readers, /title=\{headerTitle\}/);
  assert.match(readers, /subtitle=\{headerSubtitle\}/);
  assert.match(readers, /Reader details are unavailable for this message/);
  assert.doesNotMatch(readers, /Could not load readers \(\$\{response\.status\}\)/);
});
