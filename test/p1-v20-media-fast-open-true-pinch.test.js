'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V20 image preview opens without downloading the complete image first', () => {
  const main = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  const mainOpen = main.slice(
    main.indexOf('function openImagePreviewAtIndex'),
    main.indexOf('async function handlePreviewAttachment')
  );

  assert.doesNotMatch(mainOpen, /downloadAttachmentToCache/);
  assert.match(mainOpen, /setPreviewAttachment/);

  const threadOpen = thread.slice(
    thread.indexOf('function openThreadImageAtIndex'),
    thread.indexOf('async function openAttachment')
  );

  assert.doesNotMatch(threadOpen, /downloadAttachmentToCache/);
  assert.match(threadOpen, /setPreviewAttachment/);

  assert.match(main, /source=\{[\s\S]*Authorization:[\s\S]*Bearer/);
  assert.match(thread, /source=\{[\s\S]*Authorization:[\s\S]*Bearer/);
  assert.match(viewer, /ActivityIndicator/);
});

test('V20 direct touch events provide true continuous pinch zoom', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.doesNotMatch(viewer, /PanResponder/);
  assert.match(viewer, /onTouchStart=\{/);
  assert.match(viewer, /onTouchMove=\{/);
  assert.match(viewer, /onTouchEnd=\{/);
  assert.match(viewer, /beginPinch/);
  assert.match(viewer, /distance\s*\/[\s\S]*gesture\.startDistance/);
  assert.match(viewer, /MAX_SCALE = 5/);
  assert.match(viewer, /pointerEvents="none"/);
  assert.match(viewer, /lastTapRef/);
});

test('V20 share opens Android chooser without full-image predownload', () => {
  const main = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  const mainShare = main.slice(
    main.indexOf('async function handleSharePreviewAttachment'),
    main.indexOf('async function handleForwardPreviewAttachment')
  );

  const threadShare = thread.slice(
    thread.indexOf('async function shareThreadPreview'),
    thread.indexOf('function insertThreadEmoji')
  );

  assert.doesNotMatch(mainShare, /downloadAttachmentToCache/);
  assert.match(mainShare, /media\.shareRemoteImage/);

  assert.doesNotMatch(threadShare, /downloadAttachmentToCache/);
  assert.match(threadShare, /media\.shareRemoteImage/);
});

test('V20 options outside-tap dismissal remains present', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(viewer, /accessibilityLabel="Close image options"/);
  assert.match(viewer, /menuBackdrop/);
});
