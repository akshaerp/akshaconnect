'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V15-A1 mobile uses the controlled message action sheet and V16-L compact action model', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const sheet = read('apps/mobile/src/screens/MessageActionSheet.jsx');

  assert.match(conversation, /MessageActionSheet/);
  assert.match(conversation, /function messageActionItems\(\)/);
  assert.match(conversation, /key:\s*'thread'/);
  assert.match(conversation, /key:\s*'copy'/);
  assert.match(conversation, /key:\s*'edit'/);
  assert.match(conversation, /key:\s*'delete'/);
  assert.match(conversation, /destructive:\s*true/);
  assert.doesNotMatch(conversation, /Alert\.alert\(\s*'Message actions'/);

  assert.match(sheet, /actions\.map\(\(action\)\s*=>/);
  assert.match(sheet, /\{action\.icon\s*\|\|\s*'·'\}/);
  assert.match(sheet, /\{action\.label\}/);
  assert.match(sheet, /accessibilityLabel="Quick reactions"/);
  assert.match(sheet, /onRequestClose=\{onClose\}/);
  assert.match(sheet, /onPress=\{onClose\}/);
  assert.match(sheet, />Cancel<\/Text>/);
  assert.match(sheet, /accessibilityLabel="Close"/);
});

test('V15-A1 Android provides native clipboard bridge without adding a third-party clipboard dependency', () => {
  const application = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt');
  const module = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardModule.kt');
  const pkg = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardPackage.kt');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(application, /add\(AkshaConnectClipboardPackage\(\)\)/);
  assert.match(module, /ClipboardManager/);
  assert.match(module, /ClipData\.newPlainText/);
  assert.match(pkg, /AkshaConnectClipboardModule/);
  assert.match(conversation, /NativeModules\.AkshaConnectClipboard/);
});

test('V15-A1.1 image Copy places image content on Android clipboard instead of copying only the file name', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const module = read('apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardModule.kt');
  const manifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
  const paths = read('apps/mobile/android/app/src/main/res/xml/akshaconnect_clipboard_paths.xml');

  assert.match(conversation, /clipboard\.setImage/);
  assert.match(conversation, /downloadAttachmentToCache/);
  assert.match(conversation, /'Copy image'/);
  assert.match(module, /fun setImage/);
  assert.match(module, /ClipData\.newUri/);
  assert.match(module, /FileProvider\.getUriForFile/);
  assert.match(manifest, /\$\{applicationId\}\.clipboard\.fileprovider/);
  assert.match(manifest, /@xml\/akshaconnect_clipboard_paths/);
  assert.match(paths, /akshaconnect-clipboard\//);
});

test('V15-A1 conversation detail ribbons use accepted AkshaConnect primary blue on mobile and web', () => {
  const mobile = read('apps/mobile/src/screens/ConversationDetailsModal.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const web = read('apps/web/src/conversationDetails.css');

  assert.match(mobile, /backgroundColor:\s*colors\.primary/);
  assert.match(mobile, /<StatusBar[\s\S]*backgroundColor=\{colors\.primary\}/);
  assert.match(conversation, /peopleHeader:[\s\S]*backgroundColor:\s*colors\.primary/);
  assert.match(web, /\.conversation-details-header\s*\{[\s\S]*background:\s*#0879e7/);
  assert.doesNotMatch(web, /background:\s*#082a61/);
});

test('V15-A1 web main conversation exposes copy action', () => {
  const app = read('apps/web/src/App.jsx');
  assert.match(app, /copyTextToClipboard/);
  assert.match(app, /aria-label="Copy message"/);
});

test('V15-A1 feature coverage remains valid on the current VC21 Android identity', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 21/);
  assert.match(gradle, /versionName "0\.3\.0-v21"/);
});
