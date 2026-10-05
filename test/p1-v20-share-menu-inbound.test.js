'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V20 image options use an isolated modal so outside tap cannot be stolen by image gestures', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(
    viewer,
    /<Modal[\s\S]*visible=\{menuOpen\}[\s\S]*accessibilityLabel="Close image options"/
  );
  assert.match(viewer, /styles\.optionsModalBackdrop/);
  assert.match(viewer, /styles\.optionsModalMenu/);
  assert.match(viewer, /onRequestClose=\{\(\)\s*=>[\s\S]*setMenuOpen/);
});

test('V20 outbound share streams authenticated image and opens Android chooser without predownload', () => {
  const module = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectMediaModule.kt'
  );
  const provider = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectRemoteShareProvider.kt'
  );
  const main = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(module, /shareRemoteImage/);
  assert.match(provider, /ParcelFileDescriptor\.createPipe/);
  assert.match(provider, /Authorization/);

  const mainShare = main.slice(
    main.indexOf('async function handleSharePreviewAttachment'),
    main.indexOf('async function handleForwardPreviewAttachment')
  );
  assert.match(mainShare, /shareRemoteImage/);
  assert.doesNotMatch(mainShare, /downloadAttachmentToCache/);

  const threadShare = thread.slice(
    thread.indexOf('async function shareThreadPreview'),
    thread.indexOf('function insertThreadEmoji')
  );
  assert.match(threadShare, /shareRemoteImage/);
  assert.doesNotMatch(threadShare, /downloadAttachmentToCache/);
});

test('V20 Android manifest registers AkshaConnect as an image share target', () => {
  const manifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(manifest, /android\.intent\.action\.SEND_MULTIPLE/);
  assert.match(manifest, /android:mimeType="image\/\*"/);
  assert.match(manifest, /\.AkshaConnectRemoteShareProvider/);
});

test('V20 incoming Android shares are captured and routed to AkshaConnect conversations', () => {
  const activity = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainActivity.kt'
  );
  const application = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/MainApplication.kt'
  );
  const app = read('apps/mobile/App.jsx');

  assert.match(activity, /AkshaConnectInboundShareStore\.capture/);
  assert.match(application, /AkshaConnectInboundSharePackage/);
  assert.match(app, /AkshaConnectInboundShare/);
  assert.match(app, /InboundShareModal/);
  assert.match(app, /uploadAttachment/);
  assert.match(app, /Share image to/);
});
