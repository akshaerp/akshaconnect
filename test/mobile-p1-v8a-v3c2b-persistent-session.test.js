'use strict';

const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const root =
  path.resolve(__dirname, '..');


function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}


test('V3C2B uses secure native device credential storage', () => {
  const secure =
    read(
      'apps/mobile/src/auth/deviceSession.js'
    );

  assert.match(
    secure,
    /react-native-keychain/
  );

  assert.match(
    secure,
    /setGenericPassword/
  );

  assert.match(
    secure,
    /getGenericPassword/
  );

  assert.match(
    secure,
    /resetGenericPassword/
  );

  assert.doesNotMatch(
    secure,
    /AsyncStorage|localStorage|sessionStorage/
  );

  assert.doesNotMatch(
    secure,
    /workspaceCode|loginName|currentPassword|newPassword/
  );

  assert.doesNotMatch(
    secure,
    /value\?\.(password|loginPassword|userPassword)/
  );

  /*
   * react-native-keychain's generic credential API
   * itself exposes the encrypted secret through the
   * property named "password". In this module that
   * property contains JSON { serverUrl, deviceToken },
   * never the user's AkshaConnect login password.
   */
  assert.match(
    secure,
    /stored\.password/
  );
});


test('V3C2B uses mobile device-session HTTP endpoints', () => {
  const api =
    read(
      'apps/mobile/src/api/client.js'
    );

  assert.match(
    api,
    /\/api\/v1\/auth\/mobile\/login/
  );

  assert.match(
    api,
    /\/api\/v1\/auth\/mobile\/refresh/
  );

  assert.match(
    api,
    /\/api\/v1\/auth\/mobile\/logout/
  );
});


test('V3C2B restores session before showing login', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /loadDeviceSession/
  );

  assert.match(
    app,
    /restoreDeviceSession/
  );

  assert.match(
    app,
    /showSplash \|\| restoringSession/
  );

  assert.match(
    app,
    /refreshMobile/
  );

  assert.doesNotMatch(
    app,
    /loginLocal/
  );
});


test('V3C2B persists device token only after successful mobile login', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /loginMobile/
  );

  assert.match(
    app,
    /saveDeviceSession/
  );

  assert.match(
    app,
    /device_token/
  );

  assert.match(
    app,
    /delete accessSession\.device_token/
  );
});


test('V3C2B refreshes access sessions during long-lived use', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /refreshDeviceAccess/
  );

  assert.match(
    app,
    /5 \* 60 \* 1000/
  );

  assert.match(
    app,
    /appState !== 'active'/
  );

  assert.match(
    app,
    /60 \* 60 \* 1000/
  );
});


test('V3C2B explicit logout clears local and server device sessions', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /clearDeviceSession/
  );

  assert.match(
    app,
    /logoutMobile/
  );

  assert.match(
    app,
    /credential\.deviceToken/
  );
});


test('V3C2B preserves V3B2 and V3C1 UX', () => {
  const conversation =
    read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );

  assert.match(
    conversation,
    /newMessageDividerId/
  );

  assert.match(
    conversation,
    /Keyboard\.addListener/
  );

  assert.match(
    conversation,
    /keyboardDidShow/
  );

  assert.match(
    conversation,
    /Platform\.OS === 'ios'[\s\S]*\? 'padding'[\s\S]*: 'height'/
  );
});
