'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createMobileVersionPolicyFromEnv,
} = require('../services/api/src/mobile/mobileVersionPolicy');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V15-A mobile message actions expose Forward and route targets through existing DM/channel APIs', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /label:\s*'Forward'/);
  assert.match(conversation, /openForwardMessage/);
  assert.match(conversation, /listChannels\(/);
  assert.match(conversation, /listDirectMessages\(/);
  assert.match(conversation, /forwardMessageToTarget/);
  assert.match(conversation, /sendMessage\(/);
  assert.match(conversation, /uploadAttachment\(/);
  assert.match(conversation, /downloadAttachmentToCache\(/);
  assert.match(conversation, /Forward message/);
  assert.match(conversation, /Choose a chat or channel/);
  assert.match(conversation, /Search people or channels/);
  assert.match(conversation, /filteredForwardTargets/);
});


test('V15-A attachment cards expose the same long-press message actions as text messages', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /imageAttachments\.map/);
  assert.match(conversation, /fileAttachments\.map/);
  assert.match(conversation, /delayLongPress=\{350\}/);
  assert.match(
    conversation,
    /onLongPress=\{(?:\(\)|\(event\))\s*=>[\s\S]*onManageMessage\?\.\(\s*message,\s*onReplyInThread/s
  );
});

test('V15-A composer shows actual attachment count and explains the four-file maximum on overflow', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /pendingAttachments\.length === 1/);
  assert.match(conversation, /'attachment'/);
  assert.match(conversation, /'attachments'/);
  assert.doesNotMatch(
    conversation,
    /\{pendingAttachments\.length\}\s*\/\s*\{MAX_PENDING_ATTACHMENTS\}/
  );
  assert.match(
    conversation,
    /Maximum \$\{MAX_PENDING_ATTACHMENTS\} attachments can be sent at a time\./
  );
});

test('V15-A image preview uses conversation gallery position instead of a hard-coded single item count', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /conversationImageAttachments/);
  assert.match(conversation, /galleryIndex/);
  assert.match(conversation, /galleryTotal/);
  assert.match(conversation, /openImagePreviewAtIndex/);
  assert.match(conversation, /accessibilityLabel="Previous image"/);
  assert.match(conversation, /accessibilityLabel="Next image"/);
  assert.doesNotMatch(conversation, /['"`]1\s*\/\s*1['"`]/);
});

test('V15-A update policy fallback advertises accepted V14 when deployment env is absent', () => {
  const policy = createMobileVersionPolicyFromEnv({})('ANDROID');

  assert.equal(policy.latest_version_code, 14);
  assert.equal(policy.latest_version_name, '0.3.0-v14');
  assert.equal(policy.minimum_version_code, 13);
  assert.match(policy.update_url, /com\.akshaerp\.akshaconnect/);
});

test('V15-A update policy still honors deployment overrides', () => {
  const policy = createMobileVersionPolicyFromEnv({
    AKSHACONNECT_ANDROID_LATEST_VERSION_CODE: '15',
    AKSHACONNECT_ANDROID_LATEST_VERSION_NAME: '0.4.0-v15',
    AKSHACONNECT_ANDROID_MINIMUM_VERSION_CODE: '14',
  })('ANDROID');

  assert.equal(policy.latest_version_code, 15);
  assert.equal(policy.latest_version_name, '0.4.0-v15');
  assert.equal(policy.minimum_version_code, 14);
});

test('V15-A feature coverage remains valid on the current VC18 Android identity', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 18/);
  assert.match(gradle, /versionName "0\.3\.0-v18"/);
});


test('V15-A R3 renders authenticated inline image thumbnails and keeps tap/long-press semantics separate', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /messageImageGrid/);
  assert.match(conversation, /messageImageThumbnail/);
  assert.match(conversation, /remoteImageSource/);
  assert.match(conversation, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(conversation, /onPress=\{\(event\) => \{[\s\S]*onPreviewAttachment\?\.\(item\)/);
  assert.match(conversation, /onLongPress=\{\(event\) => \{[\s\S]*onManageMessage\?\.\(/);
  assert.match(conversation, /Tap to preview\. Long press for message actions/);
});

test('V15-A R3 image copy uses explicit image MIME clipboard data and confirms success', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const clipboard = read(
    'apps/mobile/android/app/src/main/java/com/akshaerp/akshaconnect/AkshaConnectClipboardModule.kt'
  );

  assert.match(conversation, /'Image copied'/);
  assert.match(conversation, /accept image clipboard content/);
  assert.match(clipboard, /ClipData\.newUri/);
      assert.match(clipboard, /clipboard\.primaryClip/);
  assert.match(clipboard, /AKSHACONNECT_CLIPBOARD_IMAGE_VERIFY_FAILED/);
  assert.match(clipboard, /verifyReadableUri\(uri\)/);
  assert.match(clipboard, /pruneOldClipboardImages/);
});

test('V15-A R3 shows attachment totals without positional 1-of-N copy and enforces four', () => {
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(conversation, /Maximum \$\{MAX_PENDING_ATTACHMENTS\} attachments can be sent at a time/);
  assert.match(conversation, /previewAttachment\.galleryTotal[\s\S]*\? 'image'[\s\S]*: 'images'/);
  assert.doesNotMatch(conversation, /galleryIndex[\s\S]{0,180}\/[\s\S]{0,180}galleryTotal/);
});
