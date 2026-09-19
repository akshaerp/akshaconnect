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

test('V4B3 mobile renders durable attachment metadata as actionable cards', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /Array\.isArray\(message\.attachments\)/
  );
  assert.match(
    screen,
    /item\.attachment_id/
  );

  assert.match(
    screen,
    /attachment\?\.file_name/
  );
  assert.match(
    screen,
    /attachmentFileName\(\s*item\s*\)/
  );

  assert.match(
    screen,
    /item\.size_bytes/
  );
  assert.match(
    screen,
    /Preview/
  );
  assert.match(
    screen,
    /Download/
  );
});

test('V4B3 mobile downloads through the authorized attachment endpoint into app cache', () => {
  const client = read(
    'apps/mobile/src/api/client.js'
  );

  assert.match(
    client,
    /export async function downloadAttachmentToCache/
  );
  assert.match(
    client,
    /authorization:\s*`Bearer \$\{token\}`/
  );
  assert.match(
    client,
    /fileCache:\s*true/
  );

  assert.ok(
    client.includes('/attachments/')
  );
  assert.ok(
    client.includes('/content')
  );
  assert.match(
    client,
    /encodeURIComponent\([\s\S]*attachmentId/
  );
});

test('V4B3 mobile previews images and opens other files without broad storage permissions', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );
  const manifest = read(
    'apps/mobile/android/app/src/main/AndroidManifest.xml'
  );

  assert.match(
    screen,
    /<Modal/
  );
  assert.match(
    screen,
    /<Image/
  );
  assert.match(
    screen,
    /actionViewIntent/
  );
  assert.match(
    screen,
    /MediaCollection[\s\S]*copyToMediaStore/
  );

  assert.doesNotMatch(
    manifest,
    /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/
  );
});

test('V4B3 web adds authenticated image, PDF and text preview while retaining download', () => {
  const app = read(
    'apps/web/src/App.jsx'
  );
  const styles = read(
    'apps/web/src/styles.css'
  );

  assert.match(
    app,
    /handlePreviewAttachment/
  );
  assert.match(
    app,
    /URL\.createObjectURL/
  );
  assert.match(
    app,
    /attachmentPreview\.kind === 'image'/
  );
  assert.match(
    app,
    /attachmentPreview\.kind === 'pdf'/
  );
  assert.match(
    app,
    /attachmentPreview\.kind === 'text'/
  );
  assert.match(
    app,
    /Preview is not available for this file type/
  );
  assert.match(
    app,
    /handleDownloadAttachment/
  );
  assert.match(
    styles,
    /V4B3 — attachment cards and preview/
  );
});
