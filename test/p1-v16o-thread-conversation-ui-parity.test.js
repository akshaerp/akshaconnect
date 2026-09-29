'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

function parse(relative) {
  const source = read(relative);

  assert.doesNotThrow(() => {
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    });
  });

  return source;
}

function propsOf(source, prefix) {
  const start = source.indexOf(prefix);
  assert.ok(start >= 0);

  const open = source.indexOf('{', start);
  const close = source.indexOf('}) {', open);
  assert.ok(open >= 0 && close > open);

  return source
    .slice(open + 1, close)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

test('V16-O mobile sources pass real Babel JSX parsing', () => {
  parse('apps/mobile/src/screens/ConversationScreen.jsx');
  parse('apps/mobile/src/screens/ThreadModal.jsx');
});

test('V16-O preserves V16-N stable thread read callback', () => {
  const source = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(source, /onRead=\{handleThreadRead\}/);
  assert.doesNotMatch(
    source,
    /onRead=\{\(messageId\)\s*=>/
  );
});

test('V16-O ThreadMessage has exactly one current identity pair', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');
  const props = propsOf(source, 'function ThreadMessage({');

  assert.equal(
    props.filter((p) => p === 'currentMemberId').length,
    1
  );

  assert.equal(
    props.filter((p) => p === 'currentPrimaryEmail').length,
    1
  );
});

test('V16-O ThreadModal receives exactly one current identity pair', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');
  const props = propsOf(
    source,
    'export default function ThreadModal({'
  );

  assert.equal(
    props.filter((p) => p === 'currentMemberId').length,
    1
  );

  assert.equal(
    props.filter((p) => p === 'currentPrimaryEmail').length,
    1
  );
});

test('V16-O every ThreadMessage render gets both identity props once', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');
  const tags =
    source.match(/<ThreadMessage\b[\s\S]*?\/>/g) || [];

  assert.ok(tags.length >= 2);

  for (const tag of tags) {
    assert.equal(
      (
        tag.match(
          /currentMemberId=\{currentMemberId\}/g
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        tag.match(
          /currentPrimaryEmail=\{currentPrimaryEmail\}/g
        ) || []
      ).length,
      1
    );
  }
});

test('V16-O own thread replies resolve by membership or stable email', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(
    source,
    /sameIdentityValue\(\s*message\.sender_member_id,\s*currentMemberId\s*\)/
  );

  assert.match(
    source,
    /sameIdentityValue\(\s*message\.sender_primary_email,\s*currentPrimaryEmail\s*\)/
  );
});

test('V16-O keeps conversation-style own/right and other/left presentation', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(source, /styles\.v16oMessageRowOwn/);
  assert.match(source, /styles\.v16oMessageRowOther/);
  assert.match(source, /styles\.v16oMessageBubbleOwn/);
  assert.match(source, /styles\.v16oMessageBubbleOther/);
  assert.match(
    source,
    /own \? 'You' : message\.sender_display_name \|\| 'Member'/
  );
});

test('V16-O orphaned pre-fix ThreadMessage body is removed', () => {
  const source = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.doesNotMatch(
    source,
    /\}\) \{\s*const deleted = Boolean\(message\.deleted_at\);\s*const own =\s*message\.sender_type === 'HUMAN' &&\s*message\.sender_member_id === currentMemberId;/
  );
});
