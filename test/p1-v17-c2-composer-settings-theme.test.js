'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const parser =
  require('@babel/parser');

const root =
  path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8',
  );
}

function parseModule(rel) {
  parser.parse(
    read(rel),
    {
      sourceType: 'module',
      plugins: ['jsx'],
    },
  );
}

test(
  'V17-C2 mobile composer caps at six lines and scrolls internally',
  () => {
    const chrome =
      read(
        'apps/mobile/src/screens/ConversationChrome.jsx',
      );

    assert.match(
      chrome,
      /CONVERSATION_COMPOSER_MAX_LINES = 6/
    );

    assert.match(
      chrome,
      /scrollEnabled=\{[\s\S]*inputHeight\s*>=\s*composerMaxHeight/
    );

    assert.match(
      chrome,
      /composerInputShell:[\s\S]*borderRadius:\s*22/
    );

    assert.match(
      chrome,
      /sendButton:[\s\S]*width:\s*44[\s\S]*borderRadius:\s*22/
    );

    assert.match(
      chrome,
      /styles\.sendArrow[\s\S]*↑/
    );
  }
);

test(
  'V17-C2 composer keeps attachment emoji and non-Send edit action accessible',
  () => {
    const chrome =
      read(
        'apps/mobile/src/screens/ConversationChrome.jsx',
      );

    assert.match(
      chrome,
      /accessibilityLabel="Attach files"/
    );

    assert.match(
      chrome,
      /accessibilityLabel="Choose emoji"/
    );

    assert.match(
      chrome,
      /sendLabel !== 'Send'[\s\S]*styles\.sendButtonWide/
    );

    assert.match(
      chrome,
      /sendLabel\s*===\s*'Send'/
    );
  }
);

test(
  'V17-C2 Settings uses the active palette instead of forcing light cards',
  () => {
    const settings =
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      );

    assert.doesNotMatch(
      settings,
      /darkMode \? '#F7FAFD'/
    );

    assert.match(
      settings,
      /backgroundColor:[\s\S]*palette\.surface/
    );

    assert.match(
      settings,
      /backgroundColor:[\s\S]*palette\.shell/
    );

    assert.match(
      settings,
      /palette\.textPrimary/
    );

    assert.match(
      settings,
      /palette\.textSecondary/
    );

    assert.match(
      settings,
      /palette\.textMuted/
    );

    assert.match(
      settings,
      /palette\.input/
    );

    assert.match(
      settings,
      /palette\.border/
    );
  }
);

test(
  'V17-C2 Settings theme selection retains readable selected-state contrast in dark mode',
  () => {
    const settings =
      read(
        'apps/mobile/src/screens/SettingsScreen.jsx',
      );

    assert.match(
      settings,
      /palette\.mode === 'dark'[\s\S]*'#183B5F'/
    );

    assert.match(
      settings,
      /APP_THEME_OPTIONS\.map/
    );

    assert.match(
      settings,
      /setAppThemeMode/
    );
  }
);

test(
  'V17-C2 changed React Native sources parse as modules with JSX',
  () => {
    [
      'apps/mobile/src/screens/ConversationChrome.jsx',
      'apps/mobile/src/screens/SettingsScreen.jsx',
    ].forEach(
      parseModule
    );
  }
);


test('V17-C2.1 composer switches from compact one-row to full-width input plus toolbar', () => {
  const chrome =
    read(
      'apps/mobile/src/screens/ConversationChrome.jsx',
    );

  assert.match(
    chrome,
    /const composing =[\s\S]*keyboardVisible/
  );

  assert.match(
    chrome,
    /Keyboard\.addListener\([\s\S]*'keyboardDidShow'/
  );

  assert.match(
    chrome,
    /Keyboard\.addListener\([\s\S]*'keyboardDidHide'/
  );

  assert.doesNotMatch(
    chrome,
    /inputFocused/
  );

  assert.match(
    chrome,
    /composing[\s\S]*styles\.composerExpanded[\s\S]*styles\.composerCompact/
  );

  assert.match(
    chrome,
    /styles\.composerInputShellExpanded/
  );

  assert.match(
    chrome,
    /styles\.composerToolbar/
  );

  assert.match(
    chrome,
    /renderAttachButton\(\{[\s\S]*toolbar: true/
  );

  assert.match(
    chrome,
    /renderEmojiButton\(\{[\s\S]*toolbar: true/
  );

  assert.match(
    chrome,
    /renderSendButton\(\{[\s\S]*toolbar: true/
  );

  assert.match(
    chrome,
    /CONVERSATION_COMPOSER_MAX_LINES = 6/
  );
});


test(
  'V17-C2.4 expanded composer is slim and emoji picker stays open for multi-selection',
  () => {
    const chrome =
      read(
        'apps/mobile/src/screens/ConversationChrome.jsx',
      );

    const conversation =
      read(
        'apps/mobile/src/screens/ConversationScreen.jsx',
      );

    const thread =
      read(
        'apps/mobile/src/screens/ThreadModal.jsx',
      );

    assert.match(
      chrome,
      /composerExpanded:[\s\S]*paddingTop:\s*4[\s\S]*paddingBottom:\s*4/
    );

    assert.match(
      chrome,
      /composerToolbar:[\s\S]*marginTop:\s*3/
    );

    assert.match(
      chrome,
      /toolbarActionButton:[\s\S]*width:\s*36[\s\S]*height:\s*36/
    );

    assert.match(
      chrome,
      /toolbarAttachButton:[\s\S]*width:\s*36[\s\S]*height:\s*36/
    );

    assert.match(
      chrome,
      /toolbarSendButton:[\s\S]*width:\s*36[\s\S]*height:\s*36/
    );

    const mainEmojiStart =
      conversation.indexOf(
        'function insertEmoji(emoji)'
      );

    const mainEmojiEnd =
      conversation.indexOf(
        'async function reactToMessage',
        mainEmojiStart
      );

    assert.ok(
      mainEmojiStart >= 0 &&
      mainEmojiEnd > mainEmojiStart
    );

    const mainEmoji =
      conversation.slice(
        mainEmojiStart,
        mainEmojiEnd
      );

    assert.doesNotMatch(
      mainEmoji,
      /setShowEmojiPicker\(false\)/
    );

    const threadEmojiStart =
      thread.indexOf(
        'function insertThreadEmoji(emoji)'
      );

    const threadEmojiEnd =
      thread.indexOf(
        'async function submit',
        threadEmojiStart
      );

    assert.ok(
      threadEmojiStart >= 0 &&
      threadEmojiEnd > threadEmojiStart
    );

    const threadEmoji =
      thread.slice(
        threadEmojiStart,
        threadEmojiEnd
      );

    assert.doesNotMatch(
      threadEmoji,
      /setShowEmojiPicker\(false\)/
    );
  }
);
