'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('R6 native callback store retains callback until JS acknowledges it', () => {
  const source = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectAuthCallbackStore.kt'
  );

  assert.match(source, /CALLBACK_SCHEME = "akshaconnect"/);
  assert.match(source, /CALLBACK_HOST = "auth"/);
  assert.match(source, /CALLBACK_PATH = "\/callback"/);
  assert.match(source, /pendingCallbackUrl = callbackUrl/);
  assert.match(source, /fun peek\(\): String\? = pendingCallbackUrl/);
  assert.match(source, /fun acknowledge\(callbackUrl: String\?\): Boolean/);

  const acknowledge = source.indexOf('fun acknowledge(callbackUrl: String?): Boolean');
  const clear = source.indexOf('pendingCallbackUrl = null', acknowledge);
  assert.ok(clear > acknowledge, 'callback must clear only inside acknowledge');
});

test('R6 native callback bridge actively emits warm callbacks to React Native', () => {
  const application = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt'
  );
  const module = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectAuthBridgeModule.kt'
  );
  const pkg = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectAuthBridgePackage.kt'
  );

  assert.match(application, /add\(AkshaConnectAuthBridgePackage\(\)\)/);
  assert.match(module, /getName\(\): String = "AkshaConnectAuthBridge"/);
  assert.match(module, /DeviceEventManagerModule\.RCTDeviceEventEmitter/);
  assert.match(module, /CALLBACK_EVENT = "AkshaConnectAuthCallback"/);
  assert.match(module, /AkshaConnectAuthCallbackStore\.addListener\(callbackListener\)/);
  assert.match(module, /\.emit\(CALLBACK_EVENT, callbackUrl\)/);
  assert.match(module, /getPendingCallback\(promise: Promise\)/);
  assert.match(module, /acknowledgePendingCallback\(callbackUrl: String, promise: Promise\)/);
  assert.match(pkg, /listOf\(AkshaConnectAuthBridgeModule\(reactContext\)\)/);
});

test('R8A.2 APK version is distinct from prior test builds', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');

  assert.match(gradle, /versionCode 11/);
  assert.match(gradle, /versionName "0\.3\.0-v11"/);
});
