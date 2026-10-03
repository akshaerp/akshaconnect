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
  assert.doesNotThrow(() => {
    parser.parse(read(rel), {
      sourceType: 'module',
      plugins: ['jsx'],
    });
  });
}

test('V18 phone-level font scaling cannot break AkshaConnect layout', () => {
  const text = read('apps/mobile/src/theme/AppText.jsx');
  const input = read('apps/mobile/src/theme/AppTextInput.jsx');

  assert.match(text, /allowFontScaling = false/);
  assert.match(text, /allowFontScaling=\{allowFontScaling\}/);
  assert.match(input, /allowFontScaling = false/);
  assert.match(input, /allowFontScaling=\{allowFontScaling\}/);
});

test('V18 home creation sheets stay reachable above the keyboard', () => {
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');

  assert.match(home, /KeyboardAvoidingView/);
  assert.match(home, /Platform\.OS === 'ios' \? 'padding' : 'height'/);
  assert.match(home, /visible=\{composerMode === 'channel'\}[\s\S]*keyboardShouldPersistTaps="handled"/);
  assert.match(home, /channelModalContent/);
});

test('V18 mobile shell protects brand tabs and settings from text wrapping', () => {
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const settings = read('apps/mobile/src/screens/SettingsScreen.jsx');

  assert.match(home, /style=\{styles\.brandText\}[\s\S]*numberOfLines=\{1\}/);
  assert.match(home, /styles\.tabText[\s\S]*numberOfLines=\{1\}/);
  assert.match(home, /brandLogo:[\s\S]*width:\s*46[\s\S]*height:\s*46/);
  assert.match(settings, /styles\.rowLabel[\s\S]*numberOfLines=\{1\}/);
});

test('V18 responsive React Native sources parse', () => {
  [
    'apps/mobile/src/theme/AppText.jsx',
    'apps/mobile/src/theme/AppTextInput.jsx',
    'apps/mobile/src/screens/HomeScreen.jsx',
    'apps/mobile/src/screens/SettingsScreen.jsx',
  ].forEach(parse);
});

test('V18 keeps launcher baseline and uses the dedicated notification icon', () => {
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  const notifications = read(
    'apps/mobile/src/notifications/nativeNotifications.js'
  );

  assert.match(
    manifest,
    /com\.google\.firebase\.messaging\.default_notification_icon[\s\S]*@drawable\/ic_notification/
  );

  assert.match(
    notifications,
    /smallIcon:\s*'ic_notification'/
  );

  assert.ok(
    fs.existsSync(
      path.join(
        root,
        'apps/mobile/android/app/src/main/res/drawable/ic_notification.png'
      )
    )
  );

  assert.equal(
    fs.existsSync(
      path.join(
        root,
        'apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'
      )
    ),
    false
  );
});
