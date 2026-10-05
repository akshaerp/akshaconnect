'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('V20 media options close when tapping outside the menu', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(viewer, /visible=\{menuOpen\}/);
  assert.match(viewer, /accessibilityLabel="Close image options"/);
  assert.match(viewer, /styles\.optionsModalBackdrop/);
  assert.match(viewer, /accessibilityLabel="Image options menu"/);
  assert.match(viewer, /event\.stopPropagation\(\)/);
  assert.match(
    viewer,
    /accessibilityLabel="Close image options"[\s\S]*onPress=\{\(\)\s*=>[\s\S]*setMenuOpen\([\s\S]*false[\s\S]*\)/
  );
});

test('V20 pinch zoom establishes a direct multi-touch baseline when second finger joins', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.doesNotMatch(viewer, /PanResponder/);
  assert.match(viewer, /function beginPinch/);
  assert.match(viewer, /touches\.length >= 2/);
  assert.match(viewer, /startDistance:\s*[\r\n\s]*distance/);
  assert.match(viewer, /startScale:\s*[\r\n\s]*scaleRef\.current/);
  assert.match(
    viewer,
    /distance\s*\/[\r\n\s]*gesture\.startDistance/
  );
  assert.match(viewer, /onTouchStart=\{/);
  assert.match(viewer, /onTouchMove=\{/);
  assert.match(viewer, /MAX_SCALE = 5/);
});

test('V20 double-tap zoom remains available alongside pinch zoom', () => {
  const viewer = read('apps/mobile/src/screens/ImageViewerModal.jsx');

  assert.match(viewer, /lastTapRef/);
  assert.match(viewer, /\? 1[\s\S]*: 2\.5/);
  assert.match(viewer, /Pinch or double-tap to zoom/);
});
