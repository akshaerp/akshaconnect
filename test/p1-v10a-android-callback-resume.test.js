'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V10A Android captures callback before ReactActivity handles cold and warm intents', () => {
  const source = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainActivity.kt'
  );

  assert.match(source, /override fun onCreate\(savedInstanceState: Bundle\?\)/);
  assert.match(source, /AkshaConnectAuthCallbackStore\.capture\(intent\)/);
  assert.match(source, /override fun onNewIntent\(intent: Intent\)/);

  const start = source.indexOf('override fun onNewIntent(intent: Intent)');
  const capture = source.indexOf('AkshaConnectAuthCallbackStore.capture(intent)', start);
  const setIntent = source.indexOf('setIntent(intent)', start);
  const superCall = source.indexOf('super.onNewIntent(intent)', start);

  assert.ok(capture > start);
  assert.ok(setIntent > capture);
  assert.ok(superCall > setIntent);

  assert.match(source, /override fun onResume\(\)/);
  const resume = source.indexOf('override fun onResume()');
  const nativeRetry = source.indexOf('AkshaConnectAuthCallbackStore.notifyPending()', resume);
  assert.ok(nativeRetry > resume, 'native lifecycle must re-notify any pending callback');

});

test('R6 Android receives native callback event and keeps Linking fallbacks', () => {
  const source = read('apps/mobile/App.jsx');

  assert.match(source, /DeviceEventEmitter/);
  assert.match(source, /NativeModules/);
  assert.match(source, /AkshaConnectAuthBridge/);
  assert.match(
    source,
    /DeviceEventEmitter\.addListener\(\s*'AkshaConnectAuthCallback'/
  );
  assert.match(source, /getPendingCallback/);
  assert.match(source, /acknowledgePendingCallback/);
  assert.match(source, /Linking\.addEventListener\('url', processMobileAuthUrl\)/);
  assert.match(source, /AppState\.addEventListener\('focus', handleMobileAuthFocus\)/);
  assert.match(source, /scheduleRetainedMobileAuthRead/);
});

test('R6 callback suppresses only concurrent duplicates and preserves retry before exchange', () => {
  const source = read('apps/mobile/App.jsx');

  assert.match(source, /processingMobileAuthCallbackUrlRef/);
  assert.match(source, /completedMobileAuthCallbackUrlRef/);
  assert.doesNotMatch(source, /lastMobileAuthCallbackUrlRef/);

  const processing = source.indexOf(
    'processingMobileAuthCallbackUrlRef.current = callbackUrl;'
  );
  const completion = source.indexOf(
    'completeMobileAuthorization(callbackUrl)',
    processing
  );
  const release = source.indexOf(
    "processingMobileAuthCallbackUrlRef.current = '';",
    completion
  );

  assert.ok(processing >= 0, 'callback must be marked in-flight');
  assert.ok(completion > processing, 'completion must start after in-flight marker');
  assert.ok(release > completion, 'in-flight marker must be released after completion attempt');

  assert.match(source, /acknowledgePendingCallback\?\.\(callbackUrl\)/);
});
