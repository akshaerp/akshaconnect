'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('V16-E Android image clipboard uses FileProvider-backed ClipData.newUri', () => {
  const module = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardModule.kt');
  assert.match(module, /ClipData\.newUri\(/);
  assert.match(module, /FileProvider\.getUriForFile\(/);
  assert.match(module, /verifyReadableUri\(uri\)/);
  assert.match(module, /pruneOldClipboardImages\(clipboardDirectory, destination\)/);
  assert.doesNotMatch(module, /clipboardDirectory\.listFiles\(\)\?\.forEach/);
});

test('V16-E clipboard FileProvider is registered and restricted to clipboard cache', () => {
  const manifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
  const paths = read('apps/mobile/android/app/src/main/res/xml/akshaconnect_clipboard_paths.xml');
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(manifest, /\.clipboard\.fileprovider/);
  assert.match(manifest, /android:grantUriPermissions="true"/);
  assert.match(paths, /path="akshaconnect-clipboard\/"/);
});

test('V16-E native clipboard package is explicitly registered', () => {
  const main = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt');
  const pkg = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardPackage.kt');
  assert.match(main, /add\(AkshaConnectClipboardPackage\(\)\)/);
  assert.match(pkg, /AkshaConnectClipboardModule\(reactContext\)/);
});

test('V16-E mobile copy action downloads image and invokes native image clipboard', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(screen, /NativeModules\.AkshaConnectClipboard/);
  assert.match(screen, /downloadAttachmentToCache\(/);
  assert.match(screen, /await clipboard\.setImage\(/);
  assert.match(screen, /Image copied/);
});
