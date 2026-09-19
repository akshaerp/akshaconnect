const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

test('V4B1 pins the native file picker and binary foundation', () => {
  const mobilePackage = JSON.parse(
    read('apps/mobile/package.json')
  );

  assert.equal(
    mobilePackage.dependencies[
      '@react-native-documents/picker'
    ],
    '12.0.2'
  );

  assert.equal(
    mobilePackage.dependencies[
      'react-native-blob-util'
    ],
    '0.25.0'
  );

  assert.equal(
    mobilePackage.devDependencies[
      '@react-native/gradle-plugin'
    ],
    '0.87.0'
  );
});

test('V4B1 mobile picker matches the existing backend attachment limits', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /@react-native-documents\/picker/
  );
  assert.match(
    screen,
    /MAX_PENDING_ATTACHMENTS = 4/
  );
  assert.match(
    screen,
    /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/
  );
  assert.match(
    screen,
    /allowMultiSelection:\s*true/
  );
  assert.match(
    screen,
    /mode:\s*'import'/
  );

  for (const contentType of [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'wordprocessingml.document',
    'spreadsheetml.sheet',
    'presentationml.presentation',
  ]) {
    assert.match(
      screen,
      new RegExp(
        contentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
    );
  }
});

test('V4B1 picker validation and preview remain present as later V4B stages extend sending', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(screen, /pendingAttachments/);
  assert.match(screen, /chooseAttachments/);
  assert.match(screen, /removePendingAttachment/);
  assert.match(screen, /formatFileSize/);
  assert.match(screen, /attachmentBadge/);
  assert.match(screen, />\s*Attachments\s*</);
  assert.match(screen, /accessibilityLabel="Attach files"/);
  assert.match(
    screen,
    /errorCodes\.OPERATION_CANCELED/
  );

});

test('V4B1 does not request broad Android storage permission', () => {
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  assert.doesNotMatch(
    manifest,
    /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/
  );
});

test('V4B native build topology is reproducible after npm ci', () => {
  const rootPackage = JSON.parse(
    read('package.json')
  );
  const helper = read(
    'scripts/ensure-mobile-rn-gradle-plugin.js'
  );

  assert.equal(
    rootPackage.scripts.postinstall,
    'node scripts/ensure-mobile-rn-gradle-plugin.js'
  );

  assert.match(
    helper,
    /@react-native[\s\S]*gradle-plugin/
  );
  assert.match(
    helper,
    /@react-native[\s\S]*codegen/
  );
  assert.match(
    helper,
    /combine-js-to-schema-cli\.js/
  );
});
