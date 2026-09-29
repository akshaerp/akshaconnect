'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

test('V16-Q Web ThreadPanel parses after isolated lifecycle fix', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.doesNotThrow(() => {
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    });
  });
});

test('V16-Q callback props are stored in refs and cannot retrigger thread loading', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.match(source, /const onApiFailureRef = useRef\(onApiFailure\);/);
  assert.match(source, /const onThreadActivityRef = useRef\(onThreadActivity\);/);

  assert.match(
    source,
    /onApiFailureRef\.current = onApiFailure;[\s\S]*onThreadActivityRef\.current = onThreadActivity;/
  );

  assert.match(
    source,
    /onThreadActivityRef\.current\?\.\(latest\.message_id\)/
  );

  assert.match(
    source,
    /onApiFailureRef\.current\?\.\(requestError\)/
  );
});

test('V16-Q initial thread load is keyed only by thread identity', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.match(
    source,
    /\}, \[token, conversationId, parentId\]\);/
  );

  assert.doesNotMatch(
    source,
    /\}, \[token, conversationId, parentId, parentMessage, onApiFailure, onThreadActivity\]\);/
  );
});

test('V16-Q realtime merge does not depend on callback identity', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.match(
    source,
    /onThreadActivityRef\.current\?\.\(message\.message_id\)/
  );

  assert.match(
    source,
    /\}, \[realtimeMessage, conversationId, parentId\]\);/
  );

  assert.doesNotMatch(
    source,
    /\}, \[realtimeMessage, conversationId, parentId, onThreadActivity\]\);/
  );
});

test('V16-Q main conversation source keeps the checkpoint UI structure', () => {
  const source = read('apps/web/src/App.jsx');

  assert.match(source, /className="conversation-body message-history"/);
  assert.match(source, /className="load-older-button"/);
  assert.match(source, /'Load older messages'/);
  assert.match(source, /className="composer-box active-composer"/);
  assert.doesNotMatch(source, /from '\.\/ChatMessage\.jsx'/);
  assert.doesNotMatch(source, /from '\.\/ChatComposer\.jsx'/);
});
