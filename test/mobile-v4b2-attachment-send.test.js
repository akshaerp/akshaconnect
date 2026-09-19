const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('V4B2 mobile uploads raw attachment bytes through the existing authorized endpoint', () => {
  const client = read('apps/mobile/src/api/client.js');

  assert.match(client, /react-native-blob-util/);
  assert.match(client, /\/api\/v1\/conversations\//);
  assert.match(client, /\/attachments/);
  assert.match(client, /'x-akshaconnect-file-name'/);
  assert.match(client, /'x-client-message-id'/);
  assert.match(client, /blobUtil\.wrap\(localPath\)/);
  assert.match(client, /uploadProgress/);
  assert.doesNotMatch(client, /FormData/);
});

test('V4B2 creates a cache-local upload copy instead of requesting broad storage access', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  assert.match(screen, /keepLocalCopy/);
  assert.match(screen, /destination:\s*'cachesDirectory'/);
  assert.match(screen, /ReactNativeBlobUtil\.fs\.unlink/);

  assert.doesNotMatch(
    manifest,
    /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/
  );
});

test('V4B2 keeps stable attachment client ids across failed retries and removes only acknowledged files', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(screen, /clientMessageId:\s*pending\.clientMessageId/);
  assert.match(screen, /uploadStatus:\s*'failed'/);
  assert.match(screen, /uploadStatus:\s*'uploading'/);
  assert.match(screen, /Retry/);
  assert.match(screen, /item\.clientMessageId !==[\s\S]*pending\.clientMessageId/);
});

test('V4B2 enables file-only send and prevents acknowledged text from being resent after attachment failure', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(
    screen,
    /draft\.trim\(\)\.length > 0 \|\|[\s\S]*pendingAttachments\.length > 0/
  );
  assert.match(
    screen,
    /setDraft\(''\);[\s\S]*for \(const pending of attachmentsToSend\)/
  );
  assert.match(screen, /Could not send message or attachment/);
});

test('V4B2 durable attachment send remains present as later V4B stages extend attachment UX', () => {
  const client = read(
    'apps/mobile/src/api/client.js'
  );
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    client,
    /export async function uploadAttachment/
  );
  assert.match(
    screen,
    /clientMessageId:\s*pending\.clientMessageId/
  );
  assert.match(
    screen,
    /uploadStatus:\s*'failed'/
  );
});
