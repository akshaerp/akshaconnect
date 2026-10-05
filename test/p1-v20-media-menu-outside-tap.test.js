'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V20 media menu dismisses immediately when tapping outside', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(viewer, /visible=\{menuOpen\}/);
  assert.match(viewer, /accessibilityLabel="Close image options"/);
  assert.match(viewer, /styles\.optionsModalBackdrop/);
  assert.match(viewer, /accessibilityLabel="Image options menu"/);
  assert.match(
    viewer,
    /accessibilityLabel="Image options menu"[\s\S]*event\.stopPropagation\(\)/
  );
  assert.match(
    viewer,
    /accessibilityLabel="Close image options"[\s\S]*onPress=\{\(\)\s*=>[\s\S]*setMenuOpen\([\s\S]*false[\s\S]*\)/
  );
});

test('V20 pinch implementation remains unchanged by menu dismissal fix', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.doesNotMatch(viewer, /PanResponder/);
  assert.match(viewer, /function beginPinch/);
  assert.match(viewer, /onTouchStart=\{/);
  assert.match(viewer, /onTouchMove=\{/);
  assert.match(viewer, /onTouchEnd=\{/);
  assert.match(viewer, /MAX_SCALE = 5/);
  assert.match(viewer, /Pinch or double-tap to zoom/);
});
