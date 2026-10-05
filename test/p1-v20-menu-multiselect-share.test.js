'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V20 image options outer pressable owns outside tap and inner menu stops propagation', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(
    viewer,
    /visible=\{menuOpen\}[\s\S]*accessibilityLabel="Close image options"[\s\S]*onPress=\{\(\)\s*=>[\s\S]*setMenuOpen/
  );

  assert.match(
    viewer,
    /accessibilityLabel="Image options menu"/
  );

  assert.match(
    viewer,
    /onPressIn=\{\(event\)\s*=>[\s\S]*event\.stopPropagation\(\)/
  );

  assert.match(
    viewer,
    /styles\.optionsModalBackdrop/
  );
});

test('V20 inbound share requires explicit Send after multi-recipient selection', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /selectedKeys/);
  assert.match(app, /toggleInboundShareTarget/);
  assert.match(app, /selectedKeys\.includes\(\s*target\.key\s*\)/);
  assert.match(app, /onSend\(/);
  assert.match(app, /Send \(\$\{selectedKeys\.length\}\)/);
  assert.doesNotMatch(app, /onTarget=\{sendInboundShare\}/);
});

test('V20 inbound share sends all selected recipients only after Send', () => {
  const app = read('apps/mobile/App.jsx');

  const handler = app.slice(
    app.indexOf('const sendInboundShare = useCallback'),
    app.indexOf('const clearAuthenticatedState = useCallback')
  );

  assert.match(handler, /Array\.isArray\(targets\)/);
  assert.match(handler, /selectedTargets/);
  assert.match(handler, /for\s*\(\s*const target of\s*selectedTargets\s*\)/);
  assert.match(handler, /for\s*\(\s*const file of\s*inboundShare\.files\.slice\(\s*0,\s*4\s*\)\s*\)/);
  assert.match(handler, /uploadAttachment/);
});

test('V20 previously fixed streaming share and pinch remain present', () => {
  const main = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  const mainShare = main.slice(
    main.indexOf('async function handleSharePreviewAttachment'),
    main.indexOf('async function handleForwardPreviewAttachment')
  );

  const threadShare = thread.slice(
    thread.indexOf('async function shareThreadPreview'),
    thread.indexOf('function insertThreadEmoji')
  );

  assert.match(mainShare, /shareRemoteImage/);
  assert.doesNotMatch(mainShare, /downloadAttachmentToCache/);

  assert.match(threadShare, /shareRemoteImage/);
  assert.doesNotMatch(threadShare, /downloadAttachmentToCache/);

  assert.match(viewer, /onTouchStart=\{/);
  assert.match(viewer, /onTouchMove=\{/);
  assert.match(viewer, /MAX_SCALE = 5/);
});
