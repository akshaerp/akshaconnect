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

  assert.match(
    api,
    /\/api\/v1\/auth\/mobile\/exchange/
  );
});


test('V10A restores the active saved organization before showing discovery login', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /loadDeviceAccounts/
  );

  assert.match(
    app,
    /activateAccount/
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


test('V10A persists a device token only after one-time mobile authorization exchange', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  const exchangeAt = app.indexOf('exchangeMobileAuthorization(');
  const saveAt = app.indexOf('saveDeviceAccount({', exchangeAt);

  assert.ok(exchangeAt >= 0, 'mobile authorization exchange is missing');
  assert.ok(saveAt > exchangeAt, 'device account must be saved only after exchange');

  assert.match(
    app,
    /device_token/
  );

  assert.match(
    app,
    /delete accessSession\.device_token/
  );

  assert.match(
    app,
    /exchangeSecret:\s*pending\.exchangeSecret/
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


test('V10A explicit organization logout clears local and server device sessions', () => {
  const app =
    read(
      'apps/mobile/App.jsx'
    );

  assert.match(
    app,
    /removeDeviceAccount/
  );

  assert.match(
    app,
    /logoutMobile/
  );

  assert.match(
    app,
    /credential\.deviceToken/
  );

  assert.match(
    app,
    /credential\.accountId/
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
