'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

test('V16-R Web ThreadPanel parses after UI parity enhancement', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.doesNotThrow(() => {
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    });
  });
});

test('V16-R preserves V16-Q flicker fix contract', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');

  assert.match(source, /const onApiFailureRef = useRef\(onApiFailure\);/);
  assert.match(source, /const onThreadActivityRef = useRef\(onThreadActivity\);/);
  assert.match(source, /\}, \[token, conversationId, parentId\]\);/);
  assert.match(source, /\}, \[realtimeMessage, conversationId, parentId\]\);/);

  assert.doesNotMatch(
    source,
    /\}, \[token, conversationId, parentId, parentMessage, onApiFailure, onThreadActivity\]\);/
  );

  assert.doesNotMatch(
    source,
    /\}, \[realtimeMessage, conversationId, parentId, onThreadActivity\]\);/
  );
});

test('V16-R thread replies visually distinguish own/right from other/left', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');
  const css = read('apps/web/src/threadPanel.css');

  assert.match(source, /message\.sender_member_id === currentMemberId/);
  assert.match(source, /own\s*\?\s*'You'/);
  assert.match(source, /thread-message-own/);
  assert.match(source, /thread-message-other/);

  assert.match(css, /\.thread-message-own\s*\{\s*justify-content:\s*flex-end;/s);
  assert.match(css, /\.thread-message-other\s*\{\s*justify-content:\s*flex-start;/s);
  assert.match(css, /\.thread-message-own:not\(\.thread-parent-message\) \.thread-message-bubble/);
});

test('V16-R thread composer follows main-chat interaction language', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');
  const css = read('apps/web/src/threadPanel.css');

  assert.match(source, /className="thread-composer-box"/);
  assert.match(source, /😊 Emoji/);
  assert.match(source, /＋ File/);
  assert.match(source, /Enter to send · Shift\+Enter for new line/);
  assert.match(source, /THREAD_COMPOSER_EMOJIS/);
  assert.match(source, /className="thread-send-button"/);

  assert.match(css, /\.thread-composer-box\s*\{/);
  assert.match(css, /\.thread-emoji-picker\s*\{/);
  assert.match(css, /\.thread-send-button\s*\{/);
});

test('V16-R parent stays context while replies remain in thread sidebar', () => {
  const source = read('apps/web/src/ThreadPanel.jsx');
  const app = read('apps/web/src/App.jsx');

  assert.match(source, /parent\s*\?/);
  assert.match(source, /thread-parent-message/);
  assert.match(source, /<div className="thread-replies"/);

  assert.match(app, /if \(event\.message\.reply_to_message_id\) \{/);
  assert.match(app, /thread_reply_count/);
  assert.match(app, /setThreadParent\(message\)/);
});

test('V16-R does not replace the main-chat composer or message renderer', () => {
  const app = read('apps/web/src/App.jsx');

  assert.match(app, /className="conversation-body message-history"/);
  assert.match(app, /className="composer-box active-composer"/);
  assert.match(app, /className=\{`message-row /);
  assert.doesNotMatch(app, /from '\.\/ChatMessage\.jsx'/);
  assert.doesNotMatch(app, /from '\.\/ChatComposer\.jsx'/);
});
