'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('V4A mobile brand foundation uses approved copy and theme tokens', () => {
  const colors = read('apps/mobile/src/theme/colors.js');
  const app = read('apps/mobile/App.jsx');
  const login = read('apps/mobile/src/screens/LoginScreen.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');

  assert.match(colors, /brandNavy:\s*'#0E2455'/);
  assert.match(colors, /brandBlue:\s*'#0879E7'/);
  assert.match(colors, /brandGreen:\s*'#54D053'/);
  assert.match(colors, /brandOrange:\s*'#EF5E1B'/);

  assert.match(app, /PEOPLE\s+•\s+IDEAS\s+•\s+TOGETHER/);
  assert.match(app, /A BRIGHTER WORKPLACE TOGETHER/);
  assert.match(login, /PEOPLE\s+•\s+IDEAS\s+•\s+TOGETHER/);
  assert.match(home, /PEOPLE\s+•\s+IDEAS\s+•\s+TOGETHER/);

  assert.doesNotMatch(app, /PEOPLE\s+•\s+TEAMS\s+•\s+TOGETHER/);
  assert.doesNotMatch(login, /â€¢/);
});

test('V4A splash and login use the approved wordmark asset', () => {
  const app = read('apps/mobile/App.jsx');
  const login = read('apps/mobile/src/screens/LoginScreen.jsx');

  assert.match(
    app,
    /akshaconnect-wordmark\.png/
  );

  assert.match(
    login,
    /akshaconnect-wordmark\.png/
  );

  assert.ok(
    fs.existsSync(
      path.join(
        root,
        'apps/mobile/src/assets/brand/akshaconnect-wordmark.png'
      )
    )
  );
});

test('V4A session restore removes the placeholder A mark', () => {
  const restore = read(
    'apps/mobile/src/screens/SessionRestoreScreen.jsx'
  );

  assert.match(
    restore,
    /akshaconnect-mark\.png/
  );

  assert.match(
    restore,
    /akshaconnect-wordmark\.png/
  );

  assert.doesNotMatch(
    restore,
    /<Text style=\{styles\.markText\}>/
  );

  assert.match(
    restore,
    /A BRIGHTER WORKPLACE TOGETHER/
  );
});

test('V4A conversation uses primary blue with green live state', () => {
  const conversation = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    conversation,
    /borderBottomColor:\s*colors\.primary/
  );

  assert.match(
    conversation,
    /backgroundColor:\s*colors\.primary/
  );

  assert.match(
    conversation,
    /backgroundColor:\s*colors\.brandGreen/
  );
});

test('V4A3R1C login is single-view and home uses light brand navigation', () => {
  const login = read(
    'apps/mobile/src/screens/LoginScreen.jsx'
  );
  const home = read(
    'apps/mobile/src/screens/HomeScreen.jsx'
  );

  assert.doesNotMatch(login, /ScrollView/);
  assert.match(login, /<View style=\{styles\.page\}>/);

  assert.match(
    home,
    /topBar:[\s\S]*backgroundColor:\s*colors\.surface/
  );

  assert.match(
    home,
    /tabs:[\s\S]*backgroundColor:\s*colors\.surface/
  );

  assert.match(
    home,
    /tabTextActive:[\s\S]*color:\s*colors\.brandNavy/
  );

  assert.match(
    home,
    /tabIndicatorActive:[\s\S]*backgroundColor:\s*colors\.primary/
  );
});

test('V4A3R1C hides both Home vertical scroll indicators', () => {
  const home = read(
    'apps/mobile/src/screens/HomeScreen.jsx'
  );

  const matches =
    home.match(
      /showsVerticalScrollIndicator=\{false\}/g
    ) || [];

  assert.equal(matches.length, 2);
});