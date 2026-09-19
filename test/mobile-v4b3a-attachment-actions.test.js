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

test('V4B3A mobile reveals attachment actions only after tapping the card', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /expandedAttachmentId/
  );
  assert.match(
    screen,
    /onToggleAttachmentActions/
  );
  assert.match(
    screen,
    /expandedAttachmentId ===[\s\S]*item\.attachment_id/
  );
});

test('V4B3A mobile uses icon actions with accessible labels', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(screen, /👁/);
  assert.match(screen, /↗/);
  assert.match(screen, /⇩/);
  assert.match(screen, /📂/);

  assert.match(
    screen,
    /accessibilityLabel=[\s\S]*Preview/
  );
  assert.match(
    screen,
    /accessibilityLabel=[\s\S]*Download/
  );
});

test('V4B3A fixes Android document opening and exposes Downloads location', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /android\.intent\.action\.VIEW_DOWNLOADS/
  );
  assert.match(
    screen,
    /Linking\.sendIntent/
  );

  assert.doesNotMatch(
    screen,
    /actionViewIntent\([\s\S]{0,240}`Open \$\{/
  );
});

test('V4B3A remembers the MediaStore content URI after download for immediate open', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(
    screen,
    /const savedUri =[\s\S]*copyToMediaStore/
  );
  assert.match(
    screen,
    /setSavedAttachments/
  );
  assert.match(
    screen,
    /saved\.contentUri/
  );
});

test('V4B3A web keeps icon actions hidden until hover or keyboard focus', () => {
  const app = read('apps/web/src/App.jsx');
  const css = read('apps/web/src/styles.css');

  assert.match(app, /👁/);
  assert.match(app, /⇩/);
  assert.match(
    css,
    /\.attachment-card-actions[\s\S]*opacity:\s*0/
  );
  assert.match(
    css,
    /\.attachment-card:hover \.attachment-card-actions/
  );
  assert.match(
    css,
    /\.attachment-card:focus-within \.attachment-card-actions/
  );
});
